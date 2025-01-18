terraform {
  required_version = ">= 1.0.0"
}

# Environment configuration
variable "environment" {
  description = "Deployment environment (dev, staging, prod) with strict validation"
  type        = string
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

# Network configuration
variable "vpc_id" {
  description = "ID of the VPC where database resources will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for secure database deployment"
  type        = list(string)
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets required for high availability"
  }
}

variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access database resources"
  type        = list(string)
  default     = []
}

# MongoDB Atlas configuration
variable "mongodb_atlas_project_id" {
  description = "MongoDB Atlas project ID for cluster deployment"
  type        = string
  sensitive   = true
}

variable "mongodb_instance_size" {
  description = "MongoDB Atlas instance size with M40 default for production workloads"
  type        = string
  default     = "M40"
  validation {
    condition     = can(regex("^M(10|20|30|40|50|60|80)$", var.mongodb_instance_size))
    error_message = "Invalid MongoDB instance size specified"
  }
}

# TimescaleDB configuration
variable "timescaledb_instance_class" {
  description = "Instance class for TimescaleDB optimized for time-series data"
  type        = string
  default     = "r5.2xlarge"
}

# Redis configuration
variable "redis_node_type" {
  description = "Instance type for Redis cache nodes with r6g optimization"
  type        = string
  default     = "r6g.xlarge"
}

# Elasticsearch configuration
variable "elasticsearch_instance_type" {
  description = "Instance type for Elasticsearch nodes in the cluster"
  type        = string
  default     = "r5.large"
}

variable "elasticsearch_node_count" {
  description = "Number of nodes in Elasticsearch cluster for high availability"
  type        = number
  default     = 3
  validation {
    condition     = var.elasticsearch_node_count >= 3
    error_message = "Elasticsearch cluster must have at least 3 nodes for high availability"
  }
}

# Security and compliance configuration
variable "enable_encryption" {
  description = "Enable encryption at rest for all database resources (HIPAA requirement)"
  type        = bool
  default     = true
}

variable "kms_key_id" {
  description = "KMS key ID for database encryption (required for HIPAA compliance)"
  type        = string
  sensitive   = true
}

# Backup configuration
variable "backup_retention_days" {
  description = "Number of days to retain database backups with compliance consideration"
  type        = number
  default     = 30
  validation {
    condition     = var.backup_retention_days >= 30
    error_message = "Backup retention must be at least 30 days for compliance"
  }
}

# Resource tagging
variable "tags" {
  description = "Additional tags for database resources including compliance and environment markers"
  type        = map(string)
  default     = {}
}