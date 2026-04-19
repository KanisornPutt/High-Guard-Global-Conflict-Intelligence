import boto3
import json
from datetime import datetime, timedelta
from decimal import Decimal
from boto3.dynamodb.conditions import Attr

# ─── Clients ──────────────────────────────────────────────────────────────────
dynamodb   = boto3.resource("dynamodb", region_name="ap-southeast-1")
news_table = dynamodb.Table("newsSummary")


# ─── Decimal Serializer ───────────────────────────────────────────────────────
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


def json_dumps(obj) -> str:
    return json.dumps(obj, cls=DecimalEncoder)


# ─── Response Helpers ─────────────────────────────────────────────────────────
CORS_HEADERS = {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":"content-type",
    "Access-Control-Allow-Methods":"GET, OPTIONS",
}

def ok(body) -> dict:
    return {
        "statusCode": 200,
        "headers":    CORS_HEADERS,
        "body":       json_dumps(body),
    }

def err(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers":    CORS_HEADERS,
        "body":       json_dumps({"message": message}),
    }


# ─── Core Logic ───────────────────────────────────────────────────────────────
def get_country_news(country: str, hours: int = 24) -> list:
    cutoff   = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    scan_kwargs = {
        "FilterExpression": Attr("country").eq(country) & Attr("timeStamp").gte(cutoff),
        "ProjectionExpression": (
            "eventId, timeStamp, newSummarization, country, priority, "
            "category, severity, articleURL, title, #src, publishedAt, fetchedAt"
        ),
        # 'source' is a reserved word in DynamoDB
        "ExpressionAttributeNames": {"#src": "source"},
    }

    items = []
    while True:
        response = news_table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    # Sort newest first
    items.sort(key=lambda x: x.get("timeStamp", ""), reverse=True)

    print(f"Found {len(items)} articles for '{country}' in last {hours}h (cutoff: {cutoff})")
    return items


# ─── Lambda Handler ───────────────────────────────────────────────────────────
def lambda_handler(event, context):

    # ── CORS Preflight ────────────────────────────────────────────────────────
    http_method = (
        event.get("requestContext", {})
             .get("http", {})
             .get("method", "")
    )
    if http_method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    # ── Parse country from query string ───────────────────────────────────────
    # Supports:  GET /country-news?country=Thailand&hours=48
    query_params = event.get("queryStringParameters") or {}
    country      = query_params.get("country", "").strip()

    # Also support direct Console test:  { "country": "Thailand" }
    if not country:
        country = event.get("country", "").strip()

    if not country:
        return err(400, "Missing required query parameter: country")

    # Optional ?hours=N override (default 24)
    try:
        hours = int(query_params.get("hours", 24))
        if hours < 1 or hours > 168:   # cap at 7 days
            raise ValueError
    except (ValueError, TypeError):
        return err(400, "Invalid 'hours' parameter — must be an integer between 1 and 168")

    # ── Fetch ─────────────────────────────────────────────────────────────────
    articles = get_country_news(country, hours=hours)

    return ok({
        "country":       country,
        "hours":         hours,
        "total":         len(articles),
        "articles":      articles,
    })