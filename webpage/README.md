# High Guard Web App (webpage)

Frontend for the War Monitor project.

This app renders an interactive 3D globe, highlights countries with active risk signals, shows per-country summaries/articles, and supports email subscription with Cloudflare Turnstile verification.

## Stack

- React 18 + Vite
- Three.js (3D globe rendering)
- d3-geo + topojson-client (country geometry and lookup)

## Features

- Rotating, zoomable 3D globe with severity markers
- Hover highlight + click-to-open country panel
- Country panel with:
  - situation overview (summary)
  - top events list
  - recent report cards with source links
- Header stats (critical, high, countries, reports today)
- Severity filtering
- Email subscription modal (Turnstile + Lambda)
- Automatic country refresh every 15 minutes

## Project layout

- src/App.jsx: app shell, polling, panel state
- src/components/Globe.jsx: Three.js scene, interaction, country highlight/markers
- src/components/CountryPanel.jsx: country details panel
- src/components/StatsBar.jsx: counters + subscription modal
- src/components/FilterBar.jsx: re-exported from StatsBar
- src/api/warApi.js: API/Lambda fetch + payload normalization
- src/config/constants.js: env vars, color maps, app constants
- src/data/countryCoords.js: country coordinate/feature helpers
- lambda/: sample Lambda handlers used by backend endpoints

## Getting started

1. Install dependencies

```bash
npm install
```

2. Create environment file

```bash
cp .env.example .env
```

3. Run locally

```bash
npm run dev
```

Default dev URL: http://localhost:3000

4. Build production bundle

```bash
npm run build
```

5. Preview production bundle

```bash
npm run preview
```

## Environment variables

Configured in [.env.example](.env.example).

Required/optional values:

- VITE_API_BASE  
  Base API Gateway URL for fallback REST endpoints such as `/countries`, `/events`, `/summary/country`.

- VITE_COUNTRY_NEWS_LAMBDA_URL  
  Lambda Function URL base for country summary/overview/news endpoints.

- VITE_COUNTRY_SUMMARY_PATH (default: `/country-summary`)
- VITE_COUNTRY_OVERVIEW_PATH (default: `/country-overview`)
- VITE_COUNTRY_NEWS_PATH (default: `/country-news`)

- VITE_TURNSTILE_SITE_KEY  
  Cloudflare Turnstile site key for subscription form.

- VITE_SUBSCRIPTION_LAMBDA_URL (default: uses VITE_COUNTRY_NEWS_LAMBDA_URL)
- VITE_SUBSCRIPTION_PATH (default: `/subscribe`)

## Data flow and fallback behavior

The frontend prefers Lambda endpoints first, then falls back to API Gateway endpoints when available.

- Country markers:
  1) GET `${VITE_COUNTRY_NEWS_LAMBDA_URL}${VITE_COUNTRY_OVERVIEW_PATH}`
  2) fallback GET `${VITE_API_BASE}/countries`

- Country articles:
  1) GET `${VITE_COUNTRY_NEWS_LAMBDA_URL}${VITE_COUNTRY_NEWS_PATH}?country=<name>`
  2) fallback GET `${VITE_API_BASE}/events?country=<name>`

- Country summary:
  1) POST `${VITE_COUNTRY_NEWS_LAMBDA_URL}${VITE_COUNTRY_SUMMARY_PATH}` with `{ country }`
  2) fallback GET `${VITE_API_BASE}/summary/country?country=<name>`

- Subscription:
  POST `${VITE_SUBSCRIPTION_LAMBDA_URL}${VITE_SUBSCRIPTION_PATH}` with `{ email, turnstileToken }`

The API layer normalizes mixed backend payload shapes (including Lambda proxy responses with `body`) into consistent UI models.

## Expected response shape (normalized target)

### Countries

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

### Articles

```json
[
  {
    "articleId": "ua-001",
    "articleSummary": "...",
    "category": "Armed Conflict",
    "severity": "critical",
    "priority": "high",
    "timestamp": "2026-04-18T10:14:00Z",
    "sourceURL": "https://example.com/report",
    "sourceName": "Reuters"
  }
]
```

### Summary

```json
{
  "country": "Ukraine",
  "trend": "escalating",
  "topCategory": "Armed Conflict",
  "severity": "high",
  "overallSituation": "...",
  "topEvents": ["...", "..."],
  "lastUpdated": "Apr 18, 2026, 04:24 PM",
  "articleCount": 8
}
```

## Deployment

Any static host for Vite output works (S3/CloudFront, Netlify, Vercel, etc.).

S3 + CloudFront example:

```bash
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

## Notes

- If no endpoints are configured or reachable, country/event data resolves to empty lists.
- Marker coordinates can come from backend lat/lon or be inferred via local country geometry helpers.
- The document title and branding use “High Guard — Global Conflict Intelligence”.
