import React from 'react';
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import DocumentUploader from '../../../../src/components/documents/DocumentUploader';
import DocumentService from '../../../../src/services/documents.service';
import { DocumentType, DocumentStatus, DocumentErrorCode } from '../../../../src/types/documents.types';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock DocumentService
jest.mock('../../../../src/services/documents.service');

// Mock HIPAA security services
jest.mock('@hipaa/security-service', () => ({
  SecurityService: jest.fn().mockImplementation(() => ({
    initializeContext: jest.fn(),
    encryptFile: jest.fn().mockImplementation((file) => Promise.resolve(file))
  }))
}));

// Mock audit logger
jest.mock('@hipaa/audit-logger', () => ({
  useAuditLog: () => ({
    log: jest.fn(),
    logError: jest.fn()
  })
}));

describe('DocumentUploader Component', () => {
  // Test setup variables
  let mockOnUploadComplete: jest.Mock;
  let mockOnUploadError: jest.Mock;
  let documentService: jest.Mocked<DocumentService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Initialize mocks
    mockOnUploadComplete = jest.fn();
    mockOnUploadError = jest.fn();
    documentService = new DocumentService() as jest.Mocked<DocumentService>;

    // Setup document service mock implementations
    DocumentService.prototype.uploadDocument = jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: 'test-doc-id',
        type: DocumentType.MEDICAL_RECORD,
        status: DocumentStatus.COMPLETED
      })
    );

    DocumentService.prototype.validateHIPAACompliance = jest.fn().mockImplementation(() =>
      Promise.resolve({ isValid: true, errors: [] })
    );
  });

  // Helper function to create mock files
  const createMockFile = (
    name: string,
    type: string,
    size: number,
    isHIPAACompliant = true
  ): File => {
    const file = new File(['test'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    Object.defineProperty(file, 'hipaaCompliant', { value: isHIPAACompliant });
    return file;
  };

  describe('Accessibility Compliance', () => {
    it('should meet WCAG 2.1 AAA standards', async () => {
      const { container } = render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', () => {
      render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
        />
      );

      const uploader = screen.getByTestId('document-uploader');
      fireEvent.keyDown(uploader, { key: 'Enter' });
      
      expect(screen.getByRole('region')).toHaveFocus();
    });

    it('should provide appropriate ARIA labels', () => {
      render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
        />
      );

      expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Document upload');
    });
  });

  describe('HIPAA Compliance', () => {
    it('should validate document for HIPAA compliance before upload', async () => {
      render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
          encryptionLevel="AES-256-GCM"
        />
      );

      const file = createMockFile('test.pdf', 'application/pdf', 1024 * 1024);
      const fileInput = screen.getByTestId('document-uploader').querySelector('input[type="file"]');
      
      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(DocumentService.prototype.validateHIPAACompliance).toHaveBeenCalledWith(
          file,
          expect.objectContaining({
            documentType: DocumentType.MEDICAL_RECORD,
            encryptionLevel: 'AES-256-GCM'
          })
        );
      });
    });

    it('should reject non-HIPAA compliant documents', async () => {
      DocumentService.prototype.validateHIPAACompliance = jest.fn().mockResolvedValue({
        isValid: false,
        errors: ['PHI not properly encrypted']
      });

      render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
        />
      );

      const file = createMockFile('test.pdf', 'application/pdf', 1024 * 1024, false);
      const fileInput = screen.getByTestId('document-uploader').querySelector('input[type="file"]');
      
      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: DocumentErrorCode.HIPAA_VIOLATION
          })
        );
      });
    });
  });

  describe('File Processing Security', () => {
    it('should encrypt files before upload', async () => {
      render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
          encryptionLevel="AES-256-GCM"
        />
      );

      const file = createMockFile('test.pdf', 'application/pdf', 1024 * 1024);
      const fileInput = screen.getByTestId('document-uploader').querySelector('input[type="file"]');
      
      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText('🔒 Secured')).toBeInTheDocument();
      });
    });

    it('should handle upload progress securely', async () => {
      let progressCallback: (progress: number) => void;
      
      DocumentService.prototype.uploadDocument = jest.fn().mockImplementation((file, type, config, onProgress) => {
        progressCallback = onProgress;
        return Promise.resolve({
          id: 'test-doc-id',
          type: DocumentType.MEDICAL_RECORD,
          status: DocumentStatus.COMPLETED
        });
      });

      render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
        />
      );

      const file = createMockFile('test.pdf', 'application/pdf', 1024 * 1024);
      const fileInput = screen.getByTestId('document-uploader').querySelector('input[type="file"]');
      
      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        progressCallback(50);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
      });
    });
  });

  describe('Error Handling', () => {
    it('should display accessible error messages', async () => {
      DocumentService.prototype.uploadDocument = jest.fn().mockRejectedValue({
        code: DocumentErrorCode.UPLOAD_FAILED,
        message: 'Upload failed due to network error'
      });

      render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
        />
      );

      const file = createMockFile('test.pdf', 'application/pdf', 1024 * 1024);
      const fileInput = screen.getByTestId('document-uploader').querySelector('input[type="file"]');
      
      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveTextContent('Upload failed due to network error');
        expect(errorMessage).toHaveAttribute('aria-live', 'assertive');
      });
    });
  });

  describe('Document Processing', () => {
    it('should handle successful document processing', async () => {
      const processedDocument = {
        id: 'test-doc-id',
        type: DocumentType.MEDICAL_RECORD,
        status: DocumentStatus.COMPLETED,
        securityInfo: {
          encryptionLevel: 'AES-256-GCM',
          hipaaCompliant: true
        }
      };

      DocumentService.prototype.processDocument = jest.fn().mockResolvedValue(processedDocument);

      render(
        <DocumentUploader
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          documentType={DocumentType.MEDICAL_RECORD}
        />
      );

      const file = createMockFile('test.pdf', 'application/pdf', 1024 * 1024);
      const fileInput = screen.getByTestId('document-uploader').querySelector('input[type="file"]');
      
      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUploadComplete).toHaveBeenCalledWith(processedDocument);
      });
    });
  });
});