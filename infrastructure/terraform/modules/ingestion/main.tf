resource "aws_sqs_queue" "articles" {
  name                      = "${var.prefix}-articles-queue"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 345600

  tags = merge(var.common_tags, { Name = "${var.prefix}-articles-queue" })
}

resource "aws_iam_role" "news_fetcher_role" {
  name = "${var.prefix}-news-fetcher-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "news_fetcher_logs" {
  role       = aws_iam_role.news_fetcher_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "news_fetcher_sqs" {
  role       = aws_iam_role.news_fetcher_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
}

resource "aws_lambda_function" "news_fetcher" {
  function_name = "${var.prefix}-news-fetcher"
  role          = aws_iam_role.news_fetcher_role.arn
  handler       = "index.handler"
  runtime       = "nodejs24.x"
  timeout       = 180
  memory_size   = 128
  
  filename      = "dummy.zip"

  environment {
    variables = {
      NEWSAPI_KEY   = var.news_api_key
      SQS_QUEUE_URL = aws_sqs_queue.articles.id
    }
  }

  lifecycle {
    ignore_changes = [filename, environment]
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-news-fetcher" })
}

resource "aws_iam_role" "news_fetcher_scheduler" {
  name = "${var.prefix}-news-fetcher-scheduler-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "scheduler.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "news_fetcher_scheduler_policy" {
  name = "${var.prefix}-news-fetcher-scheduler-policy"
  role = aws_iam_role.news_fetcher_scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "lambda:InvokeFunction"
        Effect   = "Allow"
        Resource = aws_lambda_function.news_fetcher.arn
      }
    ]
  })
}

resource "aws_scheduler_schedule" "news_fetcher_schedule" {
  name                = "${var.prefix}-daily-alert-rule"
  schedule_expression = "cron(55 13 * * ? *)"
  
  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.news_fetcher.arn
    role_arn = aws_iam_role.news_fetcher_scheduler.arn
  }
}
