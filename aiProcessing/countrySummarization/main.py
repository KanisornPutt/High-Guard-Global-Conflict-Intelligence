import boto3
import json
import os
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Attr

# ─── Clients ──────────────────────────────────────────────────────────────────
bedrock_agent   = boto3.client("bedrock-agent",   region_name="ap-northeast-1")
bedrock_runtime = boto3.client("bedrock-runtime", region_name="ap-northeast-1")
dynamodb        = boto3.resource("dynamodb",       region_name="ap-southeast-1")  # Singapore

news_table    = dynamodb.Table("newsSummary")      # Source — articles from Summary 01
country_table = dynamodb.Table("countrySummary")   # Target — country briefings

PROMPT_ARN = os.environ.get("COUNTRY_PROMPT_ARN")
MODEL_ID   = os.environ.get("MODEL_ID", "google.gemma-3-27b-it")


# ─── Decimal Serializer ───────────────────────────────────────────────────────
class DecimalEncoder(json.JSONEncoder):
    """DynamoDB returns Decimals — convert to int or float for JSON."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


def json_dumps(obj) -> str:
    return json.dumps(obj, cls=DecimalEncoder)


# ─── Prompt Management ────────────────────────────────────────────────────────
def get_system_prompt() -> str:
    parts     = PROMPT_ARN.split(":")
    prompt_id = parts[-2].split("/")[-1]
    version   = parts[-1]

    response      = bedrock_agent.get_prompt(
        promptIdentifier=prompt_id,
        promptVersion=version
    )
    variants      = response.get("variants", [])
    if not variants:
        raise Exception("No prompt variants found")

    template_text = variants[0]["templateConfiguration"]["text"]["text"]
    print("Fetched country prompt version " + version)
    return template_text


# ─── DynamoDB — Country Summary ───────────────────────────────────────────────
def get_existing_country_summary(country: str) -> dict:
    """
    Check if country summary exists in countrySummary table.
    Returns most recent summary or None if not found.
    """

    response = country_table.query(
        KeyConditionExpression="country = :c",
        ExpressionAttributeValues={":c": country},
        ScanIndexForward=False,   # newest first
        Limit=1
    )

    items = response.get("Items", [])
    if items:
        print("Found existing summary for " + country + " — lastUpdated: " + items[0].get("lastUpdated", "unknown"))
        return items[0]

    print("No existing summary for " + country)
    return None


def update_last_checked(country: str, last_updated: str) -> None:
    """
    Update lastChecked timestamp without regenerating summary.
    Used when no new news is found.
    """

    country_table.update_item(
        Key={
            "country":     country,
            "lastUpdated": last_updated
        },
        UpdateExpression="SET lastChecked = :ts",
        ExpressionAttributeValues={
            ":ts": datetime.utcnow().isoformat()
        }
    )
    print("Updated lastChecked for " + country)


def save_country_summary(country: str, summary: dict) -> None:
    """Save new country summary to DynamoDB"""

    timestamp = datetime.utcnow().isoformat()

    item = {
        "country":            country,
        "lastUpdated":        timestamp,
        "lastChecked":        timestamp,
        "situation_summary":  summary.get("situation_summary",  ""),
        "dominant_category":  summary.get("dominant_category",  "other"),
        "overall_severity":   summary.get("overall_severity",   1),
        "trend":              summary.get("trend",              "stable"),
        "total_events":       summary.get("total_events",       0),
        "high_priority_count":summary.get("high_priority_count",0),
        "key_events":         summary.get("key_events",         []),
        "promptArn":          PROMPT_ARN,
        "model":              MODEL_ID
    }

    country_table.put_item(Item=item)
    print("✅ Saved country summary for: " + country)


# ─── DynamoDB — News Summary ──────────────────────────────────────────────────
def get_recent_news(country: str, hours: int = 24) -> list:
    """
    Get all news articles for a country from last N hours
    from newsSummary table.
    """

    cutoff    = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    response  = news_table.scan(
        FilterExpression=Attr("country").eq(country) & Attr("timeStamp").gte(cutoff)
    )

    items = response.get("Items", [])

    # Handle DynamoDB pagination
    while "LastEvaluatedKey" in response:
        response = news_table.scan(
            FilterExpression=Attr("country").eq(country) & Attr("timeStamp").gte(cutoff),
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        items.extend(response.get("Items", []))

    # Sort oldest first — important for trend analysis
    items.sort(key=lambda x: x.get("timeStamp", ""))

    print("Found " + str(len(items)) + " articles for " + country + " in last " + str(hours) + "h")
    return items


def check_new_news_after(country: str, after_timestamp: str) -> bool:
    """
    Check if any new articles exist in newsSummary
    after the given timestamp for this country.
    Returns True if new news found, False otherwise.
    """

    response = news_table.scan(
        FilterExpression=Attr("country").eq(country) & Attr("timeStamp").gt(after_timestamp),
        Limit=1   # Only need to find one to know new news exists
    )

    has_new = len(response.get("Items", [])) > 0
    print("New news after " + after_timestamp + " for " + country + ": " + str(has_new))
    return has_new


# ─── Format Events ────────────────────────────────────────────────────────────
def format_events_for_prompt(events: list) -> str:
    """Format news articles into readable text for Gemma"""

    if not events:
        return "No events found."

    lines = []
    for i, event in enumerate(events, 1):
        line = (
            f"Event {i}:\n"
            f"  Timestamp:       {event.get('timeStamp',        'unknown')}\n"
            f"  Category:        {event.get('category',         'other')}\n"
            f"  Severity:        {event.get('severity',         1)}/5\n"
            f"  Priority:        {event.get('priority',         'low')}\n"
            f"  Summarization:   {event.get('newSummarization', '')}\n"
        )
        lines.append(line)

    return "\n".join(lines)


# ─── Bedrock Call ─────────────────────────────────────────────────────────────
def call_bedrock(country: str, events: list) -> dict:
    """Call Gemma to generate country intelligence briefing"""

    system_prompt = get_system_prompt()
    events_text   = format_events_for_prompt(events)

    request_body = {
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": (
                    f"Country: {country}\n\n"
                    f"Total events: {len(events)}\n\n"
                    f"Conflict events (oldest to newest):\n\n"
                    f"{events_text}\n\n"
                    f"Generate the country intelligence briefing in JSON only."
                )
            }
        ],
        "max_tokens":  800,
        "temperature": 0.1,
        "top_p":       0.9
    }

    for attempt in range(3):
        try:
            response = bedrock_runtime.invoke_model(
                modelId=MODEL_ID,
                body=json.dumps(request_body),
                contentType="application/json",
                accept="application/json"
            )

            response_body = json.loads(response["body"].read())
            raw_text      = response_body["choices"][0]["message"]["content"].strip()

            print("=== RAW TEXT FROM GEMMA ===")
            print(raw_text)
            print("===========================")

            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()

            if not raw_text:
                raise ValueError("Gemma returned empty response")

            result = json.loads(raw_text)

            print("=== COUNTRY SUMMARY RESULT ===")
            print(json.dumps(result, indent=2))
            print("==============================")

            return result

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            print("Attempt " + str(attempt+1) + " failed: " + error_code)
            if error_code == "ThrottlingException" and attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise
        except (KeyError, ValueError, json.JSONDecodeError) as e:
            print("Parse error: " + str(e))
            print("Raw response: " + str(response_body if 'response_body' in locals() else 'N/A'))
            raise


# ─── Core Logic ───────────────────────────────────────────────────────────────
def process_country(country: str) -> dict:
    """
    Smart country summary logic:

    1. Check if country summary exists in DB
       ├── NO  → get last 24h news → summarize → save → return
       └── YES → check for new news after last update
                 ├── YES new news → get last 24h news → summarize → save → return
                 └── NO new news  → update lastChecked → return existing summary
    """

    print("─── Processing country: " + country)

    # ── Step 1: Check existing summary ────────────────────────────────────────
    existing = get_existing_country_summary(country)

    # ── Step 2a: No existing summary — generate fresh ─────────────────────────
    if not existing:
        print("📋 No existing summary — generating fresh summary")

        news = get_recent_news(country, hours=24)

        if not news:
            return {
                "country": country,
                "message": "No news found in last 24h for " + country
            }

        summary = call_bedrock(country, news)
        save_country_summary(country, summary)

        return {
            "country":      country,
            "action":       "generated_fresh",
            "events_count": len(news),
            "result":       summary
        }

    # ── Step 2b: Existing summary found — check for new news ──────────────────
    last_updated = existing.get("lastUpdated", "")
    print("📋 Existing summary found — checking for new news after: " + last_updated)

    has_new_news = check_new_news_after(country, last_updated)

    # ── Step 3a: New news found — regenerate summary ───────────────────────────
    if has_new_news:
        print("🔄 New news found — regenerating summary")

        news = get_recent_news(country, hours=24)

        if not news:
            return {
                "country": country,
                "message": "No news in last 24h despite new articles detected"
            }

        summary = call_bedrock(country, news)
        save_country_summary(country, summary)

        return {
            "country":      country,
            "action":       "regenerated",
            "events_count": len(news),
            "result":       summary
        }

    # ── Step 3b: No new news — return existing and update lastChecked ──────────
    print("✅ No new news — returning existing summary")
    update_last_checked(country, last_updated)

    return {
        "country":      country,
        "action":       "returned_existing",
        "last_updated": last_updated,
        "result":       existing  # ← contains Decimals — handled by DecimalEncoder
    }


# ─── Response Helper ──────────────────────────────────────────────────────────
def ok(body: dict) -> dict:
    return {
        "statusCode": 200,
        "headers":    {"Content-Type": "application/json"},
        "body":       json_dumps(body),   # DecimalEncoder handles DynamoDB types
    }

def err(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers":    {"Content-Type": "application/json"},
        "body":       json_dumps({"message": message}),
    }


# ─── Lambda Handler ───────────────────────────────────────────────────────────
def lambda_handler(event, context):

    # ── Unwrap Function URL / API Gateway HTTP body ────────────────────────
    if "body" in event:
        try:
            event = json.loads(event["body"])
        except (json.JSONDecodeError, TypeError):
            return err(400, "Invalid JSON body")

    records = event.get("Records", [])

    # ── Direct Test / Function URL ────────────────────────────────────────
    if not records:
        country = event.get("country", "")

        if not country:
            return err(400, "Please provide a country in the test event")

        result = process_country(country)
        return ok(result)   # ← always wrapped + Decimal-safe

    # ── SQS Trigger ───────────────────────────────────────────────────────
    success = 0
    failed  = 0
    country = ""

    for record in records:
        try:
            body    = json.loads(record["body"])
            country = body.get("country", "")

            if not country:
                print("No country in SQS message — skipping")
                continue

            process_country(country)
            success += 1

        except Exception as e:
            print("❌ Failed for " + country + ": " + str(e))
            failed += 1
            raise

    print("Done — success: " + str(success) + " failed: " + str(failed))
    return ok({"success": success, "failed": failed})