variable "prefix" {
  type = string
}

variable "common_tags" {
  type = map(string)
}

variable "queue_arn" {
  type = string
}

variable "news_table_name" {
  type = string
}

variable "country_table_name" {
  type = string
}
