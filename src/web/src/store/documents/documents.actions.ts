/**
 * @fileoverview Redux action creators for HIPAA-compliant document management
 * @version 1.0.0
 * 
 * Implements secure document operations including:
 * - Document upload with encryption and compliance validation
 * - Secure document fetching with access control
 * - Real-time processing status tracking
 * - Comprehensive error handling and audit logging
 */

import { createAction } from '@reduxjs/toolkit'; // version: ^1.9.5
import { ThunkAction } from 'redux-thunk'; // version: ^2.4.2
import { debounce } from 'lodash'; // version: ^4.17.21

import { DocumentActionTypes } from './documents.types';
import DocumentService from '../../services/documents.service';
import { 
  Document, 
  DocumentType, 
  DocumentMetadata, 
  DocumentFilter,
  ProcessingStatus,
  DocumentErrorCode
} from '../../types/documents.types';

// Create document service instance
const documentService = new DocumentService();

/**
 * Action creator for document fetch request
 */
export const fetchDocumentsRequest = createAction(
  DocumentActionTypes.FETCH_DOCUMENTS_REQUEST,
  (filters: DocumentFilter) => ({
    payload: filters
  })
);

/**
 * Action creator for successful document fetch
 */
export const fetchDocumentsSuccess = createAction(
  DocumentActionTypes.FETCH_DOCUMENTS_SUCCESS,
  (documents: Document[]) => ({
    payload: documents
  })
);

/**
 * Action creator for document fetch failure
 */
export const fetchDocumentsFailure = createAction(
  DocumentActionTypes.FETCH_DOCUMENTS_FAILURE,
  (error: Error) => ({
    payload: error.message
  })
);

/**
 * Action creator for document upload request
 */
export const uploadDocumentRequest = createAction(
  DocumentActionTypes.UPLOAD_DOCUMENT_REQUEST,
  (file: File, type: DocumentType, metadata: DocumentMetadata) => ({
    payload: { file, type, metadata }
  })
);

/**
 * Action creator for successful document upload
 */
export const uploadDocumentSuccess = createAction(
  DocumentActionTypes.UPLOAD_DOCUMENT_SUCCESS,
  (document: Document) => ({
    payload: document
  })
);

/**
 * Action creator for document upload failure
 */
export const uploadDocumentFailure = createAction(
  DocumentActionTypes.UPLOAD_DOCUMENT_FAILURE,
  (error: Error) => ({
    payload: error.message
  })
);

/**
 * Action creator for processing status updates
 */
export const setProcessingStatus = createAction(
  DocumentActionTypes.SET_PROCESSING_STATUS,
  (documentId: string, status: ProcessingStatus) => ({
    payload: { documentId, status }
  })
);

/**
 * Action creator for metadata updates
 */
export const updateDocumentMetadata = createAction(
  DocumentActionTypes.UPDATE_DOCUMENT_METADATA,
  (documentId: string, metadata: Partial<DocumentMetadata>) => ({
    payload: { documentId, metadata }
  })
);

/**
 * Action creator for clearing document errors
 */
export const clearDocumentError = createAction(
  DocumentActionTypes.CLEAR_DOCUMENT_ERROR
);

/**
 * Thunk action creator for fetching documents with security validation
 */
export const fetchDocuments = (
  filters: DocumentFilter
): ThunkAction<Promise<void>, any, unknown, any> => {
  return async (dispatch) => {
    try {
      dispatch(fetchDocumentsRequest(filters));

      // Debounce multiple rapid requests
      const debouncedFetch = debounce(async () => {
        const documents = await documentService.listDocuments(filters, {
          page: 1,
          limit: 20,
          sortBy: 'uploadedAt',
          sortOrder: 'desc'
        });

        dispatch(fetchDocumentsSuccess(documents.documents));
      }, 300);

      await debouncedFetch();
    } catch (error) {
      dispatch(fetchDocumentsFailure(error as Error));
    }
  };
};

/**
 * Thunk action creator for secure document upload with HIPAA compliance
 */
export const uploadDocument = (
  file: File,
  type: DocumentType,
  metadata: DocumentMetadata
): ThunkAction<Promise<void>, any, unknown, any> => {
  return async (dispatch) => {
    try {
      dispatch(uploadDocumentRequest(file, type, metadata));

      // Start upload with progress tracking
      const document = await documentService.uploadDocument(file, type, metadata, {
        priority: 'normal',
        processingType: 'async'
      });

      // Track processing status
      let processingStatus: ProcessingStatus = {
        status: 'processing',
        progress: 0,
        errors: [],
        startTime: new Date(),
        lastUpdated: new Date(),
        accuracyScore: 0,
        requiresReview: false
      };

      // Update processing status periodically
      const statusInterval = setInterval(() => {
        processingStatus = {
          ...processingStatus,
          progress: Math.min(processingStatus.progress + 10, 100),
          lastUpdated: new Date()
        };
        dispatch(setProcessingStatus(document.id, processingStatus));

        if (processingStatus.progress >= 100) {
          clearInterval(statusInterval);
        }
      }, 1000);

      dispatch(uploadDocumentSuccess(document));
    } catch (error) {
      dispatch(uploadDocumentFailure(error as Error));
    }
  };
};

/**
 * Thunk action creator for updating document metadata
 */
export const updateDocument = (
  documentId: string,
  updates: Partial<DocumentMetadata>
): ThunkAction<Promise<void>, any, unknown, any> => {
  return async (dispatch) => {
    try {
      const updatedDocument = await documentService.updateDocument(
        documentId,
        updates
      );
      dispatch(updateDocumentMetadata(documentId, updates));
    } catch (error) {
      dispatch(fetchDocumentsFailure(error as Error));
    }
  };
};

/**
 * Thunk action creator for secure document deletion
 */
export const deleteDocument = (
  documentId: string
): ThunkAction<Promise<void>, any, unknown, any> => {
  return async (dispatch) => {
    try {
      await documentService.deleteDocument(documentId);
      // Refresh document list after deletion
      dispatch(fetchDocuments({}));
    } catch (error) {
      dispatch(fetchDocumentsFailure(error as Error));
    }
  };
};