# Backend configuration for PHRSAT Terraform state management
# Implements HIPAA-compliant encryption, multi-region replication, and secure access controls
# Version: ~> 1.5

terraform {
  backend "s3" {
    # Primary state storage configuration
    bucket         = "${var.project}-${var.environment}-terraform-state"
    key            = "terraform.tfstate"
    region         = "${var.aws_region}"
    encrypt        = true
    
    # State locking configuration
    dynamodb_table = "${var.project}-${var.environment}-terraform-locks"
    
    # HIPAA-compliant encryption configuration
    kms_key_id     = "alias/terraform-state-key"
    
    # Access control
    versioning     = true
    acl            = "private"
    
    # Server-side encryption configuration
    server_side_encryption_configuration {
      rule {
        apply_server_side_encryption_by_default {
          sse_algorithm     = "aws:kms"
          kms_master_key_id = "alias/terraform-state-key"
        }
      }
    }
    
    # Cross-region replication for disaster recovery
    replication_configuration {
      role = "arn:aws:iam::${var.account_id}:role/terraform-state-replication"
      rules {
        id     = "terraform-state-replication"
        status = "Enabled"
        destination {
          bucket = "${var.project}-${var.environment}-terraform-state-dr"
          region = "${var.secondary_region}"
          encryption_configuration {
            replica_kms_key_id = "alias/terraform-state-key-dr"
          }
        }
      }
    }
    
    # Access logging configuration
    logging {
      target_bucket = "${var.project}-${var.environment}-terraform-logs"
      target_prefix = "state-access-logs/"
    }
  }
}