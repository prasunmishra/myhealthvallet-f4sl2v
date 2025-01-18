# AWS Provider configuration for network resource creation
# Provider version: ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Main VPC resource with enhanced networking features and HIPAA compliance tagging
resource "aws_vpc" "main" {
  cidr_block                           = var.vpc_cidr
  enable_dns_hostnames                 = true
  enable_dns_support                   = true
  enable_network_address_usage_metrics = true
  instance_tenancy                     = "default"

  tags = merge(
    {
      Name           = "phrsat-${var.environment}-vpc"
      Environment    = var.environment
      ManagedBy     = "Terraform"
      SecurityLevel  = "HIPAA-Compliant"
      DataSensitivity = "High"
    },
    var.tags
  )
}

# VPC Flow Logs configuration for comprehensive network traffic monitoring
resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/aws/vpc/phrsat-${var.environment}-flow-logs"
  retention_in_days = 30

  tags = merge(
    {
      Name        = "phrsat-${var.environment}-flow-logs"
      Environment = var.environment
    },
    var.tags
  )
}

resource "aws_flow_log" "main" {
  vpc_id                   = aws_vpc.main.id
  traffic_type            = "ALL"
  log_destination_type    = "cloud-watch-logs"
  log_destination         = aws_cloudwatch_log_group.flow_logs.arn
  max_aggregation_interval = 60

  tags = merge(
    {
      Name        = "phrsat-${var.environment}-flow-logs"
      Environment = var.environment
    },
    var.tags
  )
}

# Enhanced security group for application tier with strict HIPAA-compliant rules
resource "aws_security_group" "app_tier" {
  name_prefix = "phrsat-${var.environment}-app-"
  description = "Security group for application tier with enhanced security rules"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    description = "Health check ports"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    {
      Name        = "phrsat-${var.environment}-app-sg"
      Environment = var.environment
      Purpose     = "Application-Tier-Security"
    },
    var.tags
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Network ACL with granular rules for enhanced security
resource "aws_network_acl" "private" {
  vpc_id = aws_vpc.main.id

  ingress {
    protocol   = "tcp"
    rule_no    = 100
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 443
    to_port    = 443
  }

  ingress {
    protocol   = "tcp"
    rule_no    = 200
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 1024
    to_port    = 65535
  }

  egress {
    protocol   = -1
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  tags = merge(
    {
      Name        = "phrsat-${var.environment}-private-nacl"
      Environment = var.environment
      Purpose     = "Enhanced-Security-Rules"
    },
    var.tags
  )
}

# VPC Endpoints for secure AWS service access
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${data.aws_region.current.name}.s3"
  
  tags = merge(
    {
      Name        = "phrsat-${var.environment}-s3-endpoint"
      Environment = var.environment
    },
    var.tags
  )
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${data.aws_region.current.name}.dynamodb"
  
  tags = merge(
    {
      Name        = "phrsat-${var.environment}-dynamodb-endpoint"
      Environment = var.environment
    },
    var.tags
  )
}

# Data source for current AWS region
data "aws_region" "current" {}

# Outputs for use in other modules
output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "flow_logs_id" {
  description = "The ID of the VPC Flow Logs"
  value       = aws_flow_log.main.id
}

output "security_group_ids" {
  description = "Map of security group IDs"
  value = {
    app_tier = aws_security_group.app_tier.id
  }
}

output "security_group_rules" {
  description = "Map of security group rules"
  value = {
    app_tier = {
      ingress = aws_security_group.app_tier.ingress
      egress  = aws_security_group.app_tier.egress
    }
  }
}