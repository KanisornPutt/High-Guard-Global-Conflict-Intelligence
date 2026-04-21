output "website_url" {
  value = "https://${aws_cloudfront_distribution.dashboard.domain_name}"
}

output "bucket_name" {
  value = aws_s3_bucket.dashboard.bucket
}
