import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useParams, useNavigate } from 'react-router-dom';
import { useSecureDocuments } from '@healthtech/secure-documents'; // version: ^2.0.0
import { useAuditLogger } from '@healthtech/audit-logger'; // version: ^1.0.0
import DocumentPreview from '../../components/documents/DocumentPreview';
import type { Document, DocumentStatus } from '../../types/documents.types';
import { validateDocument, generateDocumentPreview } from '../../utils/documents.utils';

// Styled components with WCAG 2.1 AAA compliance
const SecureContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100vh;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  padding: 24px;
  overflow: hidden;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  font-size: 24px;
  color: ${({ theme }) => theme.colors.primary};
  margin: 0;
`;

const SecurityBadge = styled.div<{ status: 'secure' | 'warning' | 'error' }>`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 4px;
  background: ${({ status, theme }) => ({
    secure: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error
  }[status])};
  color: white;
`;

const MetadataSection = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const ActionButton = styled.button`
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  cursor: pointer;
  margin-left: 8px;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.focus};
    outline-offset: 2px;
  }
`;

interface DocumentDetailScreenProps {
  className?: string;
}

export const DocumentDetailScreen: React.FC<DocumentDetailScreenProps> = ({ className }) => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { fetchSecureDocument, shareDocument, downloadDocument } = useSecureDocuments();
  const { logDocumentAccess, logDocumentAction } = useAuditLogger();

  // State management with security context
  const [document, setDocument] = useState<Document | null>(null);
  const [securityStatus, setSecurityStatus] = useState<'secure' | 'warning' | 'error'>('secure');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Secure document fetching with audit logging
  useEffect(() => {
    const fetchDocument = async () => {
      try {
        if (!documentId) {
          throw new Error('Document ID is required');
        }

        setLoading(true);
        const fetchedDocument = await fetchSecureDocument(documentId);
        
        // Validate document security and HIPAA compliance
        const validation = await validateDocument(
          new File([], fetchedDocument.name),
          fetchedDocument.type,
          fetchedDocument.metadata
        );

        if (!validation.isValid) {
          setSecurityStatus('error');
          throw new Error('Document security validation failed');
        }

        setDocument(fetchedDocument);
        setSecurityStatus(validation.securityInfo.isHIPAACompliant ? 'secure' : 'warning');

        // Log document access
        await logDocumentAccess({
          documentId,
          action: 'VIEW',
          metadata: {
            documentType: fetchedDocument.type,
            securityStatus: validation.securityInfo
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
        setSecurityStatus('error');
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();

    // Cleanup sensitive data
    return () => {
      setDocument(null);
      setError(null);
    };
  }, [documentId, fetchSecureDocument, logDocumentAccess]);

  // Secure document sharing
  const handleSecureShare = useCallback(async () => {
    if (!document) return;

    try {
      await shareDocument(document.id, {
        encryptionEnabled: true,
        expirationTime: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        watermarkEnabled: true
      });

      await logDocumentAction({
        documentId: document.id,
        action: 'SHARE',
        metadata: {
          recipientType: 'healthcare-provider'
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share document');
    }
  }, [document, shareDocument, logDocumentAction]);

  // Secure document download
  const handleSecureDownload = useCallback(async () => {
    if (!document) return;

    try {
      await downloadDocument(document.id, {
        encryptionEnabled: true,
        auditTrailEnabled: true
      });

      await logDocumentAction({
        documentId: document.id,
        action: 'DOWNLOAD',
        metadata: {
          format: document.mimeType
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download document');
    }
  }, [document, downloadDocument, logDocumentAction]);

  if (loading) {
    return <SecureContainer>Loading secure document...</SecureContainer>;
  }

  if (error || !document) {
    return <SecureContainer>Error: {error || 'Document not found'}</SecureContainer>;
  }

  return (
    <SecureContainer className={className}>
      <Header>
        <Title>{document.metadata.title}</Title>
        <SecurityBadge status={securityStatus}>
          {securityStatus === 'secure' ? 'HIPAA Compliant' : 'Security Warning'}
        </SecurityBadge>
      </Header>

      <MetadataSection>
        <p>Document Type: {document.type}</p>
        <p>Provider: {document.metadata.provider}</p>
        <p>Date: {new Date(document.metadata.documentDate).toLocaleDateString()}</p>
        <p>Status: {document.status}</p>
      </MetadataSection>

      <DocumentPreview
        document={document}
        onClose={() => navigate('/documents')}
        showWatermark={document.securityInfo.encryptionInfo.algorithm === 'AES-256-GCM'}
        accessibilityMode="screen-reader"
      />

      <div>
        <ActionButton
          onClick={handleSecureShare}
          disabled={document.status !== DocumentStatus.COMPLETED}
          aria-label="Share document securely"
        >
          Share Securely
        </ActionButton>
        <ActionButton
          onClick={handleSecureDownload}
          disabled={document.status !== DocumentStatus.COMPLETED}
          aria-label="Download encrypted document"
        >
          Download Encrypted
        </ActionButton>
      </div>
    </SecureContainer>
  );
};

export default DocumentDetailScreen;