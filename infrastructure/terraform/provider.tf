# Configure Terraform and required providers with security-focused version constraints
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

# Primary region provider configuration with enhanced security settings
provider "aws" {
  region = var.aws_region
  allowed_account_ids = var.allowed_account_ids

  # Enable consistent resource tagging for compliance and cost tracking
  default_tags = var.tags

  # Implement least privilege access through role assumption
  assume_role {
    role_arn     = "arn:aws:iam::${var.allowed_account_ids[0]}:role/TerraformExecutionRole"
    session_name = "TerraformPrimaryRegion"
    external_id  = "PHRSAT_TF_PRIMARY"
  }
}

# Secondary region provider for disaster recovery and high availability
provider "aws" {
  alias  = "secondary"
  region = var.secondary_region
  allowed_account_ids = var.allowed_account_ids

  # Maintain consistent tagging across regions
  default_tags = var.tags

  # Use identical security controls in secondary region
  assume_role {
    role_arn     = "arn:aws:iam::${var.allowed_account_ids[0]}:role/TerraformExecutionRole"
    session_name = "TerraformSecondaryRegion"
    external_id  = "PHRSAT_TF_SECONDARY"
  }
}