# 1. S3 Bucket for storing React files (index.html, js, css)
resource "aws_s3_bucket" "dashboard" {
  bucket = "${var.prefix}-frontend-dashboard-bucket"
  force_destroy = true
  tags = merge(var.common_tags, { Name = "${var.prefix}-frontend-dashboard-bucket" })
}

# 2. Block Public Access to S3 (force access through CloudFront only)
resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 3. Create CloudFront Origin Access Control (OAC)
resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "${var.prefix}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# 4. CloudFront Distribution (CDN)
resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.dashboard.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.dashboard.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.dashboard.id}"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(var.common_tags, { Name = "${var.prefix}-frontend-cdn" })
}

# 5. Upload Dummy file to S3 (prevent CloudFront from returning 403/404)
resource "aws_s3_object" "dummy_index" {
  bucket       = aws_s3_bucket.dashboard.id
  key          = "index.html"
  content      = "<html><body><h1>HighGuard Dashboard is ready!</h1><p>Deploy your frontend here.</p></body></html>"
  content_type = "text/html"

  lifecycle {
    ignore_changes = [content]
  }
}

# 6. S3 Bucket Policy (allow CloudFront to read files)
resource "aws_s3_bucket_policy" "allow_cloudfront" {

  bucket = aws_s3_bucket.dashboard.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = "s3:GetObject"
      Effect   = "Allow"
      Resource = "${aws_s3_bucket.dashboard.arn}/*"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.dashboard.arn
        }
      }
    }]
  })
}

