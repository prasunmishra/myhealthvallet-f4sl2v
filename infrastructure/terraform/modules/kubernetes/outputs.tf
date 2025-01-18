# Core cluster identification and access outputs
output "cluster_id" {
  description = "The ID of the EKS cluster for resource referencing and management"
  value       = aws_eks_cluster.main.id
}

output "cluster_endpoint" {
  description = "The endpoint for the Kubernetes API server with restricted access"
  value       = aws_eks_cluster.main.endpoint
  sensitive   = true
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required for cluster authentication"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "cluster_version" {
  description = "The Kubernetes version running on the cluster for compatibility checks"
  value       = aws_eks_cluster.main.version
}

# Security and access control outputs
output "cluster_security_group_id" {
  description = "ID of the EKS cluster security group for network access control"
  value       = aws_security_group.cluster_sg.id
}

output "cluster_iam_role_arn" {
  description = "ARN of the IAM role used by the EKS cluster for AWS service access"
  value       = aws_eks_cluster.main.role_arn
}

# Node group configuration outputs
output "node_groups" {
  description = "Detailed configuration of EKS node groups including scaling and status"
  value = {
    api = {
      id             = aws_eks_node_group.api.id
      status         = aws_eks_node_group.api.status
      scaling_config = aws_eks_node_group.api.scaling_config
      subnet_ids     = aws_eks_node_group.api.subnet_ids
    }
    worker = {
      id             = aws_eks_node_group.worker.id
      status         = aws_eks_node_group.worker.status
      scaling_config = aws_eks_node_group.worker.scaling_config
      subnet_ids     = aws_eks_node_group.worker.subnet_ids
    }
    analytics = {
      id             = aws_eks_node_group.analytics.id
      status         = aws_eks_node_group.analytics.status
      scaling_config = aws_eks_node_group.analytics.scaling_config
      subnet_ids     = aws_eks_node_group.analytics.subnet_ids
    }
  }
}

# VPC configuration output
output "cluster_vpc_config" {
  description = "VPC configuration for the EKS cluster including network access settings"
  value = {
    subnet_ids              = aws_eks_cluster.main.vpc_config[0].subnet_ids
    security_group_ids      = aws_eks_cluster.main.vpc_config[0].security_group_ids
    endpoint_private_access = aws_eks_cluster.main.vpc_config[0].endpoint_private_access
    endpoint_public_access  = aws_eks_cluster.main.vpc_config[0].endpoint_public_access
  }
  sensitive = true
}

# Add-ons status output
output "cluster_addons" {
  description = "Status of critical cluster add-ons for monitoring and networking"
  value = {
    vpc_cni    = aws_eks_addon.vpc_cni.status
    coredns    = aws_eks_addon.coredns.status
    kube_proxy = aws_eks_addon.kube_proxy.status
  }
}

# Encryption configuration output
output "cluster_encryption_config" {
  description = "KMS key configuration for cluster secret encryption (HIPAA compliance)"
  value = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }
  sensitive = true
}