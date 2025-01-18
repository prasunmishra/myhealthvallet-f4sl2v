# Core provider configuration with required providers
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }

  # Backend configuration for state management
  backend "s3" {
    bucket         = "phrsat-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "phrsat-terraform-locks"
  }
}

# Local variables for staging environment
locals {
  environment = "staging"
  region      = "us-west-2"
  
  common_tags = {
    Environment       = local.environment
    Project          = "PHRSAT"
    ManagedBy        = "Terraform"
    ComplianceLevel  = "HIPAA"
    DataSensitivity  = "High"
    CostCenter       = "Healthcare-IT"
  }

  compliance_tags = {
    "Compliance:HIPAA" = "true"
    "Compliance:GDPR"  = "true"
    "Compliance:SOC2"  = "true"
    DataClassification = "PHI"
    SecurityZone      = "Protected"
  }
}

# Provider configuration
provider "aws" {
  region = local.region
  default_tags {
    tags = merge(local.common_tags, local.compliance_tags)
  }
}

# API infrastructure module
module "api" {
  source = "../../modules/api"

  environment         = local.environment
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  
  api_gateway_name    = "phrsat-staging-api"
  enable_waf         = true
  
  api_instance_type  = "r5.xlarge"
  min_api_instances  = 3
  max_api_instances  = 10
  api_cpu_threshold  = 75

  security_config = {
    enable_encryption = true
    ssl_policy       = "ELBSecurityPolicy-TLS-1-2-2017-01"
    waf_rules        = ["AWSManagedRulesCommonRuleSet", "AWSManagedRulesHealthcareRuleSet"]
  }

  tags = merge(local.common_tags, local.compliance_tags)
}

# Database infrastructure module
module "database" {
  source = "../../modules/database"

  environment              = local.environment
  vpc_id                  = module.networking.vpc_id
  private_subnet_ids      = module.networking.private_subnet_ids
  
  mongodb_instance_size    = "M40"
  timescaledb_instance_class = "r5.2xlarge"
  redis_node_type         = "r6g.xlarge"
  elasticsearch_node_count = 3
  
  backup_retention_days   = 30
  enable_encryption      = true
  kms_key_id            = aws_kms_key.database.id

  backup_config = {
    automated_backup_window = "03:00-04:00"
    backup_frequency       = "daily"
    enable_point_in_time  = true
    retention_period      = "30"
  }

  tags = merge(local.common_tags, local.compliance_tags)
}

# Monitoring infrastructure module
module "monitoring" {
  source = "../../modules/monitoring"

  environment          = local.environment
  cluster_name        = "phrsat-staging"
  monitoring_namespace = "monitoring"
  
  retention_period    = 30
  metrics_scrape_interval = 30
  
  grafana_admin_password = var.grafana_admin_password

  monitoring_node_selector = {
    role        = "monitoring"
    compliance  = "hipaa"
    criticality = "high"
  }

  alert_config = {
    slack_webhook_url = var.slack_webhook_url
    pagerduty_key    = var.pagerduty_key
    alert_severity_levels = ["critical", "warning"]
  }

  tags = merge(local.common_tags, local.compliance_tags)
}

# KMS key for database encryption
resource "aws_kms_key" "database" {
  description             = "KMS key for PHRSAT staging database encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = merge(local.common_tags, local.compliance_tags, {
    Name = "phrsat-staging-db-encryption"
  })
}

# Outputs
output "api_endpoint" {
  description = "API Gateway endpoint URL for staging environment"
  value       = module.api.api_endpoint
  sensitive   = true
}

output "monitoring_dashboard" {
  description = "Grafana dashboard URL for staging environment monitoring"
  value       = module.monitoring.grafana_endpoint
  sensitive   = true
}

output "database_endpoints" {
  description = "Database endpoint information"
  value       = module.database.database_endpoints
  sensitive   = true
}