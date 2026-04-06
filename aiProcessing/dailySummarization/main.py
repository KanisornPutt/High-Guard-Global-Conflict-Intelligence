import boto3
import json
import os
import time
import urllib.request
from datetime import datetime, timedelta
from collections import Counter
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Attr

#  Clients 
bedrock_agent   = boto3.client("bedrock-agent",   region_name="ap-northeast-1")
bedrock_runtime = boto3.client("bedrock-runtime", region_name="ap-northeast-1")
dynamodb        = boto3.resource("dynamodb",       region_name="ap-southeast-1")
sns             = boto3.client("sns",              region_name="ap-southeast-1")
news_table      = dynamodb.Table("newsSummary")

#  Config 
PROMPT_ARN             = os.environ.get("DIGEST_PROMPT_ARN")
MODEL_ID               = os.environ.get("MODEL_ID", "google.gemma-3-27b-it")
DISCORD_URL            = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
SNS_TOPIC_ARN          = os.environ.get("SNS_TOPIC_ARN")
TOP_N_COUNTRIES        = int(os.environ.get("TOP_N_COUNTRIES", "3"))
MAX_EVENTS_PER_COUNTRY = int(os.environ.get("MAX_EVENTS_PER_COUNTRY", "5"))

#  Severity helpers 
SEVERITY_EMOJI = {1: "🟢", 2: "🟡", 3: "🟠", 4: "🔴", 5: "🚨"}

def severity_to_threat(severity: int) -> str:
    return {1: "LOW", 2: "LOW", 3: "MODERATE", 4: "HIGH", 5: "CRITICAL"}.get(severity, "LOW")

#  Prompt Management 
def get_system_prompt() -> str:
    parts     = PROMPT_ARN.split(":")
    prompt_id = parts[-2].split("/")[-1]
    version   = parts[-1]
    response  = bedrock_agent.get_prompt(
        promptIdentifier=prompt_id,
        promptVersion=version
    )
    variants = response.get("variants", [])
    if not variants:
        raise Exception("No prompt variants found")
    print("Fetched digest prompt version " + version)
    return variants[0]["templateConfiguration"]["text"]["text"]

#  Data Fetching 
def get_high_priority_news(hours: int = 24) -> list:
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
    response = news_table.scan(
        FilterExpression=(
            Attr("priority").eq("high") | Attr("priority").eq("HIGH")
        ) & Attr("timeStamp").gte(cutoff)
    )
    items = response.get("Items", [])
    while "LastEvaluatedKey" in response:
        response = news_table.scan(
            FilterExpression=(
                Attr("priority").eq("high") | Attr("priority").eq("HIGH")
            ) & Attr("timeStamp").gte(cutoff),
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        items.extend(response.get("Items", []))
    print("Total high priority articles in last 24h: " + str(len(items)))
    return items

def get_top_countries(events: list, top_n: int = 3) -> list:
    country_counts = Counter(event.get("country", "Unknown") for event in events)
    top_countries  = [c for c, _ in country_counts.most_common(top_n)]
    print(" Event count per country:")
    for country, count in country_counts.most_common():
        marker = " ← selected" if country in top_countries else ""
        print("    " + country + ": " + str(count) + " events" + marker)
    return top_countries

def filter_events_by_countries(events: list, countries: list, max_per_country: int = 5) -> dict:
    grouped = {}
    for country in countries:
        country_events = [e for e in events if e.get("country") == country]
        country_events.sort(key=lambda x: x.get("severity", 0), reverse=True)
        grouped[country] = country_events[:max_per_country]
        print(country + ": using " + str(len(grouped[country])) + " of " + str(len(country_events)) + " events")
    return grouped

#  Format for Prompt 
def format_grouped_events(grouped_events: dict, all_events: list) -> str:
    total_high   = len(all_events)
    country_list = list(grouped_events.keys())
    lines        = []

    lines.append("=== GLOBAL OVERVIEW ===")
    lines.append("Total high-priority events worldwide: " + str(total_high))
    lines.append("Top hotspot countries: " + ", ".join(country_list))
    lines.append("")

    for country, events in grouped_events.items():
        lines.append("=== " + country.upper() + " (" + str(len(events)) + " events) ===")
        for i, event in enumerate(events, 1):
            lines.append(
                f"  Event {i}:\n"
                f"    Timestamp:     {event.get('timeStamp',        'unknown')}\n"
                f"    Category:      {event.get('category',         'other')}\n"
                f"    Severity:      {event.get('severity',         1)}/5\n"
                f"    Summarization: {event.get('newSummarization', '')}\n"
            )
        lines.append("")
    return "\n".join(lines)

#  Bedrock Call 
def call_bedrock(grouped_events: dict, all_events: list) -> list:
    """
    Call Gemma and return a normalised list of per-country digest dicts.
    Gemma may return a single dict OR a list — we handle both.
    """
    system_prompt = get_system_prompt()
    events_text   = format_grouped_events(grouped_events, all_events)
    today         = datetime.utcnow().strftime("%Y-%m-%d")

    estimated_tokens = len(events_text.split()) * 1.3
    print("Estimated input tokens: ~" + str(int(estimated_tokens)))

    request_body = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"Today's date: {today}\n\n"
                    f"Analyze the following high-priority conflict events "
                    f"focusing on the top {TOP_N_COUNTRIES} most active countries.\n\n"
                    f"{events_text}\n\n"
                    f"Generate the daily digest in JSON only."
                )
            }
        ],
        "max_tokens":  1000,
        "temperature": 0.2,
        "top_p":       0.9
    }

    for attempt in range(3):
        try:
            response      = bedrock_runtime.invoke_model(
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

            # Strip markdown fences if present
            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()

            if not raw_text:
                raise ValueError("Empty response from Gemma")

            parsed = json.loads(raw_text)

            # Normalise: always return a list of country dicts
            if isinstance(parsed, list):
                digests = parsed
            elif isinstance(parsed, dict) and "country" in parsed:
                # Single country response
                digests = [parsed]
            elif isinstance(parsed, dict) and "countries" in parsed:
                # Global wrapper with countries array
                digests = parsed["countries"]
            else:
                # Unknown structure — wrap it so we don't crash
                digests = [parsed]

            print("=== DAILY DIGEST RESULT ===")
            print(json.dumps(digests, indent=2))
            print("===========================")
            return digests

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            print("Attempt " + str(attempt + 1) + " failed: " + error_code)
            if error_code == "ThrottlingException" and attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise
        except (KeyError, ValueError, json.JSONDecodeError) as e:
            print("Parse error: " + str(e))
            raise

#  Notifications 
def build_messages(digests: list, total_events: int, today: str):
    """
    Build Discord and SNS message bodies from a list of country digest dicts.
    Works with Gemma's actual output fields:
      country, situation_summary, key_events, overall_severity,
      dominant_category, trend, high_priority_count
    """
    # Overall threat level = highest severity across all countries
    max_severity  = max((d.get("overall_severity", 1) for d in digests), default=1)
    threat_level  = severity_to_threat(max_severity)
    threat_emoji  = SEVERITY_EMOJI.get(max_severity, "🟢")

    top_countries = [d.get("country", "Unknown") for d in digests]

    #  Discord (supports markdown) 
    discord_lines = [
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "🌍 **HIGH GUARD Daily Digest**",
        "📅 " + today + " | 08:00 ICT",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        threat_emoji + " **Threat Level: " + threat_level + "**",
        "📊 **" + str(total_events) + " high-priority event(s) worldwide**",
        "🔥 **Top Hotspots:** " + ", ".join(top_countries),
        "",
        "**🗺️ Top Country Situations:**",
    ]

    for d in digests:
        country  = d.get("country", "Unknown")
        severity = d.get("overall_severity", 1)
        emoji    = SEVERITY_EMOJI.get(severity, "🟢")
        category = d.get("dominant_category", "other").replace("_", " ").title()
        trend    = d.get("trend", "stable").capitalize()
        summary  = d.get("situation_summary", "No summary available.")
        events   = d.get("key_events", [])

        discord_lines.append("")
        discord_lines.append(emoji + " **" + country + "** | " + category + " | Trend: " + trend)
        discord_lines.append("> " + summary)
        for ev in events:
            discord_lines.append("  • " + ev)

    # Global assessment
    if max_severity <= 2:
        global_assessment = "Situation remains broadly stable. Monitor flagged regions for escalation."
    elif max_severity == 3:
        global_assessment = "Moderate tensions detected. Recommend increased monitoring."
    else:
        global_assessment = "High-severity events detected. Immediate review recommended."

    discord_lines += [
        "",
        "**📝 Global Assessment:**",
        global_assessment,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    ]
    discord_message = "\n".join(discord_lines)

    #  SNS email (plain text) 
    email_lines = [
        "HIGH GUARD — Daily Conflict Intelligence Digest",
        "Date: " + today,
        "Threat Level: " + threat_level,
        "---------------------------",
        "",
        "Total high-priority events: " + str(total_events),
        "Top Hotspots: " + ", ".join(top_countries),
        "",
        "TOP COUNTRY SITUATIONS:",
        "",
    ]

    for d in digests:
        country  = d.get("country", "Unknown")
        severity = d.get("overall_severity", 1)
        category = d.get("dominant_category", "other").replace("_", " ").title()
        trend    = d.get("trend", "stable").capitalize()
        summary  = d.get("situation_summary", "No summary available.")
        events   = d.get("key_events", [])

        email_lines.append("[ " + country + " ] Severity: " + str(severity) + "/5 | " + category + " | Trend: " + trend)
        email_lines.append(summary)
        for ev in events:
            email_lines.append("  - " + ev)
        email_lines.append("")

    email_lines += [
        "---------------------------",
        "GLOBAL ASSESSMENT:",
        global_assessment,
        "---------------------------",
        "This is an automated report from HIGH GUARD.",
    ]
    email_message = "\n".join(email_lines)

    return discord_message, email_message, threat_level

def send_to_discord(message: str) -> None:
    if not DISCORD_URL:
        print("⚠️ DISCORD_WEBHOOK_URL not set — skipping Discord")
        return
    # Guard against markdown underscores accidentally left in env var
    clean_url = DISCORD_URL.strip().strip("_")
    payload   = json.dumps({"content": message}).encode()
    req       = urllib.request.Request(
        clean_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print("✅ Discord notification sent — status: " + str(resp.status))
    except Exception as e:
        print("❌ Discord send failed: " + str(e))

def send_to_sns(subject: str, message: str) -> None:
    if not SNS_TOPIC_ARN:
        print("⚠️ SNS_TOPIC_ARN not set — skipping SNS")
        return
    try:
        sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=message)
        print("✅ SNS email notification sent")
    except Exception as e:
        print("❌ SNS send failed: " + str(e))

#  Lambda Handler 
def lambda_handler(event, context):
    print(" HIGH GUARD Daily Digest starting ")
    today = datetime.utcnow().strftime("%Y-%m-%d")

    # Step 1 — Fetch high-priority news
    all_high_priority = get_high_priority_news(hours=24)

    if not all_high_priority:
        print("No high priority events found today")
        no_event_msg = (
            "🌍 **HIGH GUARD Daily Digest — " + today + "**\n"
            "✅ No high-priority conflict events in the last 24 hours.\n"
            "Global situation is calm."
        )
        send_to_discord(no_event_msg)
        send_to_sns(
            "HIGH GUARD Daily Digest — " + today + " | Threat: CALM",
            "HIGH GUARD — " + today + "\nNo high-priority events in the last 24 hours."
        )
        return {"statusCode": 200, "date": today, "message": "No high priority events today"}

    # Step 2 — Top countries
    top_countries = get_top_countries(all_high_priority, top_n=TOP_N_COUNTRIES)

    # Step 3 — Filter events (token reduction)
    grouped_events    = filter_events_by_countries(all_high_priority, top_countries, max_per_country=MAX_EVENTS_PER_COUNTRY)
    total_events_used = sum(len(v) for v in grouped_events.values())
    print("Token reduction: using " + str(total_events_used) + " of " + str(len(all_high_priority)) + " total events")

    # Step 4 — Bedrock
    digests = call_bedrock(grouped_events, all_high_priority)

    # Step 5 — Build messages and send
    discord_message, email_message, threat_level = build_messages(digests, len(all_high_priority), today)

    send_to_discord(discord_message)
    send_to_sns(
        "HIGH GUARD Daily Digest — " + today + " | Threat: " + threat_level,
        email_message
    )

    print(" HIGH GUARD Daily Digest complete ")
    return {
        "statusCode":    200,
        "date":          today,
        "threat_level":  threat_level,
        "total_events":  len(all_high_priority),
        "top_countries": top_countries,
        "events_used":   total_events_used,
    }