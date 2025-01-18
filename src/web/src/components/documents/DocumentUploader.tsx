import React, { useCallback, useState, useEffect } from 'react';
import styled from 'styled-components';
import { useAuditLog } from '@hipaa/audit-logger';
import { SecurityService } from '@hipaa/security-service';
import FileUpload from '../common/FileUpload';
import DocumentService from '../../services/documents.service';
import { 
  Document, 
  DocumentType, 
  DocumentStatus,
  DocumentErrorCode 
} from '../../types/documents.types';

// Styled components with accessibility support
const UploaderContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const ProgressContainer = styled.div`
  display: flex;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.SMALL}px;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  
  &[role="progressbar"] {
    aria-valuemin: 0;
    aria-valuemax: 100;
  }
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error[500]};
  margin-top: ${({ theme }) => theme.spacing.SMALL}px;
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
`;

interface DocumentUploaderProps {
  onUploadComplete: (document: Document) => void;
  onUploadError: (error: Error) => void;
  documentType: DocumentType;
  maxSize?: number;
  disabled?: boolean;
  encryptionLevel?: 'AES-256-GCM' | 'AES-256-CBC';
  accessLevel?: 'RESTRICTED' | 'PRIVATE' | 'SHARED';
  auditOptions?: {
    enableAudit?: boolean;
    auditLevel?: 'BASIC' | 'DETAILED';
  };
}

interface UploadError {
  code: DocumentErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  onUploadComplete,
  onUploadError,
  documentType,
  maxSize = 52428800, // 50MB default
  disabled = false,
  encryptionLevel = 'AES-256-GCM',
  accessLevel = 'PRIVATE',
  auditOptions = { enableAudit: true, auditLevel: 'DETAILED' }
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [securityStatus, setSecurityStatus] = useState<'PENDING' | 'SECURED' | 'FAILED'>('PENDING');

  const documentService = new DocumentService();
  const auditLogger = useAuditLog();
  const securityService = new SecurityService();

  useEffect(() => {
    // Initialize security context
    securityService.initializeContext({
      encryptionLevel,
      accessLevel,
      auditEnabled: auditOptions.enableAudit
    });
  }, [encryptionLevel, accessLevel, auditOptions.enableAudit]);

  const handleError = useCallback(async (error: Error | UploadError) => {
    const errorDetails = {
      code: (error as UploadError).code || DocumentErrorCode.UPLOAD_FAILED,
      message: error.message,
      details: (error as UploadError).details || {}
    };

    await auditLogger.logError('DOCUMENT_UPLOAD_ERROR', {
      error: errorDetails,
      documentType,
      timestamp: new Date().toISOString()
    });

    setError(errorDetails);
    setIsLoading(false);
    onUploadError(error);
  }, [documentType, onUploadError, auditLogger]);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      setIsLoading(true);
      setError(null);
      setUploadProgress(0);

      // Log upload attempt
      await auditLogger.log('DOCUMENT_UPLOAD_STARTED', {
        fileName: file.name,
        fileSize: file.size,
        documentType,
        timestamp: new Date().toISOString()
      });

      // Validate file and HIPAA compliance
      const validationResult = await documentService.validateHIPAACompliance(file, {
        documentType,
        maxSize,
        encryptionLevel
      });

      if (!validationResult.isValid) {
        throw {
          code: DocumentErrorCode.HIPAA_VIOLATION,
          message: 'Document failed HIPAA compliance validation',
          details: validationResult.errors
        };
      }

      // Encrypt file before upload
      const encryptedFile = await securityService.encryptFile(file, encryptionLevel);
      setSecurityStatus('SECURED');

      // Upload document with progress tracking
      const uploadedDocument = await documentService.uploadDocument(
        encryptedFile,
        documentType,
        {
          accessLevel,
          securityInfo: {
            encryptionLevel,
            hipaaCompliant: true,
            accessControl: accessLevel
          }
        },
        (progress: number) => {
          setUploadProgress(progress);
        }
      );

      // Process document
      const processedDocument = await documentService.processDocument(
        uploadedDocument.id,
        {
          performOCR: true,
          extractMetadata: true,
          validatePHI: true
        }
      );

      // Log successful upload
      await auditLogger.log('DOCUMENT_UPLOAD_COMPLETED', {
        documentId: processedDocument.id,
        documentType,
        timestamp: new Date().toISOString(),
        securityInfo: processedDocument.securityInfo
      });

      setIsLoading(false);
      onUploadComplete(processedDocument);

    } catch (error) {
      handleError(error as Error | UploadError);
    }
  }, [
    documentType,
    maxSize,
    encryptionLevel,
    accessLevel,
    onUploadComplete,
    handleError,
    auditLogger,
    documentService,
    securityService
  ]);

  return (
    <UploaderContainer
      role="region"
      aria-label="Document upload"
      data-testid="document-uploader"
    >
      <FileUpload
        onFileSelect={handleFileSelect}
        onError={handleError}
        acceptedTypes={['application/pdf', 'image/jpeg', 'image/png', 'image/dicom']}
        maxSize={maxSize}
        disabled={disabled || isLoading}
        validateHIPAA={true}
        ariaLabel="Upload health record document"
        allowRetry={true}
      />

      {isLoading && (
        <ProgressContainer
          role="progressbar"
          aria-valuenow={uploadProgress}
          aria-busy={true}
        >
          <span>Uploading document... {Math.round(uploadProgress)}%</span>
          {securityStatus === 'SECURED' && (
            <span role="status" aria-label="Document secured">
              🔒 Secured
            </span>
          )}
        </ProgressContainer>
      )}

      {error && (
        <ErrorMessage role="alert" aria-live="assertive">
          {error.message}
        </ErrorMessage>
      )}
    </UploaderContainer>
  );
};

export default DocumentUploader;