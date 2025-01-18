# AWS Provider configuration for S3 and KMS integration
# aws ~> 5.0
# terraform ~> 1.5

# Primary S3 bucket for HIPAA-compliant document storage
resource "aws_s3_bucket" "documents" {
  bucket        = "${var.project_name}-${var.environment}-documents"
  force_destroy = false

  tags = merge({
    Name               = "${var.project_name}-${var.environment}-documents"
    Environment        = var.environment
    Purpose           = "HIPAA-compliant document storage"
    Compliance        = "HIPAA"
    DataClassification = "PHI"
    BackupStrategy    = "Versioned"
    ManagedBy         = "Terraform"
  }, var.tags)
}

# Access logging bucket for audit compliance
resource "aws_s3_bucket" "logs" {
  bucket        = "${var.project_name}-${var.environment}-access-logs"
  force_destroy = false

  tags = merge({
    Name        = "${var.project_name}-${var.environment}-access-logs"
    Environment = var.environment
    Purpose     = "S3 Access Logging"
    ManagedBy   = "Terraform"
  }, var.tags)
}

# Enable versioning for document history and backup compliance
resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Configure server-side encryption using KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_id
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Configure lifecycle rules for archival and retention
resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "glacier-transition"
    status = "Enabled"

    transition {
      days          = var.glacier_transition_days
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "retention"
    status = "Enabled"

    expiration {
      days = var.retention_period_days
    }
  }

  rule {
    id     = "noncurrent-version-transition"
    status = "Enabled"

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.retention_period_days
    }
  }
}

# Configure access logging
resource "aws_s3_bucket_logging" "documents" {
  bucket = aws_s3_bucket.documents.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-access-logs/${var.environment}/${formatdate("YYYY/MM/", timestamp())}/"
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Configure bucket policy for SSL-only access
resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceSSLOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid       = "EnforceKMSEncryption"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.documents.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      }
    ]
  })
}

# Configure CORS for web access
resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["https://*.${var.project_name}.com"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Configure bucket ownership controls
resource "aws_s3_bucket_ownership_controls" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# Configure bucket replication for disaster recovery
resource "aws_s3_bucket_replication_configuration" "documents" {
  count = var.environment == "prod" ? 1 : 0

  bucket = aws_s3_bucket.documents.id
  role   = aws_iam_role.replication[0].arn

  rule {
    id     = "disaster-recovery"
    status = "Enabled"

    destination {
      bucket        = "arn:aws:s3:::${var.project_name}-${var.environment}-dr-documents"
      storage_class = "STANDARD_IA"

      encryption_configuration {
        replica_kms_key_id = var.kms_key_id
      }
    }

    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.documents]
}