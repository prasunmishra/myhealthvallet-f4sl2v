/**
 * @fileoverview TypeScript type definitions for HIPAA-compliant document management
 * @version 1.0.0
 * 
 * Comprehensive type definitions for health record documents including:
 * - Document interfaces and types
 * - Metadata structures
 * - Security and compliance types
 * - Processing states and audit trails
 */

import { ApiResponse } from './api.types';

/**
 * Enhanced document type enumeration
 */
export enum DocumentType {
  MEDICAL_RECORD = 'MEDICAL_RECORD',
  LAB_RESULT = 'LAB_RESULT',
  PRESCRIPTION = 'PRESCRIPTION',
  IMAGING = 'IMAGING',
  VACCINATION = 'VACCINATION',
  INSURANCE = 'INSURANCE',
  CONSENT_FORM = 'CONSENT_FORM',
  CLINICAL_NOTE = 'CLINICAL_NOTE',
  SURGICAL_REPORT = 'SURGICAL_REPORT',
  PATHOLOGY_REPORT = 'PATHOLOGY_REPORT',
  DISCHARGE_SUMMARY = 'DISCHARGE_SUMMARY',
  REFERRAL = 'REFERRAL',
  OTHER = 'OTHER'
}

/**
 * Document processing status enumeration
 */
export enum DocumentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
  ENCRYPTED = 'ENCRYPTED',
  QUARANTINED = 'QUARANTINED'
}

/**
 * Document error codes enumeration
 */
export enum DocumentErrorCode {
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  INVALID_TYPE = 'INVALID_TYPE',
  SIZE_EXCEEDED = 'SIZE_EXCEEDED',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  STORAGE_ERROR = 'STORAGE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  HIPAA_VIOLATION = 'HIPAA_VIOLATION',
  INVALID_METADATA = 'INVALID_METADATA',
  CLASSIFICATION_FAILED = 'CLASSIFICATION_FAILED',
  OCR_FAILED = 'OCR_FAILED',
  AUDIT_FAILED = 'AUDIT_FAILED'
}

/**
 * Healthcare provider information interface
 */
export interface HealthcareProvider {
  id: string;
  name: string;
  npi: string;
  specialty?: string;
  facility?: string;
  address?: string;
  contact?: string;
}

/**
 * Document classification interface
 */
export interface DocumentClassification {
  category: string;
  confidence: number;
  tags: string[];
  aiModel: string;
  classifiedAt: Date;
  validatedBy?: string;
}

/**
 * HIPAA compliance metadata interface
 */
export interface ComplianceMetadata {
  phi: boolean;
  hipaaCompliant: boolean;
  dataElements: string[];
  sensitivityLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  retentionPolicy: string;
  lastComplianceCheck: Date;
  complianceOfficer?: string;
}

/**
 * Document encryption metadata interface
 */
export interface EncryptionMetadata {
  algorithm: string;
  keyId: string;
  encryptedAt: Date;
  lastRotated?: Date;
  ivVector?: string;
  certificateThumbprint?: string;
}

/**
 * Document version control interface
 */
export interface DocumentVersion {
  versionId: string;
  createdAt: Date;
  createdBy: string;
  changes: string[];
  size: number;
  hash: string;
}

/**
 * Document audit trail interface
 */
export interface DocumentAudit {
  events: Array<{
    eventType: string;
    timestamp: Date;
    userId: string;
    action: string;
    ipAddress: string;
    userAgent: string;
    changes?: Record<string, unknown>;
  }>;
  lastAccessed: Date;
  accessCount: number;
}

/**
 * Document access control interface
 */
export interface DocumentAccess {
  ownerId: string;
  permissions: Array<{
    userId: string;
    role: 'READ' | 'WRITE' | 'ADMIN';
    grantedAt: Date;
    grantedBy: string;
    expiresAt?: Date;
  }>;
  publicAccess: boolean;
  restrictedTo?: string[];
}

/**
 * Document security information interface
 */
export interface DocumentSecurity {
  encryptionInfo: EncryptionMetadata;
  accessControl: DocumentAccess;
  complianceInfo: ComplianceMetadata;
  digitalSignature?: string;
  certificateInfo?: {
    issuer: string;
    validFrom: Date;
    validTo: Date;
    serialNumber: string;
  };
}

/**
 * Document processing result interface
 */
export interface DocumentProcessingResult {
  status: DocumentStatus;
  startedAt: Date;
  completedAt?: Date;
  error?: {
    code: DocumentErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  ocrText?: string;
  classification?: DocumentClassification;
  confidence: number;
}

/**
 * Healthcare standard metadata interfaces
 */
export interface HL7Metadata {
  messageType: string;
  version: string;
  segments: string[];
  messageControlId: string;
}

export interface FHIRMetadata {
  resourceType: string;
  profile: string[];
  version: string;
  lastUpdated: Date;
}

export interface DICOMMetadata {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  modality: string;
  acquisitionDate: Date;
}

/**
 * Enhanced document metadata interface
 */
export interface DocumentMetadata {
  title: string;
  description: string;
  provider: string;
  documentDate: Date;
  patientId: string;
  category: string;
  customFields: Record<string, string>;
  keywords: string[];
  classification: DocumentClassification;
  hl7Data?: HL7Metadata;
  fhirData?: FHIRMetadata;
  dicomInfo?: DICOMMetadata;
  providerInfo: HealthcareProvider;
  complianceInfo: ComplianceMetadata;
}

/**
 * Main document interface
 */
export interface Document {
  id: string;
  type: DocumentType;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  metadata: DocumentMetadata;
  uploadedBy: string;
  uploadedAt: Date;
  lastModified: Date;
  status: DocumentStatus;
  tags: string[];
  isArchived: boolean;
  processingResult: DocumentProcessingResult;
  securityInfo: DocumentSecurity;
  versions: DocumentVersion[];
  auditTrail: DocumentAudit;
  accessControl: DocumentAccess;
  isHIPAACompliant: boolean;
  encryptionInfo: EncryptionMetadata;
}

/**
 * Document API response types
 */
export type DocumentResponse = ApiResponse<Document>;
export type DocumentListResponse = ApiResponse<Document[]>;
export type DocumentUploadResponse = ApiResponse<{
  documentId: string;
  uploadUrl: string;
  processingId: string;
}>;