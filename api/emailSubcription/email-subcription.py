import boto3
import json
import os
import re
import urllib.request
import urllib.parse
from botocore.exceptions import ClientError

# ─── Clients ──────────────────────────────────────────────────────────────────
SNS_REGION = os.environ.get("AWS_SNS_REGION", os.environ.get("AWS_REGION", "ap-southeast-1"))
sns = boto3.client("sns", region_name=SNS_REGION)

# ─── Config ───────────────────────────────────────────────────────────────────
SNS_TOPIC_ARN    = os.environ.get("SNS_TOPIC_ARN")
TURNSTILE_SECRET = os.environ.get("TURNSTILE_SECRET_KEY")
TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

# ─── CORS Headers ─────────────────────────────────────────────────────────────
CORS_HEADERS = {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":"content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
}

def ok(message: str) -> dict:
    return {
        "statusCode": 200,
        "headers":    CORS_HEADERS,
        "body":       json.dumps({"message": message}),
    }

def err(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers":    CORS_HEADERS,
        "body":       json.dumps({"message": message}),
    }


# ─── Turnstile Verification ───────────────────────────────────────────────────
def verify_turnstile(token: str) -> bool:
    if not TURNSTILE_SECRET:
        print("⚠️ TURNSTILE_SECRET_KEY not set — skipping verification (dev mode)")
        return True

    payload = urllib.parse.urlencode({
        "secret":   TURNSTILE_SECRET,
        "response": token,
    }).encode()

    req = urllib.request.Request(
        TURNSTILE_VERIFY,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            print("Turnstile result:", result)
            return result.get("success", False)
    except Exception as e:
        print("Turnstile verification error:", str(e))
        return False


# ─── Email Validation ─────────────────────────────────────────────────────────
def is_valid_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email)) and len(email) <= 254


# ─── SNS Helpers ──────────────────────────────────────────────────────────────
def get_subscription_status(email: str) -> str | None:
    try:
        paginator = sns.get_paginator("list_subscriptions_by_topic")
        for page in paginator.paginate(TopicArn=SNS_TOPIC_ARN):
            for sub in page.get("Subscriptions", []):
                if sub.get("Endpoint", "").lower() != email.lower():
                    continue

                arn = sub.get("SubscriptionArn", "")

                # Skip deleted subscriptions — treat as if they don't exist
                if arn == "Deleted":
                    continue

                return arn   # Either 'PendingConfirmation' or a real ARN

    except ClientError as e:
        print("list_subscriptions error:", str(e))
        raise

    return None


def subscribe_email(email: str) -> str:
    """
    Subscribes the email to the SNS topic.

    Return values:
      'pending'           — confirmation email sent, user must click link
      'already_subscribed'— email is confirmed and active, nothing to do
    """
    existing_arn = get_subscription_status(email)

    if existing_arn and existing_arn == "PendingConfirmation":
        # Subscribed before but never clicked the confirmation link
        # Re-send confirmation by calling subscribe again
        print(f"{email} is pending confirmation — resending confirmation email")

    elif existing_arn:
        # Has a real ARN → currently active subscription
        print(f"{email} is already actively subscribed: {existing_arn}")
        return "already_subscribed"

    # No subscription, pending, or previously unsubscribed → subscribe
    response = sns.subscribe(
        TopicArn=SNS_TOPIC_ARN,
        Protocol="email",
        Endpoint=email,
        ReturnSubscriptionArn=True,
    )
    arn = response.get("SubscriptionArn", "")
    print(f"SNS subscribe response for {email}: {arn}")
    return "pending"


# ─── Lambda Handler ───────────────────────────────────────────────────────────
def lambda_handler(event, context):

    # ── CORS Preflight ────────────────────────────────────────────────────────
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    # ── Parse body ────────────────────────────────────────────────────────────
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        body = {}

    # Fallback for direct Console tests (event IS the body)
    if not body:
        body = event

    email           = (body.get("email") or "").strip().lower()
    turnstile_token = (body.get("turnstileToken") or "").strip()

    # ── Validate email ────────────────────────────────────────────────────────
    if not email:
        return err(400, "Email address is required")

    if not is_valid_email(email):
        return err(400, "Invalid email address")

    # ── Verify CAPTCHA ────────────────────────────────────────────────────────
    if not turnstile_token:
        return err(400, "CAPTCHA token is required")

    if not verify_turnstile(turnstile_token):
        return err(403, "CAPTCHA verification failed — please try again")

    # ── Subscribe ─────────────────────────────────────────────────────────────
    if not SNS_TOPIC_ARN:
        return err(500, "Subscription service is not configured")

    try:
        status = subscribe_email(email)
    except ClientError as e:
        print("SNS error:", str(e))
        return err(500, "Failed to process subscription — please try again later")

    if status == "already_subscribed":
        return ok("This email is already subscribed to HIGH GUARD alerts.")

    return ok(
        "Subscription request received! Please check your inbox and click "
        "the confirmation link from AWS to activate your subscription."
    )