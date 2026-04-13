# War Monitor — Frontend

Global Conflict Intelligence Dashboard built with React + Vite. Pure canvas-based globe (no external globe library needed), country-level markers, and a slide-in panel showing article summaries.

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build → dist/
```

## Connecting to AWS

Create a `.env` file in the project root:

```env
VITE_API_BASE=https://your-api-gateway-id.execute-api.ap-southeast-1.amazonaws.com/prod
VITE_COUNTRY_SUMMARY_LAMBDA_URL=https://your-lambda-function-url.lambda-url.ap-southeast-1.on.aws/
```

- `VITE_API_BASE` is used for `/countries` and `/events`
- `VITE_COUNTRY_SUMMARY_LAMBDA_URL` is used to call `countrySummarization` directly with `POST { "country": "..." }`

Without these, the app runs with mock data automatically.

## API Contract

The frontend expects these endpoints from API Gateway:

### GET /countries
Returns array of country-level markers for the globe.
```json
[
  {
    "name": "Ukraine",
    "lat": 49.0,
    "lon": 32.0,
    "severity": "critical",
    "articleCount": 47,
    "topCategory": "Armed Conflict",
    "trend": "escalating"
  }
]
```

### GET /events?country=Ukraine
Returns articles for a specific country (O1 summaries).
```json
[
  {
    "articleId": "ua-001",
    "articleSummary": "...",
    "category": "Armed Conflict",
    "severity": "critical",
    "priority": "high",
    "timestamp": "2025-03-27T10:14:00Z",
    "sourceURL": "https://reuters.com/...",
    "sourceName": "Reuters"
  }
]
```

### POST countrySummarization Lambda URL
Request body:
```json
{
  "country": "Ukraine"
}
```

Example response:
```json
{
  "statusCode": 200,
  "country": "Ukraine",
  "action": "returned_existing",
  "last_updated": "2026-04-05T08:31:33.824108",
  "result": {
    "country": "Ukraine",
    "dominant_category": "armed_conflict",
    "high_priority_count": 5,
    "key_events": ["Event 1", "Event 2"],
    "lastChecked": "2026-04-06T07:12:29.172276",
    "model": "google.gemma-3-27b-it",
    "overall_severity": 4,
    "promptArn": "arn:aws:bedrock:ap-northeast-1:xxxxxxxxxxxx:prompt/XXXX:1",
    "situation_summary": "...",
    "total_events": 8,
    "trend": "escalating",
    "lastUpdated": "2026-04-05T08:31:33.824108"
  }
}
```

## Architecture notes

- No geocoding dependency — `COUNTRY_COORDS` in `Globe.jsx` is a static JS lookup (~200 entries, ~3KB)
- Globe is pure Canvas 2D — no Three.js, no globe.gl, zero heavy dependencies
- Polls `/countries` every 15 minutes to refresh markers
- Country panel loads on click (lazy) — no upfront data fetch for articles

## Deploy to S3 + CloudFront

```bash
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```
