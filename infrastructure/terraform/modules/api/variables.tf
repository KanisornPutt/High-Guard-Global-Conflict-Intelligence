variable "prefix" {
  type = string
}

variable "common_tags" {
  type = map(string)
}

variable "sns_topic_arn" {
  description = "SNS Topic ARN for triggering the article summary lambda"
  type        = string
}

variable "country_prompt_arn" {
  description = "ARN for the country summarization prompt"
  type        = string
}

variable "turnstile_secret_key" {
  description = "Turnstile secret key"
  type        = string
}

variable "news_table_name" {
  type = string
}

variable "country_table_name" {
  type = string
}
