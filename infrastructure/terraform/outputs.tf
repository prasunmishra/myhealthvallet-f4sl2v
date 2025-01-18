# Core database outputs
output "mongodb_uri" {
  description = "MongoDB Atlas connection string for primary and secondary clusters with high availability configuration"
  value       = module.mongodb.connection_string
  sensitive   = true
}

output "timescaledb_host" {
  description = "TimescaleDB endpoint for health metrics storage and analysis with read replica information"
  value       = module.timescaledb.primary_endpoint
}

output "redis_host" {
  description = "Redis cluster endpoint for distributed caching and session management across regions"
  value       = module.elasticache.primary_endpoint
}

output "elasticsearch_host" {
  description = "Elasticsearch service endpoint for full-text search and analytics capabilities"
  value       = module.elasticsearch.domain_endpoint
}

# API and networking outputs
output "api_gateway_endpoint" {
  description = "Regional API Gateway endpoints with stage information for the PHRSAT platform"
  value       = module.api_gateway.invoke_url
}

# Monitoring and observability outputs
output "monitoring_endpoints" {
  description = "Endpoints for monitoring and observability services including Prometheus, Grafana, and AlertManager"
  value = {
    prometheus = module.monitoring.prometheus_endpoint
    grafana    = module.monitoring.grafana_endpoint
    alertmanager = module.monitoring.alertmanager_endpoint
    datadog_api = module.monitoring.datadog_api_endpoint
  }
}

# High availability and disaster recovery outputs
output "backup_configuration" {
  description = "Backup and recovery configuration details including S3 buckets, retention policies, and restore procedures"
  value = {
    primary_backup_bucket   = module.backup.primary_bucket_name
    secondary_backup_bucket = module.backup.secondary_bucket_name
    retention_period       = module.backup.retention_days
    backup_frequency       = module.backup.backup_schedule
    restore_procedure_doc  = module.backup.restore_procedure_url
  }
}

# Security and compliance outputs
output "security_endpoints" {
  description = "Security-related endpoints and configurations for WAF, monitoring, and compliance"
  value = {
    waf_endpoint     = module.security.waf_endpoint
    audit_log_bucket = module.security.audit_log_bucket
    siem_endpoint    = module.security.siem_endpoint
  }
}

# Regional deployment outputs
output "regional_configuration" {
  description = "Multi-region deployment configuration for high availability and failover"
  value = {
    primary_region = {
      load_balancer = module.primary_region.load_balancer_dns
      kubernetes_api = module.primary_region.kubernetes_api_endpoint
      vpc_id        = module.primary_region.vpc_id
    }
    dr_region = {
      load_balancer = module.dr_region.load_balancer_dns
      kubernetes_api = module.dr_region.kubernetes_api_endpoint
      vpc_id        = module.dr_region.vpc_id
    }
  }
}

# CDN and edge location outputs
output "cdn_configuration" {
  description = "Content delivery network configuration and edge locations"
  value = {
    cloudfront_domain = module.cdn.cloudfront_domain_name
    edge_locations    = module.cdn.edge_location_list
    waf_acl_id       = module.cdn.waf_acl_id
  }
}

# Service mesh outputs
output "service_mesh_configuration" {
  description = "Service mesh configuration details for inter-service communication"
  value = {
    istio_ingress    = module.service_mesh.ingress_gateway_endpoint
    istio_monitoring = module.service_mesh.monitoring_dashboard_url
    mesh_policy      = module.service_mesh.security_policy_version
  }
}

# Container registry outputs
output "container_registry" {
  description = "Container registry endpoints and configuration for application images"
  value = {
    registry_url     = module.ecr.repository_url
    registry_name    = module.ecr.repository_name
    scan_on_push    = module.ecr.scan_on_push_enabled
  }
}

# Secrets management outputs
output "secrets_configuration" {
  description = "Secrets management configuration and endpoints"
  value = {
    secrets_endpoint = module.secrets.secrets_manager_endpoint
    kms_key_id      = module.secrets.kms_key_id
    rotation_status = module.secrets.rotation_enabled
  }
  sensitive = true
}