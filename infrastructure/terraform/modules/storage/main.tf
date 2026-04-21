resource "aws_dynamodb_table" "news_summary" {
  name         = "${var.prefix}-news-summary"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "eventId"
  range_key    = "timeStamp"

  attribute {
    name = "eventId"
    type = "S"
  }

  attribute {
    name = "timeStamp"
    type = "S"
  }

  attribute {
    name = "country"
    type = "S"
  }

  attribute {
    name = "articleURL"
    type = "S"
  }

  global_secondary_index {
    name            = "country-timeStamp-index"
    hash_key        = "country"
    range_key       = "timeStamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "articleURL-index"
    hash_key        = "articleURL"
    projection_type = "KEYS_ONLY"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-news-summary" })
}

resource "aws_dynamodb_table" "country_summary" {
  name         = "${var.prefix}-country-summary"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "country"
  range_key    = "lastUpdated"

  attribute {
    name = "country"
    type = "S"
  }

  attribute {
    name = "lastUpdated"
    type = "S"
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-country-summary" })
}
