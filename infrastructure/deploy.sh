#!/bin/bash
set -e

# Deployment flags
DEPLOY_ALL=false
DEPLOY_FRONTEND=false
DEPLOY_FETCHER=false
DEPLOY_AI=false
DEPLOY_API=false
DEPLOY_PROMPTS=false

# ANSI color codes
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: ./deploy.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --all         Deploy all Lambda functions and the Frontend to S3"
    echo "  --frontend    Deploy only the React webpage to S3"
    echo "  --fetcher     Deploy News Fetcher Lambda"
    echo "  --ai          Deploy AI Processing Lambdas"
    echo "  --api         Deploy API Lambdas"
    echo "  --prompts     Deploy Bedrock Prompts configured in aiProcessing/prompts"
    echo "  --help        Show this help message"
    echo ""
    exit 1
}

# Parse options
if [ $# -eq 0 ]; then
    usage
fi

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --all) DEPLOY_ALL=true; DEPLOY_FRONTEND=true; DEPLOY_FETCHER=true; DEPLOY_AI=true; DEPLOY_API=true; DEPLOY_PROMPTS=true ;;
        --frontend) DEPLOY_FRONTEND=true ;;
        --fetcher) DEPLOY_FETCHER=true ;;
        --ai) DEPLOY_AI=true ;;
        --api) DEPLOY_API=true ;;
        --prompts) DEPLOY_PROMPTS=true ;;
        --help) usage ;;
        *) echo "Unknown parameter passed: $1"; usage ;;
    esac
    shift
done

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

echo -e "${YELLOW}Loading dynamic Terraform outputs from state...${NC}"
cd "$SCRIPT_DIR/terraform/envs/dev"
terraform init -backend=false > /dev/null 2>&1
TF_OUT=$(terraform output -json)
cd "$ROOT_DIR"

get_output() {
    echo "$TF_OUT" | jq -r ".$1.value"
}

update_lambda() {
    local folder_path=$1
    local func_name=$2
    local source_file=$3
    local target_file=$4
    local zip_name="deployment.zip"

    if [ "$func_name" == "null" ] || [ -z "$func_name" ]; then
        echo "Error: Could not retrieve terraform output for function. Is Terraform applied?"
        exit 1
    fi

    echo -e "${YELLOW}Packaging and updating Lambda: $func_name (Path: $folder_path)${NC}"
    cd "$folder_path"
    
    # Temporarily copy the source to match AWS Lambda default handler expectations
    if [ -n "$source_file" ] && [ -n "$target_file" ] && [ -f "$source_file" ]; then
        cp "$source_file" "$target_file"
    fi
    
    # Define files to exclude from the zip
    local excludes="*.git* *.env* *test* *.DS_Store"
    if [ -n "$source_file" ] && [ -n "$target_file" ] && [ "$source_file" != "$target_file" ]; then
        excludes="$excludes $source_file"
    fi
    
    # Check what kind of project it is and package correctly
    if [ -f "package.json" ]; then
        npm install --production > /dev/null 2>&1
        zip -rq $zip_name . -x $excludes "node_modules/aws-sdk/*"
    elif [ -f "requirements.txt" ]; then
        pip install -r requirements.txt -t . > /dev/null 2>&1
        zip -rq $zip_name . -x $excludes
    else
        zip -rq $zip_name . -x $excludes
    fi
    
    aws lambda update-function-code --function-name "$func_name" --zip-file "fileb://$zip_name" > /dev/null
    
    # Cleanup the copied file
    if [ -n "$source_file" ] && [ -n "$target_file" ] && [ "$source_file" != "$target_file" ]; then
        rm -f "$target_file"
    fi
    
    rm -f $zip_name
    cd - > /dev/null
    echo -e "${GREEN}Success: $func_name updated.${NC}"
}

if [ "$DEPLOY_FETCHER" = true ]; then
    echo -e "\n--- Deploying News Fetcher ---"
    FUNC_NAME=$(get_output "ingestion_news_fetcher")
    update_lambda "News_fetcher" "$FUNC_NAME" "News_fetcher.js" "index.mjs"
fi

if [ "$DEPLOY_AI" = true ]; then
    echo -e "\n--- Deploying AI Processing Lambdas ---"
    
    # Assume article_summary is newsSummarization
    FUNC_ARTICLE=$(get_output "ai_article_summary")
    if [ -d "aiProcessing/newsSummarization" ]; then
        update_lambda "aiProcessing/newsSummarization" "$FUNC_ARTICLE" "main.py" "lambda_function.py"
    fi
    
    FUNC_DAILY=$(get_output "ai_daily_summarization")
    if [ -d "aiProcessing/dailySummarization" ]; then
        update_lambda "aiProcessing/dailySummarization" "$FUNC_DAILY" "main.py" "lambda_function.py"
    fi
fi

if [ "$DEPLOY_API" = true ]; then
    echo -e "\n--- Deploying API Lambdas ---"
    
    FUNC_NEWS=$(get_output "api_country_news")
    if [ -d "api/countryNews" ]; then
        update_lambda "api/countryNews" "$FUNC_NEWS" "country-news.py" "lambda_function.py"
    fi
    
    FUNC_OVERVIEW=$(get_output "api_country_overview")
    if [ -d "api/countryOverview" ]; then
        update_lambda "api/countryOverview" "$FUNC_OVERVIEW" "conntry-overview.py" "lambda_function.py"
    fi
    
    FUNC_SUB=$(get_output "api_subscription")
    if [ -d "api/emailSubcription" ]; then
        update_lambda "api/emailSubcription" "$FUNC_SUB" "email-subcription.py" "lambda_function.py"
    fi
    
    FUNC_SUMMARY=$(get_output "api_country_summary")
    if [ -d "aiProcessing/countrySummarization" ]; then
        update_lambda "aiProcessing/countrySummarization" "$FUNC_SUMMARY" "main.py" "lambda_function.py"
    fi
fi

if [ "$DEPLOY_FRONTEND" = true ]; then
    echo -e "\n--- Deploying Webpage Frontend ---"
    BUCKET_NAME=$(get_output "frontend_bucket_name")
    
    if [ "$BUCKET_NAME" == "null" ] || [ -z "$BUCKET_NAME" ]; then
        echo "Error: Could not retrieve frontend_bucket_name from terraform. Is Terraform applied?"
        exit 1
    fi
    
    echo -e "${YELLOW}Building React frontend...${NC}"
    cd webpage
    npm install --force
    npm run build
    
    echo -e "${YELLOW}Uploading dist/ to s3://$BUCKET_NAME...${NC}"
    aws s3 sync dist/ "s3://$BUCKET_NAME" --delete > /dev/null
    cd - > /dev/null
    
    URL=$(get_output "website_url")
    echo -e "${GREEN}Frontend deployed successfully! Access it at: $URL${NC}"
fi

if [ "$DEPLOY_PROMPTS" = true ]; then
    echo -e "\n--- Deploying Bedrock Prompts ---"
    
    update_prompt() {
        local file_path=$1
        local prompt_id=$2
        
        if [ "$prompt_id" == "null" ] || [ -z "$prompt_id" ]; then
            echo -e "${YELLOW}Warning: Could not retrieve Prompt ID from terraform for $file_path${NC}"
            return
        fi

        if [ ! -f "$file_path" ]; then
            echo -e "${YELLOW}Warning: Prompt file not found at $file_path${NC}"
            return
        fi
        
        PROMPT_NAME=$(aws bedrock-agent get-prompt --region ap-northeast-1 --prompt-identifier "$prompt_id" --query 'name' --output text 2>/dev/null)
        if [ -z "$PROMPT_NAME" ] || [ "$PROMPT_NAME" == "null" ]; then
            echo -e "${YELLOW}Warning: Could not fetch prompt details for ID $prompt_id${NC}"
            return
        fi
        
        echo -e "${YELLOW}Updating Prompt: $PROMPT_NAME (ID: $prompt_id in ap-northeast-1)${NC}"
        PROMPT_TEXT=$(cat "$file_path" | jq -Rs .)
        
        aws bedrock-agent update-prompt \
            --region ap-northeast-1 \
            --prompt-identifier "$prompt_id" \
            --name "$PROMPT_NAME" \
            --default-variant "default" \
            --variants "[{\"name\": \"default\", \"templateType\": \"TEXT\", \"modelId\": \"amazon.titan-text-express-v1\", \"templateConfiguration\": {\"text\": {\"text\": $PROMPT_TEXT}}}]" > /dev/null
            
        aws bedrock-agent create-prompt-version --region ap-northeast-1 --prompt-identifier "$prompt_id" > /dev/null
        echo -e "${GREEN}Success: $PROMPT_NAME updated.${NC}"
    }

    ID_NEWS=$(get_output "ai_prompt_news_id")
    update_prompt "aiProcessing/prompts/newsSummarization.txt" "$ID_NEWS"
    
    ID_DAILY=$(get_output "ai_prompt_daily_id")
    update_prompt "aiProcessing/prompts/dailySummarization.txt" "$ID_DAILY"
    
    ID_COUNTRY=$(get_output "ai_prompt_country_id")
    update_prompt "aiProcessing/prompts/countrySummarization.txt" "$ID_COUNTRY"
fi

echo -e "\n${GREEN}Deployment complete!${NC}"
