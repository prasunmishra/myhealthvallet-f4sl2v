# Core networking outputs for VPC identification and CIDR information
output "vpc_id" {
  description = "The ID of the VPC used for resource deployment and network isolation"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "The CIDR block of the VPC for network planning and security group rules"
  value       = aws_vpc.main.cidr_block
}

# Subnet outputs for multi-AZ resource deployment
output "private_subnet_ids" {
  description = "List of IDs of private subnets for deploying internal resources across multiple AZs"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "List of IDs of public subnets for deploying internet-facing resources across multiple AZs"
  value       = aws_subnet.public[*].id
}

# Security outputs for network access control
output "app_security_group_id" {
  description = "ID of the application security group for controlling network access to application resources"
  value       = aws_security_group.app_tier.id
}

output "network_acl_id" {
  description = "ID of the network ACL for additional network security layer"
  value       = aws_network_acl.private.id
}

# VPC endpoint outputs for secure AWS service access
output "vpc_endpoints" {
  description = "Map of VPC endpoint IDs for secure AWS service access"
  value = {
    s3        = aws_vpc_endpoint.s3.id
    dynamodb  = aws_vpc_endpoint.dynamodb.id
  }
}

# Flow logs output for network monitoring
output "flow_logs_group_arn" {
  description = "ARN of the CloudWatch Log Group for VPC Flow Logs"
  value       = aws_cloudwatch_log_group.flow_logs.arn
}

output "flow_logs_id" {
  description = "ID of the VPC Flow Logs configuration"
  value       = aws_flow_log.main.id
}

# Security group rules output for documentation and verification
output "security_group_rules" {
  description = "Map of security group rules for the application tier"
  value = {
    ingress = aws_security_group.app_tier.ingress
    egress  = aws_security_group.app_tier.egress
  }
}

# Availability zone outputs for infrastructure planning
output "availability_zones" {
  description = "List of availability zones used for subnet distribution"
  value       = var.availability_zones
}

# Environment identifier for resource tracking
output "environment" {
  description = "Environment name for resource identification"
  value       = var.environment
}

# Tags output for resource management
output "resource_tags" {
  description = "Common tags applied to networking resources"
  value       = var.tags
}