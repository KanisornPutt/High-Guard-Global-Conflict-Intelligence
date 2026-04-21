terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "tokyo"
  region = "ap-northeast-1"
}
