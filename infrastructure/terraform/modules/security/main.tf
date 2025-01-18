# Configure Terraform settings and required providers
terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# Data sources for account and region information
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_vpc" "selected" {
  id = var.vpc_id
}

# Random suffix for unique resource naming
resource "random_id" "suffix" {
  byte_length = 4
}

# KMS key for PHI data encryption
resource "aws_kms_key" "phi_encryption" {
  description              = "KMS key for PHI data encryption - ${var.environment}"
  deletion_window_in_days  = var.kms_deletion_window
  enable_key_rotation      = true
  multi_region            = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-phi-key-${var.environment}"
  })
}

# KMS alias for the PHI encryption key
resource "aws_kms_alias" "phi_encryption" {
  name          = "alias/${var.project_name}-phi-${var.environment}"
  target_key_id = aws_kms_key.phi_encryption.key_id
}

# WAF Web ACL with enhanced security rules
resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-waf-${var.environment}"
  description = "WAF rules for HIPAA compliance"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # AWS Managed Rules for common threats
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled  = true
    }
  }

  # Rate limiting rule
  rule {
    name     = "RateLimitRule"
    priority = 2

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_block_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateLimitRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  # SQL injection prevention
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "SQLiRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "${var.project_name}-waf-${var.environment}"
    sampled_requests_enabled  = true
  }

  tags = var.tags
}

# Security group for application components
resource "aws_security_group" "app" {
  name        = "${var.project_name}-app-${var.environment}"
  description = "Security group for application components"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.project_name}-app-${var.environment}"
  })
}

# Ingress rules for application security group
resource "aws_security_group_rule" "app_ingress" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidrs
  security_group_id = aws_security_group.app.id
  description       = "HTTPS inbound"
}

# Egress rules for application security group
resource "aws_security_group_rule" "app_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.app.id
  description       = "Allow all outbound traffic"
}

# IAM role for application components
resource "aws_iam_role" "app" {
  name = "${var.project_name}-app-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# IAM policy for KMS encryption
resource "aws_iam_role_policy" "kms_access" {
  name = "${var.project_name}-kms-access-${var.environment}"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.phi_encryption.arn]
      }
    ]
  })
}

# GuardDuty detector for threat detection
resource "aws_guardduty_detector" "main" {
  count = var.enable_guardduty ? 1 : 0

  enable = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        enable = true
      }
    }
  }

  tags = var.tags
}

# GuardDuty organization configuration
resource "aws_guardduty_organization_configuration" "main" {
  count = var.enable_guardduty ? 1 : 0

  detector_id = aws_guardduty_detector.main[0].id
  auto_enable = true

  datasources {
    s3_logs {
      auto_enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        enable = true
      }
    }
  }
}