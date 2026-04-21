variable "environment" {
  type    = string
  default = "dev"
}

variable "app_name" {
  type    = string
  default = "highguard"
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "news_api_key" {
  type = string
}

variable "turnstile_secret_key" {
  type = string
}