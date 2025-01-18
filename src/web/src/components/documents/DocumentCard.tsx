import React, { memo, useCallback, useState } from 'react';
import styled from 'styled-components';
import { useInView } from 'react-intersection-observer';
import Card from '../common/Card';
import Icon from '../common/Icon';
import ErrorBoundary from '../common/ErrorBoundary';
import { useTheme } from '../../hooks/useTheme';
import { Document, DocumentType, DocumentStatus } from '../../types/documents.types';

// Constants for document security and display
const SECURITY_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const;

const ICON_MAP = {
  LAB_RESULT: 'lab',
  PRESCRIPTION: 'prescription',
  IMAGING: 'image',
  CLINICAL_NOTE: 'notes',
  VACCINATION: 'vaccine',
  INSURANCE: 'insurance',
  CONSENT_FORM: 'form',
  MEDICAL_RECORD: 'medical',
} as const;

// Styled components with WCAG AAA compliance
const StyledCard = styled(Card)<{ isProcessing: boolean }>`
  position: relative;
  min-height: 200px;
  transition: transform 0.2s ease-in-out;
  opacity: ${props => props.isProcessing ? 0.7 : 1};
  
  &:focus-within {
    outline: 2px solid ${props => props.theme.colors.primary[500]};
    outline-offset: 2px;
  }

  @media (hover: hover) {
    &:hover {
      transform: translateY(-2px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const DocumentHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.SMALL}px;
  margin-bottom: ${props => props.theme.spacing.MEDIUM}px;
`;

const DocumentTitle = styled.h3`
  font-family: ${props => props.theme.typography.fontFamilies.primary};
  font-size: ${props => props.theme.typography.fontSizes.h4};
  color: ${props => props.theme.colors.text[900]};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SecurityBadge = styled.div<{ level: keyof typeof SECURITY_LEVELS }>`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.SMALL}px;
  padding: ${props => props.theme.spacing.SMALL}px;
  border-radius: ${props => props.theme.shape.borderRadius.sm}px;
  background-color: ${props => props.theme.colors[props.level === 'HIGH' ? 'error' : props.level === 'MEDIUM' ? 'warning' : 'success'][100]};
  color: ${props => props.theme.colors[props.level === 'HIGH' ? 'error' : props.level === 'MEDIUM' ? 'warning' : 'success'][700]};
  font-size: ${props => props.theme.typography.fontSizes.small};
`;

const MetadataList = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: ${props => props.theme.spacing.SMALL}px;
  margin: 0;
`;

const MetadataLabel = styled.dt`
  font-weight: ${props => props.theme.typography.fontWeights.medium};
  color: ${props => props.theme.colors.text[600]};
`;

const MetadataValue = styled.dd`
  margin: 0;
  color: ${props => props.theme.colors.text[900]};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.SMALL}px;
  margin-top: ${props => props.theme.spacing.MEDIUM}px;
`;

interface DocumentCardProps {
  document: Document;
  onFavorite: (id: string) => Promise<void>;
  onShare: (id: string) => Promise<void>;
  onSelect: (id: string) => void;
  onSecurityDetails: (id: string) => void;
  className?: string;
  isProcessing?: boolean;
  error?: Error | null;
  accessibilityLabel?: string;
  securityLevel?: keyof typeof SECURITY_LEVELS;
  isEncrypted?: boolean;
}

const DocumentCard: React.FC<DocumentCardProps> = memo(({
  document,
  onFavorite,
  onShare,
  onSelect,
  onSecurityDetails,
  className,
  isProcessing = false,
  error = null,
  accessibilityLabel,
  securityLevel = 'MEDIUM',
  isEncrypted = true
}) => {
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true
  });

  const handleFavorite = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onFavorite(document.id);
  }, [document.id, onFavorite]);

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onShare(document.id);
  }, [document.id, onShare]);

  const handleSecurityClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSecurityDetails(document.id);
  }, [document.id, onSecurityDetails]);

  return (
    <ErrorBoundary>
      <StyledCard
        ref={ref}
        elevation={isHovered ? 2 : 1}
        isProcessing={isProcessing}
        onClick={() => onSelect(document.id)}
        className={className}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="article"
        aria-label={accessibilityLabel || `${document.metadata.title} document`}
        data-testid="document-card"
      >
        <DocumentHeader>
          <Icon
            name={ICON_MAP[document.type as keyof typeof ICON_MAP] || 'document'}
            size="large"
            color={theme.colors.primary[500]}
            aria-hidden="true"
          />
          <DocumentTitle>{document.metadata.title}</DocumentTitle>
          <SecurityBadge level={securityLevel}>
            <Icon
              name={isEncrypted ? 'lock' : 'unlock'}
              size="small"
              color="currentColor"
              aria-label={isEncrypted ? 'Encrypted' : 'Not encrypted'}
            />
            {document.securityInfo.complianceInfo.hipaaCompliant && (
              <Icon
                name="shield"
                size="small"
                color="currentColor"
                aria-label="HIPAA compliant"
              />
            )}
          </SecurityBadge>
        </DocumentHeader>

        {inView && (
          <>
            <MetadataList>
              <MetadataLabel>Type</MetadataLabel>
              <MetadataValue>{document.type}</MetadataValue>
              
              <MetadataLabel>Date</MetadataLabel>
              <MetadataValue>
                {new Date(document.metadata.documentDate).toLocaleDateString()}
              </MetadataValue>
              
              <MetadataLabel>Provider</MetadataLabel>
              <MetadataValue>{document.metadata.provider}</MetadataValue>
              
              <MetadataLabel>Status</MetadataLabel>
              <MetadataValue>{document.status}</MetadataValue>
            </MetadataList>

            <ActionButtons>
              <button
                onClick={handleFavorite}
                aria-label="Add to favorites"
                disabled={isProcessing}
              >
                <Icon name="star" size="medium" />
              </button>
              
              <button
                onClick={handleShare}
                aria-label="Share document"
                disabled={isProcessing || !document.securityInfo.accessControl.publicAccess}
              >
                <Icon name="share" size="medium" />
              </button>
              
              <button
                onClick={handleSecurityClick}
                aria-label="View security details"
                disabled={isProcessing}
              >
                <Icon name="security" size="medium" />
              </button>
            </ActionButtons>
          </>
        )}

        {error && (
          <div role="alert" aria-live="polite">
            Error loading document: {error.message}
          </div>
        )}
      </StyledCard>
    </ErrorBoundary>
  );
});

DocumentCard.displayName = 'DocumentCard';

export default DocumentCard;
export type { DocumentCardProps };