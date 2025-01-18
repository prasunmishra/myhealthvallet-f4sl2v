# Core deployment environment variable
variable "environment" {
  type        = string
  description = "Deployment environment (dev/staging/prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Network configuration
variable "vpc_id" {
  type        = string
  description = "VPC ID where API infrastructure will be deployed"
  validation {
    condition     = can(regex("^vpc-[a-z0-9]{8,}$", var.vpc_id))
    error_message = "VPC ID must be a valid vpc-* identifier."
  }
}

# EKS configuration
variable "eks_cluster_name" {
  type        = string
  description = "Name of the EKS cluster for Fargate profile association"
}

# API Gateway configuration
variable "api_gateway_name" {
  type        = string
  description = "Name for the Kong API Gateway deployment"
  default     = "phrsat-api-gateway"
}

variable "api_gateway_version" {
  type        = string
  description = "Version of Kong API Gateway to deploy"
  default     = "2.8.1"
  validation {
    condition     = can(regex("^\\d+\\.\\d+\\.\\d+$", var.api_gateway_version))
    error_message = "API Gateway version must follow semantic versioning (x.y.z)."
  }
}

variable "api_instance_type" {
  type        = string
  description = "Instance type for API Gateway nodes"
  default     = "r5.xlarge"
}

# Autoscaling configuration
variable "enable_api_autoscaling" {
  type        = bool
  description = "Enable autoscaling for API Gateway nodes"
  default     = true
}

variable "min_api_instances" {
  type        = number
  description = "Minimum number of API Gateway instances"
  default     = 3
  validation {
    condition     = var.min_api_instances >= 2
    error_message = "Minimum API instances must be at least 2 for high availability."
  }
}

variable "max_api_instances" {
  type        = number
  description = "Maximum number of API Gateway instances"
  default     = 15
  validation {
    condition     = var.max_api_instances <= 20
    error_message = "Maximum API instances cannot exceed 20 for cost control."
  }
}

variable "api_cpu_threshold" {
  type        = number
  description = "CPU utilization threshold percentage for autoscaling"
  default     = 75
  validation {
    condition     = var.api_cpu_threshold >= 50 && var.api_cpu_threshold <= 90
    error_message = "CPU threshold must be between 50 and 90 percent."
  }
}

# Security configuration
variable "enable_waf" {
  type        = bool
  description = "Enable WAF protection for API Gateway"
  default     = true
}

variable "waf_rules" {
  type = list(map(string))
  description = "List of WAF rules to apply"
  default = [
    {
      name     = "AWSManagedRulesCommonRuleSet"
      priority = "1"
    },
    {
      name     = "AWSManagedRulesKnownBadInputsRuleSet"
      priority = "2"
    },
    {
      name     = "AWSManagedRulesATPRuleSet"
      priority = "3"
    }
  ]
  validation {
    condition = alltrue([
      for rule in var.waf_rules : 
      can(regex("^[A-Za-z0-9]+$", rule.name)) && 
      can(regex("^[0-9]+$", rule.priority))
    ])
    error_message = "WAF rules must have valid names and numeric priorities."
  }
}

# Resource limits
variable "api_memory_limit" {
  type        = string
  description = "Memory limit for API Gateway pods"
  default     = "4Gi"
  validation {
    condition     = can(regex("^\\d+[MGT]i$", var.api_memory_limit))
    error_message = "Memory limit must be specified in Mi, Gi, or Ti units."
  }
}

variable "api_cpu_limit" {
  type        = string
  description = "CPU limit for API Gateway pods"
  default     = "2000m"
  validation {
    condition     = can(regex("^\\d+m$", var.api_cpu_limit))
    error_message = "CPU limit must be specified in millicores (e.g., 1000m)."
  }
}

# Rate limiting configuration
variable "rate_limiting_config" {
  type = object({
    enabled     = bool
    requests    = number
    per_seconds = number
  })
  description = "Rate limiting configuration for API Gateway"
  default = {
    enabled     = true
    requests    = 1000
    per_seconds = 3600
  }
  validation {
    condition     = var.rate_limiting_config.requests > 0 && var.rate_limiting_config.per_seconds > 0
    error_message = "Rate limiting values must be positive numbers."
  }
}

# Health check configuration
variable "health_check_config" {
  type = object({
    path                = string
    port                = number
    initial_delay_secs  = number
    period_secs         = number
    timeout_secs        = number
    failure_threshold   = number
  })
  description = "Health check configuration for API Gateway"
  default = {
    path                = "/health"
    port                = 8000
    initial_delay_secs  = 30
    period_secs         = 10
    timeout_secs        = 5
    failure_threshold   = 3
  }
  validation {
    condition     = var.health_check_config.port > 0 && var.health_check_config.port <= 65535
    error_message = "Health check port must be between 1 and 65535."
  }
}