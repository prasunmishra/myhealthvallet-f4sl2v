terraform {
  # Enforce minimum Terraform version for security features
  required_version = ">= 1.5.0"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g., prod, staging, dev) for HIPAA-compliant resource segregation"
  
  validation {
    condition     = contains(["prod", "staging", "dev"], lower(var.environment))
    error_message = "Environment must be one of: prod, staging, dev"
  }
}

variable "project_name" {
  type        = string
  description = "Project identifier for resource naming and tagging in compliance with security standards"
}

variable "region" {
  type        = string
  description = "AWS region for security resource deployment with data residency compliance"
  
  validation {
    condition     = can(regex("^(us|eu|ap|sa|ca|me|af)-[a-z]+-[0-9]+$", var.region))
    error_message = "Region must be a valid AWS region identifier"
  }
}

variable "kms_deletion_window" {
  type        = number
  description = "KMS key deletion window in days for PHI data protection (7-30 days per HIPAA requirements)"
  default     = 30
  
  validation {
    condition     = var.kms_deletion_window >= 7 && var.kms_deletion_window <= 30
    error_message = "KMS key deletion window must be between 7 and 30 days for compliance"
  }
}

variable "waf_block_rate_limit" {
  type        = number
  description = "WAF rate limit for request blocking (requests per 5-minute period)"
  default     = 2000
  
  validation {
    condition     = var.waf_block_rate_limit >= 100 && var.waf_block_rate_limit <= 20000
    error_message = "WAF block rate limit must be between 100 and 20000 requests"
  }
}

variable "vpc_id" {
  type        = string
  description = "VPC ID for security group creation and network isolation"
  sensitive   = true
}

variable "allowed_cidrs" {
  type        = list(string)
  description = "List of allowed CIDR blocks for security group rules"
  default     = ["10.0.0.0/8"]
  
  validation {
    condition     = alltrue([for cidr in var.allowed_cidrs : can(cidrhost(cidr, 0))])
    error_message = "All elements must be valid CIDR blocks"
  }
}

variable "enable_guardduty" {
  type        = bool
  description = "Enable AWS GuardDuty for threat detection and continuous security monitoring"
  default     = true
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for security components including compliance and PHI data handling tags"
  default = {
    "Compliance:HIPAA" = "true"
    "Compliance:GDPR"  = "true"
    "Compliance:SOC2"  = "true"
    "DataClass"        = "PHI"
    "SecurityZone"     = "restricted"
  }
}