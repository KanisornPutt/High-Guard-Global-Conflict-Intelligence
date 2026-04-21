# High Guard Infrastructure & Deployment Guide

This directory contains the Terraform infrastructure and a unified deployment script for the High Guard Global Conflict Intelligence platform.

## Prerequisites

- **AWS CLI** configured with appropriate permissions.
- **Terraform** (v1.0+) installed.
- **jq** installed (used by the deployment script).
- **Node.js** and **npm** (for building the frontend).
- **Python 3.x** and **pip** (for packaging Python Lambdas).
- **NewsAPI Key**: Required for the News Fetcher.
- **Cloudflare Turnstile Secret Key**: Required for the subscription service.

---

## Step 1: Deploy Infrastructure (Terraform)

Before deploying the application code, you must create the necessary AWS resources using Terraform.

1. Navigate to the development environment directory:
   ```bash
   cd infrastructure/terraform/envs/dev
   ```

2. Initialize Terraform:
   ```bash
   terraform init
   ```

3. Create a `terraform.tfvars` file to provide the required sensitive settings:
   ```hcl
   news_api_key         = "your-newsapi-key"
   turnstile_secret_key = "your-turnstile-secret-key"
   ```

4. Preview the changes:
   ```bash
   terraform plan
   ```

5. Apply the changes:
   ```bash
   terraform apply
   ```
   *This will create the S3 buckets, DynamoDB tables, SQS queues, Lambda placeholders, and API Gateway.*

---

## Step 2: Deploy Application Code (`deploy.sh`)

The `deploy.sh` script handles packaging the local source code and updating the AWS Lambda functions and the S3-hosted frontend. It automatically pulls the resource names from your Terraform state.

From the **project root** directory, run:

### Options:

- **Deploy everything**:
  ```bash
  ./infrastructure/deploy.sh --all
  ```

- **Deploy specific components**:
  ```bash
  ./infrastructure/deploy.sh --api       # Deploys API Lambda functions
  ./infrastructure/deploy.sh --ai        # Deploys AI Processing Lambda functions
  ./infrastructure/deploy.sh --fetcher   # Deploys the News Fetcher
  ./infrastructure/deploy.sh --frontend  # Builds and uploads the React webpage to S3
  ./infrastructure/deploy.sh --prompts   # Syncs Bedrock prompts from aiProcessing/prompts
  ```

---

## Component Details

### 1. API Gateway
The API Gateway provides a unified endpoint for the frontend.
- **Base URL**: Can be found in Terraform outputs as `api_url`.
- **Primary Routes**:
  - `GET /country-news`
  - `GET /country-overview`
  - `POST /country-summary`
  - `POST /subscribe`

### 2. DynamoDB Tables
- **news_summary**: Stores classified news articles with a 24-hour TTL.
- **country_summary**: Stores aggregated country-level intelligence.

### 3. AI Processing
- Uses **Amazon Bedrock** (Gemma 3 27B model in `ap-northeast-1`).
- Managed prompts are stored in `aiProcessing/prompts/` and synced via `--prompts`.

---

## Troubleshooting

- **"Could not retrieve terraform output"**: Ensure you have run `terraform apply` successfully and that you are running the script from a shell that can access the AWS credentials.
- **Lambda Handler Errors**: The script renames local entry points (e.g., `main.py` -> `lambda_function.py`) to match the Terraform configuration. Do not change the `handler` setting in Terraform unless you update the script.
- **CORS Issues**: Check the `cors_configuration` block in `infrastructure/terraform/modules/api/main.tf` if the frontend cannot reach the API.
