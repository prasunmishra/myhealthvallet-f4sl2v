# Core provider configuration
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.9.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.67.0"
    }
  }
}

# Data sources for EKS cluster access
data "aws_eks_cluster" "this" {
  name = var.cluster_name
}

data "aws_eks_cluster_auth" "this" {
  name = var.cluster_name
}

# KMS key for monitoring data encryption
resource "aws_kms_key" "monitoring" {
  description             = "KMS key for monitoring stack encryption"
  deletion_window_in_days = 7
  enable_key_rotation    = true
  
  tags = merge(var.monitoring_tags, {
    Name = "${var.cluster_name}-monitoring-encryption"
  })
}

# Create dedicated monitoring namespace
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = var.monitoring_namespace
    
    labels = {
      "app.kubernetes.io/name"       = "monitoring"
      "app.kubernetes.io/component"  = "observability"
      "app.kubernetes.io/managed-by" = "terraform"
      "compliance.hipaa/enabled"     = "true"
    }
    
    annotations = {
      "iam.amazonaws.com/permitted"     = "true"
      "encryption.aws/kms-key-id"       = aws_kms_key.monitoring.id
      "compliance.hipaa/audit-enabled"  = "true"
    }
  }
}

# Prometheus deployment
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  version    = "15.10.0"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  
  values = [
    yamlencode({
      server = {
        retention     = "${var.retention_period}d"
        global = {
          scrape_interval = "${var.metrics_scrape_interval}s"
        }
        securityContext = {
          runAsUser    = 65534
          runAsGroup   = 65534
          runAsNonRoot = true
        }
        persistentVolume = {
          enabled      = true
          storageClass = "gp2-encrypted"
          size         = "100Gi"
        }
        nodeSelector = var.monitoring_node_selector
      }
      alertmanager = {
        enabled = true
        persistentVolume = {
          enabled      = true
          storageClass = "gp2-encrypted"
          size         = "20Gi"
        }
      }
      configmapReload = {
        prometheus = {
          enabled = true
        }
      }
      networkPolicy = {
        enabled = true
      }
    })
  ]

  set {
    name  = "server.resources.requests.cpu"
    value = "1000m"
  }
  set {
    name  = "server.resources.requests.memory"
    value = "4Gi"
  }
  set {
    name  = "server.resources.limits.cpu"
    value = "2000m"
  }
  set {
    name  = "server.resources.limits.memory"
    value = "8Gi"
  }
}

# Grafana deployment
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = "6.50.0"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  
  values = [
    yamlencode({
      adminPassword = var.grafana_admin_password
      persistence = {
        enabled      = true
        storageClass = "gp2-encrypted"
        size         = "10Gi"
      }
      securityContext = {
        runAsUser    = 472
        runAsGroup   = 472
        fsGroup      = 472
        runAsNonRoot = true
      }
      nodeSelector = var.monitoring_node_selector
      plugins = [
        "grafana-piechart-panel",
        "grafana-clock-panel"
      ]
      datasources = {
        "datasources.yaml" = {
          apiVersion = 1
          datasources = [
            {
              name      = "Prometheus"
              type      = "prometheus"
              url       = "http://prometheus-server"
              access    = "proxy"
              isDefault = true
            }
          ]
        }
      }
      grafana.ini = {
        "auth.anonymous" = {
          enabled  = false
        }
        "security" = {
          allow_embedding = false
          cookie_secure   = true
          strict_transport_security = true
        }
        "users" = {
          allow_sign_up = false
        }
      }
    })
  ]

  set {
    name  = "resources.requests.cpu"
    value = "500m"
  }
  set {
    name  = "resources.requests.memory"
    value = "1Gi"
  }
  set {
    name  = "resources.limits.cpu"
    value = "1000m"
  }
  set {
    name  = "resources.limits.memory"
    value = "2Gi"
  }
}

# AlertManager configuration
resource "helm_release" "alertmanager" {
  name       = "alertmanager"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "alertmanager"
  version    = "0.24.0"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  
  values = [
    yamlencode({
      persistence = {
        enabled      = true
        storageClass = "gp2-encrypted"
        size         = "10Gi"
      }
      securityContext = {
        runAsUser    = 65534
        runAsGroup   = 65534
        runAsNonRoot = true
      }
      nodeSelector = var.monitoring_node_selector
      config = {
        global = {
          resolve_timeout = "5m"
        }
        route = {
          group_by    = ["alertname", "cluster", "service"]
          group_wait  = "30s"
          group_interval = "5m"
          repeat_interval = "12h"
          receiver = "default-receiver"
        }
        receivers = [
          {
            name = "default-receiver"
          }
        ]
      }
    })
  ]

  set {
    name  = "resources.requests.cpu"
    value = "100m"
  }
  set {
    name  = "resources.requests.memory"
    value = "256Mi"
  }
  set {
    name  = "resources.limits.cpu"
    value = "200m"
  }
  set {
    name  = "resources.limits.memory"
    value = "512Mi"
  }
}

# Export monitoring stack resources
output "monitoring_resources" {
  description = "Monitoring stack resource references"
  value = {
    prometheus_helm_release    = helm_release.prometheus
    grafana_helm_release      = helm_release.grafana
    alertmanager_helm_release = helm_release.alertmanager
    monitoring_encryption_key = aws_kms_key.monitoring
    monitoring_namespace      = kubernetes_namespace.monitoring.metadata[0].name
  }
  sensitive = true
}