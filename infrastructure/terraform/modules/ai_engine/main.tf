terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.tokyo]
    }
  }
}

resource "aws_iam_role" "ai_engine" {
  name = "${var.prefix}-ai-engine-role"
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

resource "aws_iam_role_policy_attachment" "ai_engine_logs" {
  role       = aws_iam_role.ai_engine.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "ai_engine_bedrock" {
  role       = aws_iam_role.ai_engine.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonBedrockFullAccess"
}

resource "aws_iam_role_policy" "bedrock_cross_region" {
  name = "BedrockCrossRegionAccess"
  role = aws_iam_role.ai_engine.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "bedrock:GetPrompt",
          "bedrock:ListPrompts",
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Effect = "Allow"
        Resource = [
          "arn:aws:bedrock:ap-northeast-1:340752800753:prompt/*",
          "arn:aws:bedrock:ap-northeast-1::foundation-model/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ai_engine_dynamodb" {
  role       = aws_iam_role.ai_engine.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "ai_engine_sqs" {
  role       = aws_iam_role.ai_engine.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
}

resource "aws_iam_role_policy_attachment" "ai_engine_sns" {
  role       = aws_iam_role.ai_engine.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSNSFullAccess"
}

resource "aws_sns_topic" "daily_summary" {
  name = "${var.prefix}-daily-alerts"
  tags = merge(var.common_tags, { Name = "${var.prefix}-daily-alerts" })
}

resource "aws_lambda_function" "article_summary" {
  function_name = "${var.prefix}-article-summary-function"
  role          = aws_iam_role.ai_engine.arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.14"
  timeout       = 3
  memory_size   = 128

  filename = "dummy.zip"

  environment {
    variables = {
      MODEL_ID       = "google.gemma-3-27b-it"
      DYNAMODB_TABLE = var.news_table_name
      PROMPT_ARN     = "${aws_bedrockagent_prompt.news_summarization.arn}:DRAFT"
    }
  }


  tags = merge(var.common_tags, { Name = "${var.prefix}-article-summary-function" })
}

resource "aws_lambda_event_source_mapping" "article_summary_sqs" {
  event_source_arn = var.queue_arn
  function_name    = aws_lambda_function.article_summary.arn
}

resource "aws_lambda_function" "daily_summarization" {
  function_name = "${var.prefix}-daily-summarization-function"
  role          = aws_iam_role.ai_engine.arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.14"
  timeout       = 60
  memory_size   = 128

  filename = "dummy.zip"

  environment {
    variables = {
      MAX_EVENTS_PER_COUNTRY = "5"
      MODEL_ID               = "google.gemma-3-27b-it"
      SNS_TOPIC_ARN          = aws_sns_topic.daily_summary.arn
      DIGEST_PROMPT_ARN      = "${aws_bedrockagent_prompt.daily_summarization.arn}:DRAFT"
      TOP_N_COUNTRIES        = "3"
      DISCORD_WEBHOOK_URL    = ""
      NEWS_TABLE_NAME        = var.news_table_name

    }
  }


  tags = merge(var.common_tags, { Name = "${var.prefix}-daily-summarization-function" })
}

resource "aws_bedrockagent_prompt" "news_summarization" {
  provider        = aws.tokyo
  name            = "${var.prefix}-news-summarization"
  default_variant = "default"
  description     = "Classifies and summarizes conflict news articles for HIGH GUARD"

  variant {
    name          = "default"
    model_id      = "google.gemma-3-27b-it"
    template_type = "TEXT"

    inference_configuration {
      text {
        temperature = 0.1
        top_p       = 0.9
        max_tokens  = 500
      }
    }

    template_configuration {
      text {
        text = <<-EOT
You are a conflict intelligence analyst for the HIGH GUARD platform.
Your job is to analyze news articles about global conflicts and extract structured intelligence data.
RULES:
- Always respond ONLY in valid JSON format
- Never add explanation text outside the JSON
- If the article is not conflict-related, set category to "other" and severity to 1
- Country must be a full country name (e.g., "Ukraine" not "UA")
- Severity scoring guide:
    1 = Minor incident, protests, political statement
    2 = Small clashes, arrests, localized unrest
    3 = Significant violence, multiple casualties
    4 = Major attack, large-scale military operation
    5 = Critical event, mass casualties, war escalation
- Priority rule: severity 4-5 = "high", severity 3 = "medium", severity 1-2 = "low"
OUTPUT FORMAT (strict JSON, no other text):
{
  "summary": "2-3 sentence summary of the event",
  "country": "full country name",
  "category": "war | terrorism | political_unrest | humanitarian | other",
  "severity": 1-5,
  "priority": "high | medium | low"
}

Classify this article:

{{article_text}}
EOT
        input_variable {
          name = "article_text"
        }
      }
    }
  }

}

resource "aws_bedrockagent_prompt" "daily_summarization" {
  provider        = aws.tokyo
  name            = "${var.prefix}-daily-summarization"
  default_variant = "default"
  description     = "Builds a daily high-priority conflict digest for notification"

  variant {
    name          = "default"
    model_id      = "google.gemma-3-27b-it"
    template_type = "TEXT"

    inference_configuration {
      text {
        temperature = 0.1
        top_p       = 0.9
        max_tokens  = 1000
      }
    }

    template_configuration {
      text {
        text = <<-EOT
You are a senior conflict intelligence analyst for the HIGH GUARD platform.
Your job is to produce a concise daily briefing of the most critical global conflict events.

RULES:
- Always respond ONLY in valid JSON format
- Never add explanation text outside the JSON
- Focus only on high-priority events (severity 4-5)
- Rank events by severity, most critical first
- Keep each event summary to 1-2 sentences maximum
- If no high-priority events exist, set threat_level to "low" and events to empty array
- Threat level rules:
    critical = any event with severity 5
    high     = highest severity is 4
    medium   = highest severity is 3
    low      = no significant events

OUTPUT FORMAT (strict JSON, no other text):
{
  "date": "YYYY-MM-DD",
  "threat_level": "critical | high | medium | low",
  "total_high_priority_events": 0,
  "top_hotspots": ["country1", "country2", "country3"],
  "events": [
    {
      "country": "full country name",
      "category": "war | terrorism | political_unrest | humanitarian | other",
      "severity": 1-5,
      "headline": "one sentence headline",
      "summary": "1-2 sentence summary"
    }
  ],
  "global_assessment": "2-3 sentence overall assessment of global conflict situation today",
  "discord_message": "Short 2-3 line plain text version formatted for Discord"
}
EOT
      }
    }
  }

}

resource "aws_bedrockagent_prompt" "country_summarization" {
  provider        = aws.tokyo
  name            = "${var.prefix}-country-summarization"
  default_variant = "default"
  description     = "Dummy prompt for country summarization"

  variant {
    name          = "default"
    model_id      = "google.gemma-3-27b-it"
    template_type = "TEXT"

    inference_configuration {
      text {
        temperature = 0.1
        top_p       = 0.9
        max_tokens  = 500
      }
    }

    template_configuration {
      text {
        text = <<-EOT
You are a senior geopolitical analyst for the HIGH GUARD platform.
Your job is to analyze multiple conflict events for a specific country and produce a country-level intelligence briefing.

RULES:
- Always respond ONLY in valid JSON format
- Never add explanation text outside the JSON
- Base your analysis strictly on the events provided
- Overall severity = weighted average of all event severities (round to nearest integer)
- Trend rules:
    escalating    = most recent events have higher severity than older ones
    de-escalating = most recent events have lower severity than older ones
    stable        = severity is consistent across events

OUTPUT FORMAT (strict JSON, no other text):
{
  "country": "full country name",
  "situation_summary": "3-4 sentence overview of the overall conflict situation",
  "dominant_category": "war | terrorism | political_unrest | humanitarian | other",
  "overall_severity": 1-5,
  "trend": "escalating | stable | de-escalating",
  "total_events": 0,
  "high_priority_count": 0,
  "key_events": ["most critical event in one sentence", "second most critical event"],
  "last_updated": "ISO timestamp of most recent event"
}
EOT
      }
    }
  }

}

resource "aws_iam_role" "daily_summarization_scheduler" {
  name = "${var.prefix}-daily-summarization-scheduler-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "scheduler.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "daily_summarization_scheduler_policy" {
  name = "${var.prefix}-daily-summarization-scheduler-policy"
  role = aws_iam_role.daily_summarization_scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "lambda:InvokeFunction"
        Effect   = "Allow"
        Resource = aws_lambda_function.daily_summarization.arn
      }
    ]
  })
}

resource "aws_scheduler_schedule" "daily_summarization_schedule" {
  name                = "${var.prefix}-ai-engine-daily-alert-rule"
  schedule_expression = "cron(55 13 * * ? *)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.daily_summarization.arn
    role_arn = aws_iam_role.daily_summarization_scheduler.arn
  }
}
