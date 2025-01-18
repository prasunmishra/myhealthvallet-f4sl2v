# Terraform outputs for monitoring module
# Version: ~> 1.5

# Prometheus endpoint output
output "prometheus_endpoint" {
  description = "HTTPS endpoint URL for Prometheus server with TLS certificate"
  value       = "${helm_release.prometheus.status.service_url}"
  sensitive   = false
}

# Grafana endpoint output
output "grafana_endpoint" {
  description = "HTTPS endpoint URL for Grafana dashboard with TLS certificate"
  value       = "${helm_release.grafana.status.service_url}"
  sensitive   = false
}

# AlertManager endpoint output
output "alertmanager_endpoint" {
  description = "HTTPS endpoint URL for AlertManager with TLS certificate"
  value       = "${helm_release.alertmanager.status.service_url}"
  sensitive   = false
}

# Monitoring namespace output
output "monitoring_namespace" {
  description = "Kubernetes namespace where monitoring stack is deployed"
  value       = var.monitoring_namespace
  sensitive   = false
}

# Grafana admin credentials output
output "grafana_admin_credentials" {
  description = "Secure admin credentials for Grafana dashboard access with auto-rotated password"
  value = {
    username = "admin"
    password = var.grafana_admin_password
  }
  sensitive = true
}

# Prometheus retention period output
output "prometheus_retention_days" {
  description = "Configured data retention period for Prometheus in days, compliant with HIPAA requirements"
  value       = var.retention_period
  sensitive   = false
}

# Comprehensive monitoring resources output
output "monitoring_resources" {
  description = "Comprehensive information about deployed monitoring stack resources and configuration"
  value = {
    prometheus_version    = helm_release.prometheus.version
    grafana_version      = helm_release.grafana.version
    alertmanager_version = helm_release.alertmanager.version
    namespace            = var.monitoring_namespace
    node_selector        = var.monitoring_node_selector
  }
  sensitive = false
}