# Provider configuration
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.0"
    }
  }
}

# Local variables
locals {
  common_tags = {
    Project          = "PHRSAT"
    Environment      = var.environment
    ManagedBy        = "Terraform"
    ComplianceLevel  = "HIPAA"
  }

  # Backup window calculation function
  backup_window = {
    mongodb     = "02:00-03:00"
    timescaledb = "03:00-04:00"
    redis       = "04:00-05:00"
    opensearch  = "05:00-06:00"
  }
}

# MongoDB Atlas Cluster
resource "mongodbatlas_cluster" "main" {
  project_id = var.mongodb_atlas_project_id
  name       = "phrsat-${var.environment}"
  
  # M40 dedicated cluster configuration
  provider_name               = "AWS"
  provider_instance_size_name = var.mongodb_instance_size
  provider_region_name       = data.aws_region.current.name
  
  # High availability configuration
  mongo_db_major_version = "6.0"
  pit_enabled           = true
  backup_enabled        = true
  
  # Advanced configuration
  provider_backup_enabled     = true
  provider_disk_iops         = 3000
  provider_encrypt_ebs_volume = true
  
  # Cluster configuration
  replication_specs {
    num_shards = 1
    regions_config {
      region_name     = data.aws_region.current.name
      electable_nodes = 3
      priority        = 7
      read_only_nodes = 0
    }
  }

  # Advanced security options
  encryption_at_rest_provider = "AWS"
  encryption_key_id          = var.kms_key_id
}

# TimescaleDB RDS Instance
resource "aws_db_instance" "timescaledb" {
  identifier = "phrsat-${var.environment}-timescaledb"
  
  # Instance configuration
  engine                = "postgres"
  engine_version        = "14.5"
  instance_class        = var.timescaledb_instance_class
  allocated_storage     = 100
  max_allocated_storage = 1000
  
  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.timescaledb.id]
  
  # High availability
  multi_az             = var.environment == "prod"
  publicly_accessible  = false
  
  # Backup configuration
  backup_retention_period = var.backup_retention_days
  backup_window          = local.backup_window.timescaledb
  
  # Security
  storage_encrypted     = true
  kms_key_id           = var.kms_key_id
  
  tags = merge(local.common_tags, {
    Name = "PHRSAT TimescaleDB"
  })
}

# Redis ElastiCache Cluster
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "phrsat-${var.environment}-redis"
  replication_group_description = "PHRSAT Redis cluster for session management"
  
  # Cluster configuration
  node_type                  = var.redis_node_type
  number_cache_clusters      = var.environment == "prod" ? 3 : 2
  automatic_failover_enabled = true
  
  # Network configuration
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  
  # Performance and backup
  parameter_group_name       = aws_elasticache_parameter_group.redis.name
  port                      = 6379
  snapshot_retention_limit   = var.backup_retention_days
  snapshot_window           = local.backup_window.redis
  
  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  kms_key_id                = var.kms_key_id
  
  tags = merge(local.common_tags, {
    Name = "PHRSAT Redis"
  })
}

# OpenSearch Domain
resource "aws_opensearch_domain" "main" {
  domain_name = "phrsat-${var.environment}"
  
  # Cluster configuration
  cluster_config {
    instance_type          = var.elasticsearch_instance_type
    instance_count         = var.elasticsearch_node_count
    zone_awareness_enabled = true
    
    zone_awareness_config {
      availability_zone_count = 3
    }
  }
  
  # Network configuration
  vpc_options {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.opensearch.id]
  }
  
  # Storage configuration
  ebs_options {
    ebs_enabled = true
    volume_size = 100
    volume_type = "gp3"
    iops        = 3000
  }
  
  # Encryption and security
  encrypt_at_rest {
    enabled    = true
    kms_key_id = var.kms_key_id
  }
  
  node_to_node_encryption {
    enabled = true
  }
  
  # Backup configuration
  snapshot_options {
    automated_snapshot_start_hour = split("-", local.backup_window.opensearch)[0]
  }
  
  tags = merge(local.common_tags, {
    Name = "PHRSAT OpenSearch"
  })
}

# Outputs
output "database_endpoints" {
  description = "Database endpoint information"
  value = {
    mongodb     = mongodbatlas_cluster.main.connection_strings[0].standard
    timescaledb = aws_db_instance.timescaledb.endpoint
    redis       = aws_elasticache_replication_group.redis.primary_endpoint_address
    opensearch  = aws_opensearch_domain.main.endpoint
  }
  sensitive = true
}

output "mongodb_connection_string" {
  description = "MongoDB Atlas connection string"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard
  sensitive   = true
}

# Security Groups
resource "aws_security_group" "timescaledb" {
  name        = "phrsat-${var.environment}-timescaledb"
  description = "Security group for TimescaleDB"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.security_group_ids
  }
  
  tags = local.common_tags
}

resource "aws_security_group" "redis" {
  name        = "phrsat-${var.environment}-redis"
  description = "Security group for Redis"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.security_group_ids
  }
  
  tags = local.common_tags
}

resource "aws_security_group" "opensearch" {
  name        = "phrsat-${var.environment}-opensearch"
  description = "Security group for OpenSearch"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = var.security_group_ids
  }
  
  tags = local.common_tags
}

# Subnet Groups
resource "aws_db_subnet_group" "main" {
  name       = "phrsat-${var.environment}-db"
  subnet_ids = var.private_subnet_ids
  
  tags = local.common_tags
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "phrsat-${var.environment}-redis"
  subnet_ids = var.private_subnet_ids
  
  tags = local.common_tags
}

# Data Sources
data "aws_region" "current" {}