# War Monitor (High Guard)

AI-assisted global conflict monitoring platform.

This repository combines:

- A news ingestion Lambda that pulls war/conflict-related stories from multiple sources
- A 3-stage AI pipeline on AWS Bedrock + DynamoDB
- A React + Vite frontend with a 3D globe dashboard and country intelligence panel
- API-facing Lambda handlers used by the frontend for country overview/news and subscriptions

## Motivation

Conflict-related information is high-volume, fast-moving, and spread across many sources.
For most teams, manually reading every article and turning it into actionable insight is too slow and inconsistent.

War Monitor was built to reduce that gap by:

- consolidating fragmented conflict news into one pipeline
- summarizing raw reports into structured intelligence signals
- surfacing country-level risk patterns quickly for decision support
- delivering digestible updates for both dashboards and notifications

## Solution

War Monitor uses an AI-first pipeline plus a real-time visualization layer.

- Ingestion layer:
  - collects conflict-related news from RSS feeds and NewsAPI
  - normalizes and queues articles through SQS

- Intelligence layer (Bedrock + DynamoDB):
  - article-level classification and summary (`newsSummarization`)
  - country-level situation synthesis (`countrySummarization`)
  - daily global digest generation (`dailySummarization`)

- Delivery layer:
  - interactive globe dashboard for country hotspots and trends
  - per-country situation panel with recent reports
  - outbound notifications via Discord and SNS email

This design separates data collection, AI reasoning, and presentation so each part can scale independently.

## Repository structure

- aiProcessing/
  - 3 production-oriented AI pipeline functions:
    - newsSummarization (article classification + summary)
    - countrySummarization (country-level intelligence brief)
    - dailySummarization (daily global digest + notifications)
  - Prompt text files under aiProcessing/prompts/
  - Detailed docs in [aiProcessing/README.md](aiProcessing/README.md)

- News_fetcher/
  - News_fetcher.js Lambda source that ingests RSS/NewsAPI feeds and pushes records to SQS

- infrastructure/
  - Terraform modules and environment configurations for AWS resources
  - Unified `deploy.sh` script for packaging and updating all components
  - Detailed infrastructure docs in [infrastructure/README.md](infrastructure/README.md)

- webpage/
  - React frontend (Vite) for the High Guard dashboard
  - Lambda handler examples under webpage/lambda/
  - Detailed frontend docs in [webpage/README.md](webpage/README.md)

## End-to-end flow

1) News ingestion
- News_fetcher/News_fetcher.js fetches stories from NewsAPI + RSS feeds.
- Records are deduplicated and sent to SQS.

2) AI stage 1: article summarization
- aiProcessing/newsSummarization/main.py consumes SQS messages.
- Calls Bedrock (Gemma 3 27B) to classify and summarize each article.
- Writes normalized event rows into DynamoDB table newsSummary.

3) AI stage 2: country summarization
- aiProcessing/countrySummarization/main.py builds 24h country-level briefings.
- Writes results into DynamoDB table countrySummary.

4) AI stage 3: daily digest
- aiProcessing/dailySummarization/main.py produces a daily global digest.
- Sends notifications via Discord webhook and SNS email.

5) Frontend serving
- webpage app consumes overview/news/summary endpoints and renders:
  - globe markers by country/severity
  - per-country situation panel
  - stats and subscription workflow

## Core AWS services used

- AWS Lambda
- Amazon SQS
- Amazon DynamoDB (newsSummary, countrySummary)
- Amazon Bedrock (Prompt Management + runtime)
- Amazon SNS
- API Gateway / Lambda Function URLs

## Quick start by component

### 1) Infrastructure & Deployment (Terraform)

See [infrastructure/README.md](infrastructure/README.md) for full setup and deployment details.

Quick commands:

```bash
# 1. Deploy AWS Resources (DynamoDB, SQS, API Gateway, etc.)
cd infrastructure/terraform/envs/dev
terraform init
terraform apply

# 2. Deploy Application Code (Lambdas + Frontend)
cd ../../../..
./infrastructure/deploy.sh --all
```

### 2) Frontend (webpage)

See [webpage/README.md](webpage/README.md).

Quick commands:

```bash
cd webpage
npm install
cp .env.example .env
npm run dev
```

### 2) AI pipeline (aiProcessing)

See [aiProcessing/README.md](aiProcessing/README.md) for full environment variables, event schemas, and outputs.

Main entry files:

- [aiProcessing/newsSummarization/main.py](aiProcessing/newsSummarization/main.py)
- [aiProcessing/countrySummarization/main.py](aiProcessing/countrySummarization/main.py)
- [aiProcessing/dailySummarization/main.py](aiProcessing/dailySummarization/main.py)

### 3) News ingestion Lambda

Entry file:

- [News_fetcher/News_fetcher.js](News_fetcher/News_fetcher.js)

Required runtime env (minimum):

- SQS_QUEUE_URL
- NEWSAPI_KEY
- AWS_REGION (optional, defaults to ap-southeast-1)

## Suggested deployment order

1. **Infrastructure**: Deploy AWS resources using Terraform in `infrastructure/terraform/envs/dev`.
2. **Prompts**: Sync Bedrock prompts using `./infrastructure/deploy.sh --prompts`.
3. **Application**: Deploy all Lambda functions and the frontend using `./infrastructure/deploy.sh --all`.
4. **Verification**: Access the `website_url` provided by the Terraform output.

## Environment and region notes

Current code defaults indicate:

- Bedrock calls in ap-northeast-1
- Most Lambda/DynamoDB/SNS resources in ap-southeast-1

Ensure IAM permissions and cross-region access are configured accordingly.

## Status

This monorepo is structured for cloud deployment. Local development is primarily focused on the frontend, while pipeline functions are designed for Lambda-triggered execution in AWS.
