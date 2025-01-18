import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useSecurityContext } from '@phrsat/security';
import { useAuditLog } from '@phrsat/audit-logging';

import DocumentList, { DocumentListProps } from '../../components/documents/DocumentList';
import DocumentUploader from '../../components/documents/DocumentUploader';
import { Document, DocumentType, DocumentStatus } from '../../types/documents.types';
import { useDocuments } from '../../hooks/useDocuments';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import LoadingSpinner from '../../components/common/LoadingSpinner';

// Styled components with WCAG AAA compliance
const SecureScreenContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  overflow: hidden;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizes.h2};
  color: ${({ theme }) => theme.colors.text[900]};
  margin: 0;
`;

const FilterSection = styled.section`
  display: flex;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
  flex-wrap: wrap;
`;

const ContentArea = styled.main`
  flex: 1;
  overflow: auto;
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface[200]};
`;

const DocumentsScreen: React.FC = () => {
  const navigate = useNavigate();
  const securityContext = useSecurityContext();
  const auditLog = useAuditLog();

  // Document management state
  const [selectedDocumentType, setSelectedDocumentType] = useState<DocumentType>(DocumentType.MEDICAL_RECORD);
  const [documentFilter, setDocumentFilter] = useState<DocumentListProps['filter']>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Initialize document management hook with security context
  const {
    documents,
    loading,
    error,
    processingStatus,
    operations,
    auditTrail
  } = useDocuments({
    securityContext: {
      encryptionKey: process.env.REACT_APP_ENCRYPTION_KEY!,
      hipaaCompliance: true,
      auditEnabled: true,
      userRole: securityContext.role
    },
    encryptionConfig: {
      algorithm: 'AES-256-GCM',
      keySize: 256
    },
    auditConfig: {
      detailLevel: 'detailed',
      retentionPeriod: 7 * 365 // 7 years retention for HIPAA compliance
    }
  });

  // Handle document upload completion
  const handleUploadComplete = useCallback(async (document: Document) => {
    await auditLog.log('DOCUMENT_UPLOAD_COMPLETE', {
      documentId: document.id,
      type: document.type,
      timestamp: new Date().toISOString()
    });

    // Refresh document list
    await operations.fetchDocument(document.id);
  }, [auditLog, operations]);

  // Handle document upload error
  const handleUploadError = useCallback(async (error: Error) => {
    await auditLog.error('DOCUMENT_UPLOAD_ERROR', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }, [auditLog]);

  // Handle document selection
  const handleDocumentSelect = useCallback(async (id: string, encryptionStatus: boolean) => {
    await auditLog.log('DOCUMENT_SELECT', {
      documentId: id,
      encryptionStatus,
      timestamp: new Date().toISOString()
    });

    navigate(`/documents/${id}`);
  }, [auditLog, navigate]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilter: typeof documentFilter) => {
    setDocumentFilter(newFilter);
    auditLog.log('DOCUMENT_FILTER_CHANGE', {
      filter: newFilter,
      timestamp: new Date().toISOString()
    });
  }, [auditLog]);

  // Monitor document processing status
  useEffect(() => {
    if (processingStatus === DocumentStatus.COMPLETED) {
      auditLog.log('DOCUMENT_PROCESSING_COMPLETE', {
        timestamp: new Date().toISOString()
      });
    }
  }, [processingStatus, auditLog]);

  if (error) {
    return (
      <ErrorBoundary>
        <SecureScreenContainer>
          <div role="alert">
            Error loading documents: {error.message}
          </div>
        </SecureScreenContainer>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SecureScreenContainer>
        <Header>
          <Title>Health Records</Title>
          <div>
            <button
              onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
              aria-label={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
            >
              {viewMode === 'grid' ? 'List View' : 'Grid View'}
            </button>
          </div>
        </Header>

        <FilterSection>
          <DocumentUploader
            onUploadComplete={handleUploadComplete}
            onUploadError={handleUploadError}
            documentType={selectedDocumentType}
            encryptionLevel="AES-256-GCM"
            accessLevel="PRIVATE"
            auditOptions={{
              enableAudit: true,
              auditLevel: 'DETAILED'
            }}
          />
        </FilterSection>

        <ContentArea>
          {loading ? (
            <LoadingSpinner size="large" />
          ) : (
            <DocumentList
              filter={documentFilter}
              onDocumentSelect={handleDocumentSelect}
              viewMode={viewMode}
              accessLevel={securityContext.role}
              auditCallback={(action, documentId) => {
                auditLog.log('DOCUMENT_ACTION', {
                  action,
                  documentId,
                  timestamp: new Date().toISOString()
                });
              }}
            />
          )}
        </ContentArea>
      </SecureScreenContainer>
    </ErrorBoundary>
  );
};

export default DocumentsScreen;