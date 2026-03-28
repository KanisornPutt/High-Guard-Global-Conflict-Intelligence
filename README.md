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
```

Without this, the app runs with mock data automatically.

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

### GET /summary/country?country=Ukraine
Returns aggregated country digest (O2 summary from Bedrock).
```json
{
  "country": "Ukraine",
  "trend": "escalating",
  "overallSituation": "...",
  "topEvents": ["Event 1", "Event 2", "Event 3"],
  "lastUpdated": "14 min ago",
  "articleCount": 47
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
