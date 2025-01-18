# Core Terraform functionality for variable definitions and validation rules
# terraform ~> 1.0

# Environment name for resource tagging and environment-specific configurations
variable "environment" {
  description = "Environment name for resource tagging (dev, staging, prod) with strict validation"
  type        = string
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

# VPC CIDR block configuration for network segmentation
variable "vpc_cidr" {
  description = "CIDR block for the VPC with validation for proper IPv4 format"
  type        = string
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

# Private subnet configuration for secure internal resources
variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets with non-empty validation"
  type        = list(string)
  
  validation {
    condition     = length(var.private_subnet_cidrs) > 0
    error_message = "At least one private subnet CIDR must be provided"
  }
}

# Public subnet configuration for internet-facing resources
variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets with non-empty validation"
  type        = list(string)
  
  validation {
    condition     = length(var.public_subnet_cidrs) > 0
    error_message = "At least one public subnet CIDR must be provided"
  }
}

# Availability zone configuration for high availability
variable "availability_zones" {
  description = "List of availability zones for subnet distribution with minimum count validation"
  type        = list(string)
  
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least two availability zones must be provided for high availability"
  }
}

# NAT Gateway configuration for private subnet internet access
variable "enable_nat_gateway" {
  description = "Flag to enable NAT Gateway for private subnets, defaulting to true for security"
  type        = bool
  default     = true
}

# High availability configuration for NAT Gateways
variable "single_nat_gateway" {
  description = "Flag to use a single NAT Gateway instead of one per AZ, defaulting to false for high availability"
  type        = bool
  default     = false
}

# Resource tagging configuration
variable "tags" {
  description = "Additional tags for all networking resources with default empty map"
  type        = map(string)
  default     = {}
}