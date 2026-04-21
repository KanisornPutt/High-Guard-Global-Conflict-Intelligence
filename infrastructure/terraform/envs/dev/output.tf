output "api_url" {
  value = module.api.base_url
}

output "website_url" {
  value = module.frontend.website_url
}

output "frontend_bucket_name" {
  value = module.frontend.bucket_name
}

output "api_country_news" {
  value = module.api.country_news_function
}

output "api_country_overview" {
  value = module.api.country_overview_function
}

output "api_country_summary" {
  value = module.api.country_summary_function
}

output "api_subscription" {
  value = module.api.subscription_function
}

output "ai_article_summary" {
  value = module.ai.article_summary_function
}

output "ai_daily_summarization" {
  value = module.ai.daily_summarization_function
}

output "ingestion_news_fetcher" {
  value = module.ingestion.news_fetcher_function
}

output "ai_prompt_news_id" {
  value = module.ai.prompt_news_id
}

output "ai_prompt_daily_id" {
  value = module.ai.prompt_daily_id
}

output "ai_prompt_country_id" {
  value = module.ai.prompt_country_id
}
