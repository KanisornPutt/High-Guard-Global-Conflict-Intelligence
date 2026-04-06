import boto3
import json
import os
import time
import uuid
from datetime import datetime
from botocore.exceptions import ClientError

#  Clients 
# Bedrock stays in Tokyo — only region with Gemma 3 27B
bedrock_agent   = boto3.client("bedrock-agent",   region_name="ap-northeast-1")
bedrock_runtime = boto3.client("bedrock-runtime", region_name="ap-northeast-1")

# DynamoDB in Singapore — same region as Lambda
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table    = dynamodb.Table(os.environ.get("DYNAMODB_TABLE", "newsSummary"))

#  Config 
PROMPT_ARN = os.environ.get("PROMPT_ARN")
MODEL_ID   = os.environ.get("MODEL_ID", "google.gemma-3-27b-it")


#  Prompt Management 
def parse_prompt_arn(arn: str):
    """Extract prompt ID and version from ARN"""
    parts       = arn.split(":")
    prompt_part = parts[-2]
    version     = parts[-1]
    prompt_id   = prompt_part.split("/")[-1]
    return prompt_id, version


def get_system_prompt() -> str:
    """Fetch system prompt from Bedrock Prompt Management"""

    prompt_id, version = parse_prompt_arn(PROMPT_ARN)

    response = bedrock_agent.get_prompt(
        promptIdentifier=prompt_id,
        promptVersion=version
    )

    variants = response.get("variants", [])
    if not variants:
        raise Exception("No prompt variants found in Prompt Management")

    template_text = variants[0]["templateConfiguration"]["text"]["text"]
    print("Fetched prompt version " + version + " from Prompt Management")
    return template_text


#  Article Builder 
def build_article_text(body: dict) -> str:
    """
    Build article text from SQS message fields.
    Fetcher sends: title, description, source, publishedAt
    No full article body — combine available fields.
    """

    title       = body.get("title",       "")
    description = body.get("description", "")
    source      = body.get("source",      "")
    published   = body.get("publishedAt", "")

    article_text = (
        f"Title: {title}\n"
        f"Source: {source}\n"
        f"Published: {published}\n\n"
        f"{description}"
    )

    return article_text.strip()


#  Bedrock Call 
def call_bedrock(article_text: str) -> dict:
    """Call Gemma 3 27B to classify and summarize article"""

    system_prompt = get_system_prompt()

    request_body = {
        "messages": [
            {
                "role": "system",
                "content": system_prompt                                         # Rules from Prompt Management
            },
            {
                "role": "user",
                "content": "Classify this article:\n\n" + article_text[:3000]   # Article from SQS
            }
        ],
        "max_tokens":  500,
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

            # Clean markdown code blocks if present
            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()

            if not raw_text:
                raise ValueError("Gemma returned empty response")

            classified = json.loads(raw_text)

            print("=== CLASSIFIED RESULT ===")
            print(json.dumps(classified, indent=2))
            print("=========================")

            return classified

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            print("Attempt " + str(attempt + 1) + " failed: " + error_code)
            if error_code == "ThrottlingException" and attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise

        except (KeyError, ValueError, json.JSONDecodeError) as e:
            print("Parse error: " + str(e))
            print("Raw response: " + str(response_body if "response_body" in locals() else "N/A"))
            raise


#  DynamoDB Save 
def save_to_dynamodb(classified: dict, body: dict) -> str:
    """
    Save classified result to DynamoDB newsSummary table.
    Fields: newSummarization, articleURL, country, timeStamp, priority
    """

    event_id  = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()

    item = {
        #  Keys 
        "eventId":          event_id,
        "timeStamp":        timestamp,

        #  From Bedrock classification 
        "newSummarization": classified.get("summary",  ""),
        "country":          classified.get("country",  body.get("country", "Unknown")),
        "priority":         classified.get("priority", "low"),
        "category":         classified.get("category", "other"),
        "severity":         classified.get("severity", 1),

        #  From SQS message (fetcher) 
        "articleURL":       body.get("url",         ""),
        "title":            body.get("title",        ""),
        "source":           body.get("source",       ""),
        "publishedAt":      body.get("publishedAt",  ""),
        # "lat":              str(body.get("lat",  0)),
        # "long":             str(body.get("long", 0)),
        "fetchedAt":        body.get("fetchedAt",    timestamp),

        #  Tracking 
        # "model":            MODEL_ID,
        # "promptArn":        PROMPT_ARN
    }

    table.put_item(Item=item)

    print("✅ Saved to DynamoDB:")
    print("   eventId:          " + event_id)
    print("   country:          " + item["country"])
    print("   priority:         " + item["priority"])
    print("   category:         " + item["category"])
    print("   severity:         " + str(item["severity"]))
    print("   articleURL:       " + item["articleURL"])
    print("   newSummarization: " + item["newSummarization"][:80] + "...")

    return event_id


#  Lambda Handler 
def lambda_handler(event, context):

    records = event.get("Records", [])

    #  Direct Test (no SQS) 
    if not records:
        test_body = {
            "url":         event.get("url",         "test-url"),
            "title":       event.get("title",        ""),
            "description": event.get("description",  event.get("text", "")),
            "source":      event.get("source",       "test"),
            "country":     event.get("country",      "Unknown"),
            "publishedAt": event.get("publishedAt",   ""),
            "fetchedAt":   datetime.utcnow().isoformat()
        }

        if not test_body["title"] and not test_body["description"]:
            return {
                "statusCode": 400,
                "message":    "Provide title or description in test event"
            }

        article_text = build_article_text(test_body)
        classified   = call_bedrock(article_text)
        event_id     = save_to_dynamodb(classified, test_body)

        return {
            "statusCode": 200,
            "eventId":    event_id,
            "result":     classified
        }

    #  SQS Trigger 
    success = 0
    failed  = 0

    for record in records:
        article_url = "unknown"
        try:
            body        = json.loads(record["body"])
            article_url = body.get("url", "unknown")

            print(" Processing: " + article_url)

            article_text = build_article_text(body)

            if not article_text.strip():
                print("⚠️  Empty article — skipping: " + article_url)
                continue

            classified = call_bedrock(article_text)
            save_to_dynamodb(classified, body)

            success += 1
            print("✅ Done: " + article_url)

        except Exception as e:
            failed += 1
            print("❌ Failed [" + article_url + "]: " + str(e))
            raise  # Returns message to SQS for retry

    print(" Summary: success=" + str(success) + " failed=" + str(failed))
    return {
        "statusCode": 200,
        "success":    success,
        "failed":     failed
    }