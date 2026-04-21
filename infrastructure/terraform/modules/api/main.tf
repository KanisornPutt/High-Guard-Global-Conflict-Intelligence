resource "aws_apigatewayv2_api" "main" {
  name                       = "${var.prefix}-api-gateway"
  protocol_type              = "HTTP"
  route_selection_expression = "$request.method $request.path"

  cors_configuration {
    allow_headers = ["content-type"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["*"]
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-api-gateway" })
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
}

# Country News Integration
resource "aws_apigatewayv2_integration" "country_news" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.country_news.invoke_arn
}

resource "aws_apigatewayv2_route" "country_news" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /country-news"
  target    = "integrations/${aws_apigatewayv2_integration.country_news.id}"
}

resource "aws_lambda_permission" "country_news" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.country_news.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/GET/country-news"
}

# Country Overview Integration
resource "aws_apigatewayv2_integration" "country_overview" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.country_overview.invoke_arn
}

resource "aws_apigatewayv2_route" "country_overview" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /country-overview"
  target    = "integrations/${aws_apigatewayv2_integration.country_overview.id}"
}

resource "aws_lambda_permission" "country_overview" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.country_overview.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/GET/country-overview"
}

# Country Summary Integration
resource "aws_apigatewayv2_integration" "country_summary" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.country_summary.invoke_arn
}

resource "aws_apigatewayv2_route" "country_summary" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /country-summary"
  target    = "integrations/${aws_apigatewayv2_integration.country_summary.id}"
}

resource "aws_lambda_permission" "country_summary" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.country_summary.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/POST/country-summary"
}

# Subscription Integration
resource "aws_apigatewayv2_integration" "subscription" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.subscription.invoke_arn
}

resource "aws_apigatewayv2_route" "subscription" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /subscribe"
  target    = "integrations/${aws_apigatewayv2_integration.subscription.id}"
}

resource "aws_lambda_permission" "subscription" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.subscription.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/POST/subscribe"
}

resource "aws_iam_role" "country_news" {
  name = "${var.prefix}-country-news-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "country_news_logs" {
  role       = aws_iam_role.country_news.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "country_news_dynamodb" {
  role       = aws_iam_role.country_news.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role" "country_overview" {
  name = "${var.prefix}-country-overview-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "country_overview_logs" {
  role       = aws_iam_role.country_overview.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "country_overview_dynamodb" {
  role       = aws_iam_role.country_overview.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_lambda_function" "country_news" {
  function_name = "${var.prefix}-country-news-function"
  role          = aws_iam_role.country_news.arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.12"
  timeout       = 3
  memory_size   = 128

  filename = "dummy.zip"

  lifecycle {
    ignore_changes = [filename]
  }

  environment {
    variables = {
      NEWS_TABLE_NAME = var.news_table_name
    }
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-country-news-function" })
}

resource "aws_lambda_function" "country_overview" {
  function_name = "${var.prefix}-country-overview-function"
  role          = aws_iam_role.country_overview.arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 128

  filename = "dummy.zip"

  lifecycle {
    ignore_changes = [filename]
  }

  environment {
    variables = {
      NEWS_TABLE_NAME    = var.news_table_name
      COUNTRY_TABLE_NAME = var.country_table_name
    }
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-country-overview-function" })
}

resource "aws_iam_role" "country_summary" {
  name = "${var.prefix}-country-summary-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "country_summary_logs" {
  role       = aws_iam_role.country_summary.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "country_summary_dynamodb" {
  role       = aws_iam_role.country_summary.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "country_summary_bedrock" {
  role       = aws_iam_role.country_summary.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonBedrockFullAccess"
}

resource "aws_lambda_function" "country_summary" {
  function_name = "${var.prefix}-country-summary-function"
  role          = aws_iam_role.country_summary.arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.14"
  timeout       = 60
  memory_size   = 128

  filename = "dummy.zip"

  environment {
    variables = {
      COUNTRY_PROMPT_ARN = "${var.country_prompt_arn}:DRAFT"
      NEWS_TABLE_NAME    = var.news_table_name
      COUNTRY_TABLE_NAME = var.country_table_name
    }
  }

  lifecycle {
    ignore_changes = [filename]
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-country-summary-function" })
}

resource "aws_iam_role" "subscription" {
  name = "${var.prefix}-subscription-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "subscription_logs" {
  role       = aws_iam_role.subscription.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "subscription_sns" {
  role       = aws_iam_role.subscription.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSNSFullAccess"
}

resource "aws_lambda_function" "subscription" {
  function_name = "${var.prefix}-subscription-function"
  role          = aws_iam_role.subscription.arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.14"
  timeout       = 3
  memory_size   = 128

  filename = "dummy.zip"

  environment {
    variables = {
      SNS_TOPIC_ARN        = var.sns_topic_arn
      TURNSTILE_SECRET_KEY = var.turnstile_secret_key
    }
  }

  lifecycle {
    ignore_changes = [filename, environment]
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-subscription-function" })
}
