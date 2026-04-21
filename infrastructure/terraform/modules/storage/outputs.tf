output "table_arn" {
  value = aws_dynamodb_table.news_summary.arn
}
output "news_table_name" {
  value = aws_dynamodb_table.news_summary.name
}
output "country_table_name" {
  value = aws_dynamodb_table.country_summary.name
}
