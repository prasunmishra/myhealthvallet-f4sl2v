# Output definitions for security module resources with HIPAA compliance documentation

# KMS key ID output with sensitive handling for PHI data encryption
output "kms_key_id" {
  description = "ID of the KMS key used for PHI data encryption (sensitive)"
  value       = aws_kms_key.phi_encryption.id
  sensitive   = true
}

# KMS key ARN output with sensitive handling for cross-account access
output "kms_key_arn" {
  description = "ARN of the KMS key used for PHI data encryption (sensitive)"
  value       = aws_kms_key.phi_encryption.arn
  sensitive   = true
}

# WAF web ACL ID output for HIPAA-compliant application protection
output "waf_web_acl_id" {
  description = "ID of the WAF web ACL providing HIPAA-compliant application protection"
  value       = aws_wafv2_web_acl.main.id
}

# WAF web ACL ARN output for CloudFront/ALB association
output "waf_web_acl_arn" {
  description = "ARN of the WAF web ACL for CloudFront/ALB integration with security controls"
  value       = aws_wafv2_web_acl.main.arn
}

# Security group ID output for network access control
output "security_group_id" {
  description = "ID of the security group controlling network access for HIPAA compliance"
  value       = aws_security_group.app.id
}

# GuardDuty detector ID output for threat detection monitoring
output "guardduty_detector_id" {
  description = "ID of the GuardDuty detector for security monitoring and threat detection"
  value       = try(aws_guardduty_detector.main[0].id, null)
}