# Provider configuration block with required providers
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
}

# IAM role for Fargate pod execution with HIPAA-compliant permissions
resource "aws_iam_role" "fargate_pod_execution_role" {
  name = "phrsat-${var.environment}-fargate-pod-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks-fargate-pods.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "EKS-Fargate-Execution"
  }
}

# Attach required policies to Fargate execution role
resource "aws_iam_role_policy_attachment" "fargate_pod_execution_policy" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEKSFargatePodExecutionRolePolicy"
  role       = aws_iam_role.fargate_pod_execution_role.name
}

# EKS Fargate Profile for API workloads
resource "aws_eks_fargate_profile" "api_workload" {
  cluster_name           = var.eks_cluster_name
  fargate_profile_name   = "api-workload"
  pod_execution_role_arn = aws_iam_role.fargate_pod_execution_role.arn
  subnet_ids             = var.private_subnet_ids

  selector {
    namespace = "api"
    labels = {
      workload-type = "api"
      compliance    = "hipaa"
    }
  }

  tags = {
    Environment        = var.environment
    ComplianceLevel   = "HIPAA"
    DataClassification = "PHI"
  }
}

# Security group for API Gateway with strict rules
resource "aws_security_group" "api_gateway" {
  name        = "api-gateway-sg-${var.environment}"
  description = "Security group for API Gateway with HIPAA-compliant rules"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS inbound"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name           = "api-gateway-sg-${var.environment}"
    Environment    = var.environment
    SecurityLevel  = "HIPAA-Compliant"
  }
}

# WAF Web ACL for API protection
resource "aws_wafv2_web_acl" "api_gateway" {
  name        = "api-gateway-waf-${var.environment}"
  description = "WAF rules for API Gateway HIPAA compliance"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "PHIProtection"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesHealthcareRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "PHIProtectionMetric"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "APIGatewayWAFMetrics"
    sampled_requests_enabled  = true
  }

  tags = {
    Environment = var.environment
    Purpose     = "API-Protection"
  }
}

# Kong API Gateway deployment using Helm
resource "helm_release" "kong" {
  name       = var.api_gateway_name
  repository = "https://charts.konghq.com"
  chart      = "kong"
  version    = var.api_gateway_version
  namespace  = "api"

  values = [
    yamlencode({
      autoscaling = {
        enabled                          = var.enable_api_autoscaling
        minReplicas                      = var.min_api_instances
        maxReplicas                      = var.max_api_instances
        targetCPUUtilizationPercentage   = var.api_cpu_threshold
      }
      proxy = {
        tls = {
          enabled    = true
          protocols  = ["TLSv1.3"]
        }
        cors = {
          enabled     = true
          methods     = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
          headers     = ["Content-Type", "Authorization", "X-Request-ID"]
          credentials = true
        }
      }
      resources = {
        limits = {
          cpu    = var.api_cpu_limit
          memory = var.api_memory_limit
        }
      }
      monitoring = {
        enabled     = true
        prometheus = {
          enabled = true
        }
        datadog = {
          enabled = true
        }
      }
      ingressController = {
        enabled = true
        resources = {
          limits = {
            cpu    = "1000m"
            memory = "2Gi"
          }
        }
      }
    })
  ]

  set {
    name  = "env.database"
    value = "off"
  }
}

# Outputs for other modules
output "api_gateway_endpoint" {
  description = "API Gateway endpoint URL"
  value       = helm_release.kong.status[0].load_balancer_ingress[0].hostname
}

output "api_security_group_id" {
  description = "API Gateway security group ID"
  value       = aws_security_group.api_gateway.id
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN"
  value       = aws_wafv2_web_acl.api_gateway.arn
}