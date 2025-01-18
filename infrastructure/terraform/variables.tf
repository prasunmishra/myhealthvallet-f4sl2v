# Project identification
variable "project" {
  type        = string
  default     = "phrsat"
  description = "Project identifier for resource naming and tagging"
  
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project))
    error_message = "Project name must consist of lowercase alphanumeric characters and hyphens only."
  }
}

# Environment specification
variable "environment" {
  type        = string
  description = "Deployment environment (dev/staging/prod)"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Regional configuration
variable "aws_region" {
  type        = string
  description = "Primary AWS region for deployment"
  
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]{1}$", var.aws_region))
    error_message = "AWS region must be a valid region identifier (e.g., us-east-1)."
  }
}

variable "secondary_region" {
  type        = string
  description = "Secondary AWS region for disaster recovery"
  
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]{1}$", var.secondary_region))
    error_message = "Secondary AWS region must be a valid region identifier (e.g., us-west-2)."
  }
}

# Security controls
variable "allowed_account_ids" {
  type        = list(string)
  description = "List of allowed AWS account IDs"
  
  validation {
    condition     = length([for id in var.allowed_account_ids : id if can(regex("^[0-9]{12}$", id))]) == length(var.allowed_account_ids)
    error_message = "All AWS account IDs must be 12-digit numbers."
  }
}

# Network configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC"
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

# Security features
variable "enable_encryption" {
  type        = bool
  default     = true
  description = "Enable AES-256-GCM encryption for all applicable resources"
}

# Kubernetes configuration
variable "eks_cluster_version" {
  type        = string
  description = "EKS cluster version"
  
  validation {
    condition     = can(regex("^1\\.(2[7-9]|[3-9][0-9])\\.[0-9]+$", var.eks_cluster_version))
    error_message = "EKS cluster version must be 1.27.0 or higher."
  }
}

# WAF configuration
variable "enable_waf" {
  type        = bool
  default     = true
  description = "Enable WAF with HIPAA-compliant rule sets"
}

# Database configurations
variable "mongodb_instance_size" {
  type        = string
  description = "MongoDB Atlas instance size"
  
  validation {
    condition     = contains(["M40", "M50", "M60", "M80"], var.mongodb_instance_size)
    error_message = "MongoDB instance size must be one of: M40, M50, M60, M80."
  }
}

variable "timescaledb_instance_class" {
  type        = string
  description = "TimescaleDB instance class"
  
  validation {
    condition     = can(regex("^(db|cache)\\.r[5-6][g]?\\.[2-8]xlarge$", var.timescaledb_instance_class))
    error_message = "TimescaleDB instance class must be a valid r5/r6 instance type."
  }
}

variable "redis_node_type" {
  type        = string
  description = "Redis cache node type"
  
  validation {
    condition     = can(regex("^cache\\.r[5-6][g]?\\.(large|xlarge|2xlarge)$", var.redis_node_type))
    error_message = "Redis node type must be a valid r5/r6 cache instance type."
  }
}

# Backup configuration
variable "backup_retention_days" {
  type        = number
  description = "Backup retention period in days"
  
  validation {
    condition     = var.backup_retention_days >= 30
    error_message = "Backup retention period must be at least 30 days for HIPAA compliance."
  }
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default = {
    "Compliance:HIPAA" = "true"
    "DataClassification" = "PHI"
    "Environment" = "production"
    "ManagedBy" = "terraform"
  }
  
  validation {
    condition     = contains(keys(var.tags), "Compliance:HIPAA") && contains(keys(var.tags), "DataClassification")
    error_message = "Tags must include required compliance and data classification tags."
  }
}