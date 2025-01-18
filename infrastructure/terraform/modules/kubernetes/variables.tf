# Core Terraform functionality for variable definitions and validation rules
# terraform ~> 1.0

# Cluster name configuration with strict naming conventions
variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string

  validation {
    condition     = length(var.cluster_name) <= 40 && can(regex("^[a-zA-Z][a-zA-Z0-9-]*$", var.cluster_name))
    error_message = "Cluster name must be 40 characters or less and start with a letter, containing only alphanumeric characters and hyphens"
  }
}

# Kubernetes version configuration with supported version validation
variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.27"

  validation {
    condition     = can(regex("^1\\.(2[6-7])$", var.kubernetes_version))
    error_message = "Kubernetes version must be 1.26 or 1.27"
  }
}

# Node group configuration with comprehensive validation rules
variable "node_groups" {
  description = "Map of node group configurations with enhanced validation"
  type = map(object({
    instance_type = string
    min_size      = number
    max_size      = number
    desired_size  = number
    disk_size     = number
  }))

  default = {
    api = {
      instance_type = "r5.xlarge"
      min_size      = 3
      max_size      = 15
      desired_size  = 3
      disk_size     = 100
    }
    worker = {
      instance_type = "c5.2xlarge"
      min_size      = 2
      max_size      = 10
      desired_size  = 2
      disk_size     = 100
    }
    analytics = {
      instance_type = "p3.2xlarge"
      min_size      = 1
      max_size      = 5
      desired_size  = 1
      disk_size     = 200
    }
  }

  validation {
    condition     = alltrue([for k, v in var.node_groups : contains(["r5.xlarge", "c5.2xlarge", "p3.2xlarge"], v.instance_type) && v.disk_size >= 100 && v.min_size <= v.desired_size && v.desired_size <= v.max_size])
    error_message = "Invalid node group configuration. Check instance types, disk sizes, and scaling parameters"
  }
}

# Cluster encryption configuration with KMS key validation
variable "cluster_encryption_config" {
  description = "EKS cluster encryption configuration with enhanced validation"
  type = object({
    enable     = bool
    kms_key_id = string
  })

  default = {
    enable     = true
    kms_key_id = null
  }

  validation {
    condition     = !var.cluster_encryption_config.enable || (var.cluster_encryption_config.enable && can(regex("^arn:aws:kms:[a-z0-9-]+:[0-9]+:key/[a-f0-9-]+$", coalesce(var.cluster_encryption_config.kms_key_id, "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"))))
    error_message = "When encryption is enabled, a valid KMS key ARN must be provided"
  }
}

# Control plane logging configuration with required audit logging
variable "cluster_log_types" {
  description = "List of control plane logging types to enable with validation"
  type        = list(string)
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  validation {
    condition     = length(setsubtract(var.cluster_log_types, ["api", "audit", "authenticator", "controllerManager", "scheduler"])) == 0 && contains(var.cluster_log_types, "audit")
    error_message = "Invalid log types specified or required audit logging is missing"
  }
}

# VPC configuration for EKS cluster networking
variable "vpc_id" {
  description = "VPC ID for EKS cluster deployment"
  type        = string

  validation {
    condition     = can(regex("^vpc-[a-f0-9]+$", var.vpc_id))
    error_message = "VPC ID must be a valid vpc-* identifier"
  }
}

# Subnet configuration for EKS node groups
variable "private_subnet_ids" {
  description = "Private subnet IDs for node groups"
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2 && alltrue([for id in var.private_subnet_ids : can(regex("^subnet-[a-f0-9]+$", id))])
    error_message = "At least two valid subnet IDs (subnet-*) must be provided for high availability"
  }
}

# Tags for resource management and cost allocation
variable "tags" {
  description = "Additional tags for all EKS cluster resources"
  type        = map(string)
  default     = {}

  validation {
    condition     = length(var.tags) <= 50
    error_message = "Maximum of 50 tags can be specified"
  }
}