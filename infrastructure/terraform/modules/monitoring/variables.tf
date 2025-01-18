# Core Terraform configuration
terraform {
  required_version = "~> 1.5"
}

# Environment validation
variable "environment" {
  description = "Deployment environment (dev, staging, prod) with strict validation"
  type        = string
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

# Cluster configuration
variable "cluster_name" {
  description = "Name of the EKS cluster where monitoring stack will be deployed"
  type        = string
  
  validation {
    condition     = length(var.cluster_name) >= 3 && length(var.cluster_name) <= 40
    error_message = "Cluster name must be between 3 and 40 characters"
  }
}

# Namespace configuration
variable "monitoring_namespace" {
  description = "Kubernetes namespace for monitoring components with validation"
  type        = string
  default     = "monitoring"
  
  validation {
    condition     = can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", var.monitoring_namespace))
    error_message = "Namespace must consist of lowercase alphanumeric characters or '-'"
  }
}

# Prometheus configuration
variable "retention_period" {
  description = "Data retention period for Prometheus in days with compliance limits"
  type        = number
  default     = 15
  
  validation {
    condition     = var.retention_period >= 7 && var.retention_period <= 90
    error_message = "Retention period must be between 7 and 90 days for compliance"
  }
}

variable "metrics_scrape_interval" {
  description = "Interval for metrics collection in seconds with performance validation"
  type        = number
  default     = 30
  
  validation {
    condition     = var.metrics_scrape_interval >= 15 && var.metrics_scrape_interval <= 300
    error_message = "Scrape interval must be between 15 and 300 seconds"
  }
}

# Grafana security configuration
variable "grafana_admin_password" {
  description = "Admin password for Grafana dashboard with security requirements"
  type        = string
  sensitive   = true
  
  validation {
    condition     = length(var.grafana_admin_password) >= 12 && can(regex("^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,}$", var.grafana_admin_password))
    error_message = "Password must be at least 12 characters and contain uppercase, lowercase, number, and special character"
  }
}

# Node selector configuration
variable "monitoring_node_selector" {
  description = "Node selector for monitoring components deployment with required labels"
  type        = map(string)
  default     = {
    role        = "monitoring"
    compliance  = "hipaa"
    criticality = "high"
  }
  
  validation {
    condition     = contains(keys(var.monitoring_node_selector), "role") && var.monitoring_node_selector["role"] == "monitoring"
    error_message = "Node selector must include monitoring role label"
  }
}

# Resource tagging
variable "monitoring_tags" {
  description = "Tags to be applied to monitoring resources with compliance requirements"
  type        = map(string)
  default     = {
    Component           = "Monitoring"
    ManagedBy          = "Terraform"
    ComplianceLevel    = "HIPAA"
    CostCenter         = "Infrastructure"
    MaintenanceWindow  = "Sunday-0200-0400-UTC"
    DataClassification = "Sensitive"
    BackupFrequency    = "Daily"
  }
}