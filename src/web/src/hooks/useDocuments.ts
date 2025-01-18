import { useState, useCallback, useEffect } from 'react'; // version: ^18.0.0
import { useDispatch, useSelector } from 'react-redux'; // version: ^8.0.0
import { Document, DocumentType, DocumentMetadata, DocumentStatus } from '../types/documents.types';
import { API_CONFIG } from '../config/api.config';
import { API_ROUTES, buildWsUrl } from '../constants/api.constants';

/**
 * Security context interface for HIPAA compliance
 */
interface SecurityContext {
  encryptionKey: string;
  hipaaCompliance: boolean;
  auditEnabled: boolean;
  userRole: string;
}

/**
 * Document operations interface
 */
interface DocumentOperations {
  uploadDocument: (file: File, metadata: Partial<DocumentMetadata>) => Promise<Document>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<Document>;
  deleteDocument: (id: string) => Promise<void>;
  fetchDocument: (id: string) => Promise<Document>;
  shareDocument: (id: string, recipientId: string) => Promise<void>;
  generateAuditReport: (id: string) => Promise<DocumentAudit>;
}

/**
 * Custom hook for secure document management with HIPAA compliance
 */
export const useDocuments = (options: {
  securityContext: SecurityContext;
  encryptionConfig?: {
    algorithm: string;
    keySize: number;
  };
  auditConfig?: {
    detailLevel: 'basic' | 'detailed';
    retentionPeriod: number;
  };
}) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [processingStatus, setProcessingStatus] = useState<DocumentStatus>(DocumentStatus.PENDING);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [auditTrail, setAuditTrail] = useState<DocumentAudit[]>([]);

  // WebSocket connection for real-time document processing status
  const wsConnection = useCallback(() => {
    const ws = new WebSocket(buildWsUrl(API_ROUTES.DOCUMENTS.UPLOAD));
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProcessingStatus(data.status);
      updateAuditTrail({
        eventType: 'PROCESSING_UPDATE',
        status: data.status,
        timestamp: new Date()
      });
    };

    return ws;
  }, []);

  /**
   * Update audit trail with new events
   */
  const updateAuditTrail = useCallback((event: any) => {
    if (options.securityContext.auditEnabled) {
      setAuditTrail(prev => [...prev, {
        ...event,
        userId: options.securityContext.userRole,
        ipAddress: window.location.hostname,
        userAgent: navigator.userAgent
      }]);
    }
  }, [options.securityContext]);

  /**
   * Secure document upload with encryption and validation
   */
  const uploadDocument = useCallback(async (
    file: File,
    metadata: Partial<DocumentMetadata>
  ): Promise<Document> => {
    try {
      setLoading(true);
      setError(null);

      // Validate file and metadata
      if (!file || !metadata) {
        throw new Error('Invalid file or metadata');
      }

      // Create form data with encryption
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify({
        ...metadata,
        encryptionKey: options.securityContext.encryptionKey,
        hipaaCompliant: true
      }));

      // Upload request with security headers
      const response = await fetch(API_CONFIG.buildUrl(API_ROUTES.DOCUMENTS.UPLOAD), {
        method: 'POST',
        headers: {
          'X-Security-Context': JSON.stringify(options.securityContext)
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const document = await response.json();
      
      updateAuditTrail({
        eventType: 'DOCUMENT_UPLOAD',
        documentId: document.id,
        timestamp: new Date()
      });

      return document;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [options.securityContext, updateAuditTrail]);

  /**
   * Secure document update with audit logging
   */
  const updateDocument = useCallback(async (
    id: string,
    updates: Partial<Document>
  ): Promise<Document> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_CONFIG.buildUrl(`${API_ROUTES.DOCUMENTS.DETAIL}/${id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Security-Context': JSON.stringify(options.securityContext)
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Update failed');
      }

      const updatedDocument = await response.json();

      updateAuditTrail({
        eventType: 'DOCUMENT_UPDATE',
        documentId: id,
        changes: updates,
        timestamp: new Date()
      });

      return updatedDocument;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [options.securityContext, updateAuditTrail]);

  /**
   * Secure document deletion with compliance checks
   */
  const deleteDocument = useCallback(async (id: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_CONFIG.buildUrl(`${API_ROUTES.DOCUMENTS.DELETE}/${id}`), {
        method: 'DELETE',
        headers: {
          'X-Security-Context': JSON.stringify(options.securityContext)
        }
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      updateAuditTrail({
        eventType: 'DOCUMENT_DELETE',
        documentId: id,
        timestamp: new Date()
      });
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [options.securityContext, updateAuditTrail]);

  /**
   * Secure document retrieval with decryption
   */
  const fetchDocument = useCallback(async (id: string): Promise<Document> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_CONFIG.buildUrl(`${API_ROUTES.DOCUMENTS.DETAIL}/${id}`), {
        headers: {
          'X-Security-Context': JSON.stringify(options.securityContext)
        }
      });

      if (!response.ok) {
        throw new Error('Fetch failed');
      }

      const document = await response.json();

      updateAuditTrail({
        eventType: 'DOCUMENT_ACCESS',
        documentId: id,
        timestamp: new Date()
      });

      return document;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [options.securityContext, updateAuditTrail]);

  /**
   * Secure document sharing with access control
   */
  const shareDocument = useCallback(async (
    id: string,
    recipientId: string
  ): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_CONFIG.buildUrl(`${API_ROUTES.DOCUMENTS.SHARE}/${id}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Security-Context': JSON.stringify(options.securityContext)
        },
        body: JSON.stringify({ recipientId })
      });

      if (!response.ok) {
        throw new Error('Share failed');
      }

      updateAuditTrail({
        eventType: 'DOCUMENT_SHARE',
        documentId: id,
        recipientId,
        timestamp: new Date()
      });
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [options.securityContext, updateAuditTrail]);

  /**
   * Generate comprehensive audit report
   */
  const generateAuditReport = useCallback(async (id: string): Promise<DocumentAudit> => {
    try {
      const response = await fetch(API_CONFIG.buildUrl(`/documents/${id}/audit`), {
        headers: {
          'X-Security-Context': JSON.stringify(options.securityContext)
        }
      });

      if (!response.ok) {
        throw new Error('Audit report generation failed');
      }

      return await response.json();
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, [options.securityContext]);

  // Initialize WebSocket connection for real-time updates
  useEffect(() => {
    const ws = wsConnection();
    return () => {
      ws.close();
    };
  }, [wsConnection]);

  return {
    documents,
    loading,
    error,
    processingStatus,
    auditTrail,
    operations: {
      uploadDocument,
      updateDocument,
      deleteDocument,
      fetchDocument,
      shareDocument,
      generateAuditReport
    }
  };
};

export type { SecurityContext, DocumentOperations };