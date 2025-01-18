# API Gateway endpoint output for service discovery
output "api_gateway_endpoint" {
  description = "The endpoint URL for the Kong API Gateway deployment"
  value       = helm_release.kong.status[0].load_balancer_ingress[0].hostname
  sensitive   = false
}

# Security group ID output for network security configuration
output "api_security_group_id" {
  description = "The ID of the security group associated with the API Gateway resources"
  value       = aws_security_group.api_gateway.id
  sensitive   = false
}

# API Gateway name output for resource identification
output "api_gateway_name" {
  description = "The name of the deployed Kong API Gateway instance"
  value       = var.api_gateway_name
  sensitive   = false
}

# WAF Web ACL ID output for security configuration
output "waf_web_acl_id" {
  description = "The ID of the WAF Web ACL protecting the API Gateway"
  value       = aws_wafv2_web_acl.api_gateway.id
  sensitive   = false
}

# Fargate profile ARN output for workload management
output "fargate_profile_arn" {
  description = "The ARN of the EKS Fargate profile for API workloads"
  value       = aws_eks_fargate_profile.api_workload.arn
  sensitive   = false
}