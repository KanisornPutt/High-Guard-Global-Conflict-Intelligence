output "base_url" {
  description = "The URL of the API Gateway"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "country_news_function" {
  value = aws_lambda_function.country_news.function_name
}

output "country_overview_function" {
  value = aws_lambda_function.country_overview.function_name
}

output "country_summary_function" {
  value = aws_lambda_function.country_summary.function_name
}

output "subscription_function" {
  value = aws_lambda_function.subscription.function_name
}
