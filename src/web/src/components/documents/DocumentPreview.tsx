import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { Document } from '../../types/documents.types';
import { useGesture } from '@use-gesture/react';
import { pdf } from '@react-pdf/renderer';
import { auditLog } from '@hipaa/audit-log';

// Constants for zoom and rotation controls
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const ROTATION_STEP = 90;
const WATERMARK_OPACITY = 0.3;
const ACCESS_TIMEOUT = 300000; // 5 minutes

// Styled components for document preview
const PreviewContainer = styled.div<{ zoom: number; rotation: number }>`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.background};
  transform: scale(${({ zoom }) => zoom}) rotate(${({ rotation }) => rotation}deg);
  transform-origin: center center;
  transition: transform 0.2s ease-out;
`;

const DocumentContent = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Watermark = styled.div<{ opacity: number }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${({ opacity }) => opacity};
  pointer-events: none;
  user-select: none;
  font-size: 24px;
  color: ${({ theme }) => theme.colors.text};
  transform: rotate(-45deg);
`;

const Controls = styled.div`
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.75);
  padding: 8px;
  border-radius: 8px;
  z-index: 100;
`;

const ControlButton = styled.button`
  background: transparent;
  border: 1px solid white;
  color: white;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
`;

// Props interface with enhanced security and accessibility features
interface DocumentPreviewProps {
  document: Document;
  onClose: () => void;
  onShare?: (id: string, accessLevel: string) => void;
  onDownload?: (id: string, accessLevel: string) => void;
  className?: string;
  initialZoom?: number;
  showWatermark?: boolean;
  accessibilityMode?: 'screen-reader' | 'keyboard' | 'default';
}

// Enhanced preview state interface
interface PreviewState {
  zoom: number;
  rotation: number;
  currentPage: number;
  isLoading: boolean;
  error: Error | null;
  accessGranted: boolean;
  watermarkVisible: boolean;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  document,
  onClose,
  onShare,
  onDownload,
  className,
  initialZoom = 1,
  showWatermark = true,
  accessibilityMode = 'default'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>({
    zoom: initialZoom,
    rotation: 0,
    currentPage: 1,
    isLoading: true,
    error: null,
    accessGranted: false,
    watermarkVisible: showWatermark
  });

  // Access control timer
  useEffect(() => {
    const accessTimer = setTimeout(() => {
      setState(prev => ({ ...prev, accessGranted: false }));
      onClose();
    }, ACCESS_TIMEOUT);

    return () => clearTimeout(accessTimer);
  }, [onClose]);

  // Audit logging
  useEffect(() => {
    auditLog({
      eventType: 'DOCUMENT_VIEW',
      documentId: document.id,
      userId: document.accessControl.ownerId,
      metadata: {
        documentType: document.type,
        accessLevel: document.accessControl.permissions[0]?.role
      }
    });
  }, [document]);

  // Gesture handling for zoom and rotation
  const bind = useGesture({
    onPinch: ({ offset: [d] }) => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, d));
      setState(prev => ({ ...prev, zoom: newZoom }));
      announceZoomChange(newZoom);
    },
    onRotate: ({ offset: [r] }) => {
      const newRotation = Math.round(r / ROTATION_STEP) * ROTATION_STEP;
      setState(prev => ({ ...prev, rotation: newRotation }));
      announceRotationChange(newRotation);
    }
  });

  // Keyboard controls
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (accessibilityMode === 'keyboard') {
        switch (e.key) {
          case '+':
            handleZoom(state.zoom + ZOOM_STEP);
            break;
          case '-':
            handleZoom(state.zoom - ZOOM_STEP);
            break;
          case 'r':
            handleRotate(state.rotation + ROTATION_STEP);
            break;
          case 'Escape':
            onClose();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [state.zoom, state.rotation, accessibilityMode, onClose]);

  // Zoom handling
  const handleZoom = useCallback((newZoom: number) => {
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    setState(prev => ({ ...prev, zoom: clampedZoom }));
    announceZoomChange(clampedZoom);
  }, []);

  // Rotation handling
  const handleRotate = useCallback((newRotation: number) => {
    const normalizedRotation = newRotation % 360;
    setState(prev => ({ ...prev, rotation: normalizedRotation }));
    announceRotationChange(normalizedRotation);
  }, []);

  // Accessibility announcements
  const announceZoomChange = (zoom: number) => {
    if (accessibilityMode === 'screen-reader') {
      const percentage = Math.round(zoom * 100);
      announceToScreenReader(`Zoom level ${percentage}%`);
    }
  };

  const announceRotationChange = (rotation: number) => {
    if (accessibilityMode === 'screen-reader') {
      announceToScreenReader(`Document rotated to ${rotation} degrees`);
    }
  };

  const announceToScreenReader = (message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };

  return (
    <PreviewContainer
      ref={containerRef}
      className={className}
      zoom={state.zoom}
      rotation={state.rotation}
      {...bind()}
      role="document"
      aria-label={`Document preview: ${document.metadata.title}`}
    >
      <DocumentContent>
        {renderPreview(document)}
        {state.watermarkVisible && (
          <Watermark 
            opacity={WATERMARK_OPACITY}
            aria-hidden="true"
          >
            CONFIDENTIAL
          </Watermark>
        )}
      </DocumentContent>

      <Controls aria-label="Document controls">
        <ControlButton
          onClick={() => handleZoom(state.zoom - ZOOM_STEP)}
          disabled={state.zoom <= MIN_ZOOM}
          aria-label="Zoom out"
        >
          -
        </ControlButton>
        <ControlButton
          onClick={() => handleZoom(state.zoom + ZOOM_STEP)}
          disabled={state.zoom >= MAX_ZOOM}
          aria-label="Zoom in"
        >
          +
        </ControlButton>
        <ControlButton
          onClick={() => handleRotate(state.rotation + ROTATION_STEP)}
          aria-label="Rotate document"
        >
          ↻
        </ControlButton>
        {onShare && (
          <ControlButton
            onClick={() => onShare(document.id, document.accessControl.permissions[0]?.role)}
            aria-label="Share document"
          >
            Share
          </ControlButton>
        )}
        {onDownload && (
          <ControlButton
            onClick={() => onDownload(document.id, document.accessControl.permissions[0]?.role)}
            aria-label="Download document"
          >
            Download
          </ControlButton>
        )}
      </Controls>
    </PreviewContainer>
  );
};

// Helper function to render preview based on document type
const renderPreview = (document: Document) => {
  switch (document.mimeType) {
    case 'application/pdf':
      return <pdf.Document file={document.url} />;
    case 'image/jpeg':
    case 'image/png':
      return (
        <img
          src={document.url}
          alt={document.metadata.title}
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        />
      );
    default:
      return (
        <div>
          Unsupported document type: {document.mimeType}
        </div>
      );
  }
};

export default DocumentPreview;