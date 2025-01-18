# MongoDB Atlas outputs
output "mongodb_connection_string" {
  description = "MongoDB Atlas cluster connection string with authentication details"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard
  sensitive   = true
}

output "mongodb_cluster_id" {
  description = "MongoDB Atlas cluster identifier for reference"
  value       = mongodbatlas_cluster.main.cluster_id
}

output "mongodb_monitoring_endpoint" {
  description = "MongoDB Atlas monitoring endpoint for metrics collection"
  value       = mongodbatlas_cluster.main.monitoring_endpoint
  sensitive   = true
}

# TimescaleDB outputs
output "timescaledb_endpoint" {
  description = "TimescaleDB instance endpoint for application connections"
  value       = aws_db_instance.timescaledb.endpoint
  sensitive   = true
}

output "timescaledb_monitoring_endpoint" {
  description = "TimescaleDB enhanced monitoring endpoint"
  value       = aws_db_instance.timescaledb.enhanced_monitoring_arn
}

# Redis outputs
output "redis_endpoint" {
  description = "Redis cluster primary endpoint for application connections"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "redis_monitoring_endpoint" {
  description = "Redis cluster monitoring endpoint for metrics collection"
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
}

# Elasticsearch outputs
output "elasticsearch_endpoint" {
  description = "Elasticsearch domain endpoint for application connections"
  value       = aws_opensearch_domain.main.endpoint
  sensitive   = true
}

output "elasticsearch_monitoring_endpoint" {
  description = "Elasticsearch monitoring endpoint for metrics collection"
  value       = aws_opensearch_domain.main.dashboard_endpoint
}

# Backup and DR configuration outputs
output "backup_status_endpoint" {
  description = "Endpoint for checking backup status across all databases"
  value = {
    mongodb      = mongodbatlas_cluster.main.backup_enabled
    timescaledb  = aws_db_instance.timescaledb.backup_retention_period
    redis        = aws_elasticache_replication_group.redis.snapshot_retention_limit
    opensearch   = aws_opensearch_domain.main.snapshot_options[0].automated_snapshot_start_hour
  }
}

output "dr_configuration" {
  description = "Disaster recovery configuration details for all database services"
  value = {
    mongodb_replicas    = mongodbatlas_cluster.main.replication_specs[0].num_shards
    timescaledb_multiaz = aws_db_instance.timescaledb.multi_az
    redis_replicas      = aws_elasticache_replication_group.redis.number_cache_clusters
    opensearch_zones    = aws_opensearch_domain.main.cluster_config[0].zone_awareness_enabled
  }
}

# Security and audit outputs
output "audit_log_configuration" {
  description = "Audit logging configuration for database access and operations"
  value = {
    mongodb_audit_enabled     = mongodbatlas_cluster.main.pit_enabled
    timescaledb_log_exports  = aws_db_instance.timescaledb.enabled_cloudwatch_logs_exports
    redis_auth_enabled       = aws_elasticache_replication_group.redis.transit_encryption_enabled
    opensearch_audit_enabled = aws_opensearch_domain.main.advanced_security_options[0].enabled
  }
  sensitive = true
}

# Network configuration outputs
output "database_security_group_ids" {
  description = "Security group IDs associated with database resources"
  value = [
    aws_security_group.timescaledb.id,
    aws_security_group.redis.id,
    aws_security_group.opensearch.id
  ]
}

output "database_subnet_group_name" {
  description = "Name of the subnet group where database resources are deployed"
  value       = aws_db_subnet_group.main.name
}