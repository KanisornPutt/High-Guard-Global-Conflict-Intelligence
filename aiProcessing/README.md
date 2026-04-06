# AIProcessing

Three AWS Lambda functions that form the AI analysis pipeline for High Guard. Each function reads from / writes to DynamoDB and calls **Gemma 3 27B** via Amazon Bedrock.

```
newsSummarization      ← Stage 1: classify & summarise individual articles
countrySummarization   ← Stage 2: build per-country intelligence briefings
dailySummarization     ← Stage 3: generate the global daily digest + send notifications
```

---

## Architecture overview

```
SQS (raw articles)
      │
      ▼
newsSummarization  ──► DynamoDB: newsSummary
                                      │
                          ┌───────────┘
                          ▼
               countrySummarization ──► DynamoDB: countrySummary
                                                        │
                                            ┌───────────┘
                                            ▼
                                  dailySummarization ──► Discord webhook
                                                     ──► SNS (email)
```

---

## 1. newsSummarization

**Trigger:** SQS (one message per article from the news fetcher)

Classifies and summarises a raw news article. Saves the result to the `newsSummary` DynamoDB table.

### Environment variables

| Variable         | Required | Default                 | Description                                                 |
| ---------------- | -------- | ----------------------- | ----------------------------------------------------------- |
| `PROMPT_ARN`     | Yes      | —                       | Bedrock Prompt Management ARN for the classification prompt |
| `MODEL_ID`       | No       | `google.gemma-3-27b-it` | Bedrock model ID                                            |
| `DYNAMODB_TABLE` | No       | `newsSummary`           | Target DynamoDB table name                                  |

### Input

**SQS message body (JSON):**

```json
{
  "url": "https://example.com/article",
  "title": "Conflict erupts in region X",
  "description": "Full article text or excerpt...",
  "source": "Reuters",
  "country": "Ukraine",
  "publishedAt": "2026-04-06T08:00:00Z",
  "fetchedAt": "2026-04-06T08:05:00Z"
}
```

**Direct test event (no SQS):**

```json
{
  "url": "https://example.com/article",
  "title": "Conflict erupts in region X",
  "description": "Full article text...",
  "source": "Reuters",
  "country": "Ukraine",
  "publishedAt": "2026-04-06T08:00:00Z"
}
```

### Bedrock prompt input

```
[system]  <classification rules from Prompt Management>
[user]    Classify this article:

          Title: ...
          Source: ...
          Published: ...

          <article description>
```

### Bedrock response format (JSON)

```json
{
  "summary": "One-sentence summary of the event.",
  "country": "Ukraine",
  "priority": "high",
  "category": "armed_conflict",
  "severity": 4
}
```

| Field      | Type    | Values                                                          |
| ---------- | ------- | --------------------------------------------------------------- |
| `summary`  | string  | One-sentence plain-text summary                                 |
| `country`  | string  | Country name                                                    |
| `priority` | string  | `low` / `medium` / `high`                                       |
| `category` | string  | e.g. `armed_conflict`, `terrorism`, `political_unrest`, `other` |
| `severity` | integer | `1` (lowest) – `5` (critical)                                   |

### DynamoDB output (`newsSummary` table)

| Field              | Source                                          |
| ------------------ | ----------------------------------------------- |
| `eventId`          | Generated UUID                                  |
| `timeStamp`        | UTC ISO-8601 at processing time                 |
| `newSummarization` | Bedrock `summary`                               |
| `country`          | Bedrock `country` (falls back to SQS `country`) |
| `priority`         | Bedrock `priority`                              |
| `category`         | Bedrock `category`                              |
| `severity`         | Bedrock `severity`                              |
| `articleURL`       | SQS `url`                                       |
| `title`            | SQS `title`                                     |
| `source`           | SQS `source`                                    |
| `publishedAt`      | SQS `publishedAt`                               |
| `fetchedAt`        | SQS `fetchedAt`                                 |

### Lambda return value

```json
{
  "statusCode": 200,
  "success": 3,
  "failed": 0
}
```

---

## 2. countrySummarization

**Trigger:** SQS (one message per country) or direct test event

Reads the last 24 hours of articles for a country from `newsSummary`, then generates a country-level intelligence briefing and saves it to `countrySummary`. Skips re-generation if no new articles have arrived since the last update.

### Environment variables

| Variable             | Required | Default                 | Description                                                   |
| -------------------- | -------- | ----------------------- | ------------------------------------------------------------- |
| `COUNTRY_PROMPT_ARN` | Yes      | —                       | Bedrock Prompt Management ARN for the country briefing prompt |
| `MODEL_ID`           | No       | `google.gemma-3-27b-it` | Bedrock model ID                                              |

### Input

**SQS message body (JSON):**

```json
{
  "country": "Ukraine"
}
```

**Direct test event:**

```json
{
  "country": "Ukraine"
}
```

### Bedrock prompt input

```
[system]  <country briefing rules from Prompt Management>
[user]    Country: Ukraine

          Total events: 8

          Conflict events (oldest to newest):

          Event 1:
            Timestamp:     2026-04-05T10:00:00
            Category:      armed_conflict
            Severity:      4/5
            Priority:      high
            Summarization: Shelling reported in eastern Ukraine...
          ...

          Generate the country intelligence briefing in JSON only.
```

### Bedrock response format (JSON)

```json
{
  "situation_summary": "Brief 2-3 sentence overview of the country's current situation.",
  "dominant_category": "armed_conflict",
  "overall_severity": 4,
  "trend": "escalating",
  "total_events": 8,
  "high_priority_count": 5,
  "key_events": [
    "Shelling reported in eastern region.",
    "Civilian evacuation ordered in border towns."
  ]
}
```

| Field                 | Type     | Values                                    |
| --------------------- | -------- | ----------------------------------------- |
| `situation_summary`   | string   | Plain-text narrative                      |
| `dominant_category`   | string   | Most common category among events         |
| `overall_severity`    | integer  | `1`–`5`                                   |
| `trend`               | string   | `stable` / `escalating` / `de-escalating` |
| `total_events`        | integer  | Total events analysed                     |
| `high_priority_count` | integer  | Count of `priority=high` events           |
| `key_events`          | string[] | 2–4 bullet-point highlights               |

### DynamoDB output (`countrySummary` table)

| Field                 | Source                                                   |
| --------------------- | -------------------------------------------------------- |
| `country`             | Partition key — country name                             |
| `lastUpdated`         | UTC ISO-8601 at generation time (sort key)               |
| `lastChecked`         | UTC ISO-8601 — updated even when no re-generation occurs |
| `situation_summary`   | Bedrock                                                  |
| `dominant_category`   | Bedrock                                                  |
| `overall_severity`    | Bedrock                                                  |
| `trend`               | Bedrock                                                  |
| `total_events`        | Bedrock                                                  |
| `high_priority_count` | Bedrock                                                  |
| `key_events`          | Bedrock                                                  |
| `promptArn`           | Value of `COUNTRY_PROMPT_ARN`                            |
| `model`               | Value of `MODEL_ID`                                      |

### Lambda return value

```json
{
  "statusCode": 200,
  "country": "Ukraine",
  "action": "regenerated",
  "events_count": 8,
  "result": { ... }
}
```

`action` values: `generated_fresh` / `regenerated` / `returned_existing`

---

## 3. dailySummarization

**Trigger:** EventBridge scheduled rule (runs once daily)

Scans `newsSummary` for all high-priority events in the last 24 hours, selects the top N most active countries, calls Bedrock to generate a global digest, then sends it to Discord and SNS (email).

### Environment variables

| Variable                 | Required | Default                 | Description                                            |
| ------------------------ | -------- | ----------------------- | ------------------------------------------------------ |
| `DIGEST_PROMPT_ARN`      | Yes      | —                       | Bedrock Prompt Management ARN for the digest prompt    |
| `MODEL_ID`               | No       | `google.gemma-3-27b-it` | Bedrock model ID                                       |
| `DISCORD_WEBHOOK_URL`    | No       | —                       | Discord webhook URL; skipped if not set                |
| `SNS_TOPIC_ARN`          | No       | —                       | SNS topic ARN for email; skipped if not set            |
| `TOP_N_COUNTRIES`        | No       | `3`                     | How many top countries to include in the digest        |
| `MAX_EVENTS_PER_COUNTRY` | No       | `5`                     | Max events per country sent to Bedrock (token control) |

### Input

EventBridge invokes the Lambda with no meaningful payload. The function reads `newsSummary` directly.

### Bedrock prompt input

```
[system]  <digest rules from Prompt Management>
[user]    Today's date: 2026-04-06

          Analyze the following high-priority conflict events
          focusing on the top 3 most active countries.

          === GLOBAL OVERVIEW ===
          Total high-priority events worldwide: 42
          Top hotspot countries: Ukraine, Sudan, Myanmar

          === UKRAINE (5 events) ===
            Event 1:
              Timestamp:     2026-04-05T10:00:00
              Category:      armed_conflict
              Severity:      4/5
              Summarization: ...
          ...

          Generate the daily digest in JSON only.
```

### Bedrock response format (JSON)

The model returns either a list or a single object; the function normalises to a list.

```json
[
  {
    "country":           "Ukraine",
    "situation_summary": "Ongoing artillery exchanges along the eastern front...",
    "key_events": [
      "Heavy shelling in Donetsk region.",
      "UN calls for ceasefire."
    ],
    "overall_severity":   4,
    "dominant_category":  "armed_conflict",
    "trend":              "escalating",
    "high_priority_count": 5
  },
  {
    "country": "Sudan",
    ...
  }
]
```

### Notifications sent

**Discord (Markdown):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 HIGH GUARD Daily Digest
📅 2026-04-06 | 08:00 ICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Threat Level: HIGH
📊 42 high-priority event(s) worldwide
🔥 Top Hotspots: Ukraine, Sudan, Myanmar

🗺️ Top Country Situations:

🔴 Ukraine | Armed Conflict | Trend: Escalating
> Ongoing artillery exchanges along the eastern front...
  • Heavy shelling in Donetsk region.
  • UN calls for ceasefire.
...
```

**SNS email (plain text):**

```
HIGH GUARD — Daily Conflict Intelligence Digest
Date: 2026-04-06
Threat Level: HIGH
---------------------------

Total high-priority events: 42
Top Hotspots: Ukraine, Sudan, Myanmar
...
```

### Lambda return value

```json
{
  "statusCode": 200,
  "date": "2026-04-06",
  "threat_level": "HIGH",
  "total_events": 42,
  "top_countries": ["Ukraine", "Sudan", "Myanmar"],
  "events_used": 15
}
```

---

## Severity & threat mapping

| Severity | Emoji | Threat label |
| -------- | ----- | ------------ |
| 1        | 🟢    | LOW          |
| 2        | 🟡    | LOW          |
| 3        | 🟠    | MODERATE     |
| 4        | 🔴    | HIGH         |
| 5        | 🚨    | CRITICAL     |

---

## AWS regions

| Service                      | Region                       |
| ---------------------------- | ---------------------------- |
| Amazon Bedrock (Gemma 3 27B) | `ap-northeast-1` (Tokyo)     |
| DynamoDB, Lambda, SNS        | `ap-southeast-1` (Singapore) |
