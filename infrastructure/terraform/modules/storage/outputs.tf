# Core Terraform functionality for output definitions
# terraform ~> 1.5

output "documents_bucket_id" {
  description = "ID of the HIPAA-compliant S3 bucket for secure document storage and cross-module resource references"
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  description = "ARN of the HIPAA-compliant S3 bucket for IAM policy configuration and secure resource access management"
  value       = aws_s3_bucket.documents.arn
}

output "documents_bucket_domain_name" {
  description = "Domain name of the HIPAA-compliant S3 bucket for secure application integration and document access"
  value       = aws_s3_bucket.documents.bucket_domain_name
}