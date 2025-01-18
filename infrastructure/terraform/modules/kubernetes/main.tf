# Provider and version requirements
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws" # version ~> 4.0
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes" # version ~> 2.0
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm" # version ~> 2.0
      version = "~> 2.0"
    }
    tls = {
      source  = "hashicorp/tls" # version ~> 4.0
      version = "~> 4.0"
    }
  }
}

# Data sources
data "aws_region" "current" {}
data "aws_availability_zones" "available" {}

# Local variables
locals {
  cluster_name = "phrsat-${var.environment}"
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "phrsat"
  }
}

# KMS key for EKS cluster encryption
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS cluster encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(local.tags, {
    Name = "${local.cluster_name}-eks-encryption"
  })
}

# Security group for EKS cluster
resource "aws_security_group" "cluster_sg" {
  name_prefix = "${local.cluster_name}-cluster-"
  description = "Security group for EKS cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.cluster_name}-cluster-sg"
  })
}

# EKS cluster
resource "aws_eks_cluster" "main" {
  name     = local.cluster_name
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = false
    security_group_ids      = [aws_security_group.cluster_sg.id]
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = local.tags

  depends_on = [
    aws_iam_role_policy_attachment.cluster_AmazonEKSClusterPolicy,
    aws_iam_role_policy_attachment.cluster_AmazonEKSVPCResourceController
  ]
}

# Node groups
resource "aws_eks_node_group" "api" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.cluster_name}-api"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids

  instance_types = ["r5.xlarge"]
  disk_size      = 100

  scaling_config {
    desired_size = 3
    min_size     = 3
    max_size     = 15
  }

  labels = {
    workload-type = "api"
  }

  taint {
    key    = "dedicated"
    value  = "api"
    effect = "NO_SCHEDULE"
  }

  tags = merge(local.tags, {
    Name = "${local.cluster_name}-api-node-group"
  })
}

resource "aws_eks_node_group" "worker" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.cluster_name}-worker"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids

  instance_types = ["c5.2xlarge"]
  disk_size      = 200

  scaling_config {
    desired_size = 2
    min_size     = 2
    max_size     = 10
  }

  labels = {
    workload-type = "worker"
  }

  tags = merge(local.tags, {
    Name = "${local.cluster_name}-worker-node-group"
  })
}

resource "aws_eks_node_group" "analytics" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.cluster_name}-analytics"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids

  instance_types = ["p3.2xlarge"]
  disk_size      = 500

  scaling_config {
    desired_size = 1
    min_size     = 1
    max_size     = 5
  }

  labels = {
    workload-type = "analytics"
  }

  taint {
    key    = "dedicated"
    value  = "analytics"
    effect = "NO_SCHEDULE"
  }

  tags = merge(local.tags, {
    Name = "${local.cluster_name}-analytics-node-group"
  })
}

# Cluster add-ons
resource "aws_eks_addon" "vpc_cni" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "vpc-cni"
  resolve_conflicts_on_update = "PRESERVE"
}

resource "aws_eks_addon" "coredns" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "coredns"
  resolve_conflicts_on_update = "PRESERVE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "kube-proxy"
  resolve_conflicts_on_update = "PRESERVE"
}

# Helm releases for additional components
resource "helm_release" "cluster_autoscaler" {
  name       = "cluster-autoscaler"
  repository = "https://kubernetes.github.io/autoscaler"
  chart      = "cluster-autoscaler"
  version    = "9.29.0"
  namespace  = "kube-system"

  set {
    name  = "autoDiscovery.clusterName"
    value = aws_eks_cluster.main.name
  }

  set {
    name  = "awsRegion"
    value = data.aws_region.current.name
  }

  values = [
    yamlencode({
      extraArgs = {
        "scale-down-enabled"           = true
        "scale-down-delay-after-add"   = "10m"
        "scale-down-unneeded-time"     = "10m"
        "max-node-provision-time"      = "15m"
      }
    })
  ]
}

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = "3.11.0"
  namespace  = "kube-system"

  set {
    name  = "args[0]"
    value = "--kubelet-preferred-address-types=InternalIP"
  }

  set {
    name  = "args[1]"
    value = "--kubelet-insecure-tls=true"
  }
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = "1.6.1"
  namespace  = "kube-system"

  set {
    name  = "clusterName"
    value = aws_eks_cluster.main.name
  }

  set {
    name  = "enableShield"
    value = "true"
  }

  set {
    name  = "enableWaf"
    value = "true"
  }

  set {
    name  = "enableWafv2"
    value = "true"
  }
}

resource "helm_release" "calico" {
  name       = "calico"
  repository = "https://docs.projectcalico.org/charts"
  chart      = "tigera-operator"
  version    = "v3.25.0"
  namespace  = "tigera-operator"
  create_namespace = true

  values = [
    yamlencode({
      installation = {
        cni = {
          type = "Calico"
        }
        networkPolicy = {
          enabled = true
        }
        mtu = 8981
      }
    })
  ]
}