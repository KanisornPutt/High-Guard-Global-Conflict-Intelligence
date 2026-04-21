output "queue_url" {
  value = aws_sqs_queue.articles.id
}

output "queue_arn" {
  value = aws_sqs_queue.articles.arn
}

output "news_fetcher_function" {
  value = aws_lambda_function.news_fetcher.function_name
}
