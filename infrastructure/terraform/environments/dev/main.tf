# Configure Terraform backend for development environment state management
terraform {
  backend "s3" {
    bucket         = "phrsat-terraform-state-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "phrsat-terraform-locks-dev"
  }
}

# Development environment specific configurations
locals {
  environment_config = {
    environment           = "dev"
    instance_type        = "t3.large"
    min_capacity         = 2
    max_capacity         = 4
    backup_retention_days = 7
    multi_az             = false
    auto_shutdown_enabled = true
    auto_shutdown_hours   = "19:00-07:00"
    spot_enabled         = true
    enhanced_monitoring  = false
    debug_logging        = true
  }
}

# API infrastructure module for development environment
module "api" {
  source = "../../modules/api"

  environment    = "dev"
  region         = var.aws_region
  instance_type  = local.environment_config.instance_type
  min_capacity   = local.environment_config.min_capacity
  max_capacity   = local.environment_config.max_capacity
  spot_enabled   = local.environment_config.spot_enabled
  auto_shutdown  = local.environment_config.auto_shutdown_enabled
  shutdown_hours = local.environment_config.auto_shutdown_hours
  debug_mode     = true
  log_level      = "DEBUG"
}

# Database infrastructure module for development environment
module "database" {
  source = "../../modules/database"

  environment           = "dev"
  region               = var.aws_region
  multi_az             = local.environment_config.multi_az
  backup_retention_days = local.environment_config.backup_retention_days
  instance_class       = "db.t3.large"
  auto_shutdown        = local.environment_config.auto_shutdown_enabled
  enhanced_monitoring  = local.environment_config.enhanced_monitoring
  debug_logging        = local.environment_config.debug_logging
  skip_final_snapshot  = true
}

# Output API endpoint for development environment access
output "api_endpoint" {
  value       = module.api.api_endpoint
  description = "API Gateway endpoint URL for development environment"
}

# Output database endpoints for development environment access
output "database_endpoints" {
  value = {
    mongodb    = module.database.mongodb_connection_string
    timescaledb = module.database.timescaledb_endpoint
  }
  description = "Database connection endpoints for development environment"
  sensitive   = true
}