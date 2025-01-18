# Provider configuration for multi-region deployment
provider "aws" {
  region = "us-east-1"
  alias  = "primary"

  default_tags {
    tags = local.common_tags
  }
}

provider "aws" {
  region = "us-west-2"
  alias  = "secondary"

  default_tags {
    tags = local.common_tags
  }
}

provider "mongodbatlas" {
  public_key  = var.mongodb_atlas_public_key
  private_key = var.mongodb_atlas_private_key
}

# Local variables for environment configuration
locals {
  common_tags = {
    Project             = "PHRSAT"
    Environment         = "prod"
    ManagedBy          = "Terraform"
    ComplianceLevel    = "HIPAA"
    DataClassification = "PHI"
    CostCenter         = "Healthcare"
  }

  compliance_tags = {
    "hipaa:security"      = "enabled"
    "hipaa:encryption"    = "aes-256-gcm"
    "hipaa:audit"         = "enabled"
    "hipaa:backup"        = "enabled"
    "hipaa:dr"           = "multi-region"
  }

  dr_config = {
    primary_region   = "us-east-1"
    secondary_region = "us-west-2"
    failover_mode    = "active-passive"
    rto             = "4h"
    rpo             = "5m"
  }
}

# Primary region API infrastructure
module "api_primary" {
  source = "../../modules/api"
  providers = {
    aws = aws.primary
  }

  environment              = "prod"
  vpc_id                  = module.networking_primary.vpc_id
  private_subnet_ids      = module.networking_primary.private_subnet_ids
  enable_waf              = true
  api_gateway_version     = "2.8.1"
  min_api_instances       = 3
  max_api_instances       = 15
  api_cpu_threshold       = 75
  api_instance_type       = "r5.xlarge"

  tags = merge(local.common_tags, local.compliance_tags)
}

# Secondary region API infrastructure
module "api_secondary" {
  source = "../../modules/api"
  providers = {
    aws = aws.secondary
  }

  environment              = "prod"
  vpc_id                  = module.networking_secondary.vpc_id
  private_subnet_ids      = module.networking_secondary.private_subnet_ids
  enable_waf              = true
  api_gateway_version     = "2.8.1"
  min_api_instances       = 2
  max_api_instances       = 10
  api_cpu_threshold       = 75
  api_instance_type       = "r5.xlarge"

  tags = merge(local.common_tags, local.compliance_tags)
}

# Primary region database infrastructure
module "database_primary" {
  source = "../../modules/database"
  providers = {
    aws = aws.primary
  }

  environment                = "prod"
  vpc_id                    = module.networking_primary.vpc_id
  private_subnet_ids        = module.networking_primary.private_subnet_ids
  mongodb_instance_size     = "M40"
  timescaledb_instance_class = "r5.2xlarge"
  redis_node_type           = "r6g.xlarge"
  backup_retention_days     = 90
  enable_encryption         = true
  kms_key_id               = aws_kms_key.database_encryption.id

  tags = merge(local.common_tags, local.compliance_tags)
}

# Secondary region database infrastructure
module "database_secondary" {
  source = "../../modules/database"
  providers = {
    aws = aws.secondary
  }

  environment                = "prod"
  vpc_id                    = module.networking_secondary.vpc_id
  private_subnet_ids        = module.networking_secondary.private_subnet_ids
  mongodb_instance_size     = "M40"
  timescaledb_instance_class = "r5.2xlarge"
  redis_node_type           = "r6g.xlarge"
  backup_retention_days     = 90
  enable_encryption         = true
  kms_key_id               = aws_kms_key.database_encryption_secondary.id

  tags = merge(local.common_tags, local.compliance_tags)
}

# Primary region monitoring infrastructure
module "monitoring_primary" {
  source = "../../modules/monitoring"
  providers = {
    aws = aws.primary
  }

  environment            = "prod"
  cluster_name          = module.eks_primary.cluster_name
  monitoring_namespace  = "monitoring"
  retention_period      = 30
  metrics_scrape_interval = 30
  grafana_admin_password = var.grafana_admin_password

  monitoring_tags = merge(local.common_tags, local.compliance_tags)
}

# Secondary region monitoring infrastructure
module "monitoring_secondary" {
  source = "../../modules/monitoring"
  providers = {
    aws = aws.secondary
  }

  environment            = "prod"
  cluster_name          = module.eks_secondary.cluster_name
  monitoring_namespace  = "monitoring"
  retention_period      = 30
  metrics_scrape_interval = 30
  grafana_admin_password = var.grafana_admin_password

  monitoring_tags = merge(local.common_tags, local.compliance_tags)
}

# KMS keys for encryption
resource "aws_kms_key" "database_encryption" {
  provider = aws.primary

  description             = "KMS key for database encryption - Primary Region"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true

  tags = merge(local.common_tags, {
    Name = "phrsat-prod-db-encryption-primary"
  })
}

resource "aws_kms_key" "database_encryption_secondary" {
  provider = aws.secondary

  description             = "KMS key for database encryption - Secondary Region"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true

  tags = merge(local.common_tags, {
    Name = "phrsat-prod-db-encryption-secondary"
  })
}

# Outputs
output "api_endpoints" {
  description = "API Gateway endpoints for both regions"
  value = {
    primary_endpoint   = module.api_primary.api_endpoint
    secondary_endpoint = module.api_secondary.api_endpoint
    waf_id            = module.api_primary.waf_web_acl_id
  }
}

output "database_endpoints" {
  description = "Database endpoints with backup configuration"
  value = {
    mongodb_uri       = module.database_primary.mongodb_connection_string
    timescaledb_host = module.database_primary.timescaledb_endpoint
    backup_config = {
      retention_days = 90
      kms_key_id    = aws_kms_key.database_encryption.id
    }
  }
  sensitive = true
}

output "monitoring_urls" {
  description = "Monitoring system URLs"
  value = {
    grafana_url     = module.monitoring_primary.grafana_endpoint
    prometheus_url  = module.monitoring_primary.prometheus_endpoint
    audit_logs     = module.monitoring_primary.audit_log_bucket
  }
}