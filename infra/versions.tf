terraform {
  required_version = ">= 1.10"

  # The organization is peach_katttern (there is no ooad-katttern organization).
  cloud {
    organization = "peach_katttern"

    workspaces {
      name = "peach-dev"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}

provider "aws" {
  region = var.region

  # ManagedBy = "terraform" is left out until the import is applied: no
  # imported resource has it, so it would show as a change on 24 resources.
  default_tags {
    tags = {
      PROJECT_NAME = var.project_name
    }
  }
}

# For the imported resources that have no tags at all in AWS (the template
# gave them none): the event source mapping, the S3 endpoint and the SG rules.
provider "aws" {
  alias  = "untagged"
  region = var.region
}

data "aws_caller_identity" "current" {}
