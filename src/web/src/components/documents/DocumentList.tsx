import React, { useState, useCallback, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { useBreakpoint } from '@chakra-ui/react'; // ^2.0.0
import { VariableSizeList as VirtualList } from 'react-window'; // ^1.8.9
import { useToast } from '@chakra-ui/toast'; // ^2.0.0

import DocumentCard, { DocumentCardProps } from './DocumentCard';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBoundary from '../common/ErrorBoundary';
import { useDocuments } from '../../hooks/useDocuments';
import { Document, DocumentType, DocumentStatus } from '../../types/documents.types';
import { SPACING, BREAKPOINTS } from '../../styles/dimensions';
import { createFadeAnimation } from '../../styles/animations';

// Styled components with WCAG AAA compliance
const StyledDocumentList = styled.div<{ viewMode: 'grid' | 'list' }>`
  display: grid;
  grid-template-columns: ${({ viewMode }) => viewMode === 'grid' ? 
    'repeat(auto-fill, minmax(300px, 1fr))' : '1fr'};
  gap: ${SPACING.MEDIUM}px;
  padding: ${SPACING.MEDIUM}px;
  min-height: 200px;
  position: relative;
  ${createFadeAnimation()};
`;

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${SPACING.XLARGE}px;
  text-align: center;
  color: ${props => props.theme.colors.text[600]};
  background: ${props => props.theme.colors.surface[100]};
  border-radius: ${props => props.theme.shape.borderRadius.md}px;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
`;

const VirtualListContainer = styled.div`
  height: 100%;
  width: 100%;
`;

// Interface definitions
interface DocumentListProps {
  filter?: DocumentFilter;
  sortBy?: keyof Document;
  sortOrder?: 'asc' | 'desc';
  onDocumentSelect?: (id: string, encryptionStatus: boolean) => void;
  className?: string;
  accessLevel?: string;
  auditCallback?: (action: string, documentId: string) => void;
  viewMode?: 'grid' | 'list';
  pageSize?: number;
}

interface DocumentFilter {
  types?: DocumentType[];
  dateRange?: { start: Date; end: Date };
  searchTerm?: string;
  tags?: string[];
  encryptionStatus?: boolean;
  sensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
}

// Security context for HIPAA compliance
const securityContext = {
  encryptionKey: process.env.REACT_APP_ENCRYPTION_KEY!,
  hipaaCompliance: true,
  auditEnabled: true,
  userRole: 'USER'
};

const DocumentList: React.FC<DocumentListProps> = ({
  filter,
  sortBy = 'uploadedAt',
  sortOrder = 'desc',
  onDocumentSelect,
  className,
  accessLevel = 'READ',
  auditCallback,
  viewMode = 'grid',
  pageSize = 20
}) => {
  const [virtualizedHeight, setVirtualizedHeight] = useState(window.innerHeight);
  const listRef = useRef<VirtualList>(null);
  const toast = useToast();
  const breakpoint = useBreakpoint();

  // Initialize document management hook with security context
  const {
    documents,
    loading,
    error,
    processingStatus,
    operations,
    auditTrail
  } = useDocuments({
    securityContext,
    encryptionConfig: {
      algorithm: 'AES-256-GCM',
      keySize: 256
    },
    auditConfig: {
      detailLevel: 'detailed',
      retentionPeriod: 7 * 365 // 7 years retention for HIPAA compliance
    }
  });

  // Memoized filtered and sorted documents
  const processedDocuments = useMemo(() => {
    let result = [...documents];

    // Apply filters
    if (filter) {
      result = result.filter(doc => {
        const matchesType = !filter.types?.length || filter.types.includes(doc.type);
        const matchesSearch = !filter.searchTerm || 
          doc.metadata.title.toLowerCase().includes(filter.searchTerm.toLowerCase());
        const matchesTags = !filter.tags?.length || 
          filter.tags.every(tag => doc.tags.includes(tag));
        const matchesEncryption = filter.encryptionStatus === undefined || 
          doc.securityInfo.encryptionInfo.algorithm !== undefined === filter.encryptionStatus;
        
        return matchesType && matchesSearch && matchesTags && matchesEncryption;
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      const modifier = sortOrder === 'asc' ? 1 : -1;
      return aValue > bValue ? modifier : -modifier;
    });

    return result;
  }, [documents, filter, sortBy, sortOrder]);

  // Handle document selection with security check
  const handleDocumentSelect = useCallback((id: string) => {
    const document = documents.find(doc => doc.id === id);
    if (!document) return;

    const isEncrypted = !!document.securityInfo.encryptionInfo.algorithm;
    
    // Audit document access
    if (auditCallback) {
      auditCallback('VIEW', id);
    }

    onDocumentSelect?.(id, isEncrypted);
  }, [documents, onDocumentSelect, auditCallback]);

  // Virtual list row renderer
  const renderRow = useCallback(({ index, style }) => {
    const document = processedDocuments[index];
    if (!document) return null;

    return (
      <div style={style}>
        <DocumentCard
          document={document}
          onSelect={handleDocumentSelect}
          isProcessing={processingStatus === DocumentStatus.PROCESSING}
          accessibilityLabel={`Document ${document.metadata.title}`}
          securityLevel={document.metadata.complianceInfo.sensitivityLevel}
          isEncrypted={!!document.securityInfo.encryptionInfo.algorithm}
        />
      </div>
    );
  }, [processedDocuments, processingStatus, handleDocumentSelect]);

  // Handle resize for virtualization
  React.useEffect(() => {
    const handleResize = () => {
      setVirtualizedHeight(window.innerHeight);
      listRef.current?.resetAfterIndex(0);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Error handling
  if (error) {
    toast({
      title: 'Error loading documents',
      description: error.message,
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  }

  // Loading state
  if (loading) {
    return (
      <LoadingContainer>
        <LoadingSpinner size="large" />
      </LoadingContainer>
    );
  }

  // Empty state
  if (!processedDocuments.length) {
    return (
      <EmptyStateContainer role="status" aria-live="polite">
        <h2>No documents found</h2>
        <p>Upload documents or adjust your filters to see results</p>
      </EmptyStateContainer>
    );
  }

  return (
    <ErrorBoundary>
      <StyledDocumentList
        className={className}
        viewMode={viewMode}
        role="region"
        aria-label="Document List"
        data-testid="document-list"
      >
        <VirtualListContainer>
          <VirtualList
            ref={listRef}
            height={virtualizedHeight}
            width="100%"
            itemCount={processedDocuments.length}
            itemSize={() => viewMode === 'grid' ? 300 : 150}
            overscanCount={2}
          >
            {renderRow}
          </VirtualList>
        </VirtualListContainer>
      </StyledDocumentList>
    </ErrorBoundary>
  );
};

export default DocumentList;
export type { DocumentListProps, DocumentFilter };