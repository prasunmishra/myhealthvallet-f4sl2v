# Core Terraform functionality for variable definitions
# terraform ~> 1.5

variable "project_name" {
  type        = string
  description = "Name of the PHRSAT project used for resource naming"
  default     = "phrsat"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens"
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region for S3 bucket deployment"
  default     = "us-east-1"
}

variable "kms_key_id" {
  type        = string
  description = "ARN of KMS key for S3 bucket encryption"
  sensitive   = true
}

variable "glacier_transition_days" {
  type        = number
  description = "Number of days after which objects transition to Glacier storage"
  default     = 365

  validation {
    condition     = var.glacier_transition_days >= 90
    error_message = "Glacier transition must be at least 90 days"
  }
}

variable "retention_period_days" {
  type        = number
  description = "Number of days to retain objects before deletion"
  default     = 2555  # 7 years

  validation {
    condition     = var.retention_period_days >= 2555
    error_message = "Retention period must be at least 7 years (2555 days) for HIPAA compliance"
  }
}

variable "enable_versioning" {
  type        = bool
  description = "Enable versioning for the S3 bucket"
  default     = true
}

variable "enable_logging" {
  type        = bool
  description = "Enable access logging for the S3 bucket"
  default     = true
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to storage resources"
  default     = {}
}