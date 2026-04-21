locals {
  env    = lower(var.environment)
  app    = lower(var.app_name)
  prefix = "${local.app}-${local.env}"

  common_tags = {
    Environment = local.env
    Project     = local.app
    Region      = var.aws_region
    ManagedBy   = "Terraform"
  }
}

module "db" {
  source      = "../../modules/storage"
  prefix      = local.prefix
  common_tags = local.common_tags
}

module "ingestion" {
  source       = "../../modules/ingestion"
  prefix       = local.prefix
  common_tags  = local.common_tags
  news_api_key = var.news_api_key
}

module "ai" {
  source             = "../../modules/ai_engine"
  prefix             = local.prefix
  common_tags        = local.common_tags
  queue_arn          = module.ingestion.queue_arn
  news_table_name    = module.db.news_table_name
  country_table_name = module.db.country_table_name
  providers = {
    aws       = aws
    aws.tokyo = aws.tokyo
  }
}

module "api" {
  source               = "../../modules/api"
  prefix               = local.prefix
  common_tags          = local.common_tags
  sns_topic_arn        = module.ai.sns_topic_arn
  country_prompt_arn   = module.ai.country_prompt_arn
  turnstile_secret_key = var.turnstile_secret_key
  news_table_name      = module.db.news_table_name
  country_table_name   = module.db.country_table_name
}

module "frontend" {
  source      = "../../modules/frontend"
  prefix      = local.prefix
  common_tags = local.common_tags
}
