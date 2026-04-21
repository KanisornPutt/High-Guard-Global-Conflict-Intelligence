output "sns_topic_arn" {
  value = aws_sns_topic.daily_summary.arn
}

output "article_summary_function" {
  value = aws_lambda_function.article_summary.function_name
}

output "daily_summarization_function" {
  value = aws_lambda_function.daily_summarization.function_name
}

output "country_prompt_arn" {
  value = aws_bedrockagent_prompt.country_summarization.arn
}

output "prompt_news_id" {
  value = aws_bedrockagent_prompt.news_summarization.id
}

output "prompt_daily_id" {
  value = aws_bedrockagent_prompt.daily_summarization.id
}

output "prompt_country_id" {
  value = aws_bedrockagent_prompt.country_summarization.id
}
