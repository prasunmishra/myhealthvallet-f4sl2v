/**
 * Redux selectors for document state management with HIPAA compliance
 * Provides comprehensive document filtering, processing status tracking, and error handling
 * @version 1.0.0
 */

import { createSelector } from '@reduxjs/toolkit'; // version: ^1.9.5
import { RootState } from '../rootReducer';
import { Document, DocumentType } from '../../types/documents.types';
import { DocumentsState, ProcessingStatus } from './documents.types';

/**
 * Base selector to get documents slice from root state
 */
export const selectDocumentsState = (state: RootState): DocumentsState => state.documents;

/**
 * Select all documents as an array with HIPAA compliance metadata
 */
export const selectAllDocuments = createSelector(
  [selectDocumentsState],
  (documentsState): Document[] => Object.values(documentsState.documents)
);

/**
 * Select currently selected document ID
 */
export const selectSelectedDocumentId = createSelector(
  [selectDocumentsState],
  (documentsState): string | null => documentsState.selectedDocumentId
);

/**
 * Select currently selected document with full details
 */
export const selectSelectedDocument = createSelector(
  [selectDocumentsState, selectSelectedDocumentId],
  (documentsState, selectedId): Document | null => 
    selectedId ? documentsState.documents[selectedId] : null
);

/**
 * Select documents loading state
 */
export const selectDocumentsLoading = createSelector(
  [selectDocumentsState],
  (documentsState): boolean => documentsState.loading
);

/**
 * Select documents error state
 */
export const selectDocumentsError = createSelector(
  [selectDocumentsState],
  (documentsState): string | null => documentsState.error
);

/**
 * Select document processing status by ID
 */
export const selectDocumentProcessingStatus = createSelector(
  [selectDocumentsState, (state: RootState, documentId: string) => documentId],
  (documentsState, documentId): ProcessingStatus | undefined => 
    documentsState.processingStatus[documentId]
);

/**
 * Select documents filtered by multiple criteria with enhanced type safety
 */
export const selectFilteredDocuments = createSelector(
  [selectDocumentsState],
  (documentsState): Document[] => {
    const { documents, filters } = documentsState;
    
    return Object.values(documents).filter(doc => {
      // Type filter
      if (filters.types.length && !filters.types.includes(doc.type)) {
        return false;
      }

      // Tag filter
      if (filters.tags.length && !filters.tags.some(tag => doc.tags.includes(tag))) {
        return false;
      }

      // Date range filter
      if (filters.startDate && doc.uploadedAt < filters.startDate) {
        return false;
      }
      if (filters.endDate && doc.uploadedAt > filters.endDate) {
        return false;
      }

      // Provider filter
      if (filters.providers.length && !filters.providers.includes(doc.metadata.provider)) {
        return false;
      }

      // Category filter
      if (filters.categories.length && !filters.categories.includes(doc.metadata.category)) {
        return false;
      }

      // Processing status filter
      if (filters.processingStatuses.length) {
        const status = documentsState.processingStatus[doc.id];
        if (!status || !filters.processingStatuses.includes(status.status)) {
          return false;
        }
      }

      // Search query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const searchableContent = [
          doc.name,
          doc.metadata.title,
          doc.metadata.description,
          ...doc.tags,
          doc.metadata.provider,
          doc.metadata.category
        ].join(' ').toLowerCase();
        
        if (!searchableContent.includes(query)) {
          return false;
        }
      }

      // Archived filter
      if (!filters.includeArchived && doc.isArchived) {
        return false;
      }

      // Flagged filter
      if (filters.flaggedOnly && !doc.processingResult.requiresReview) {
        return false;
      }

      return true;
    });
  }
);

/**
 * Select paginated documents with current pagination settings
 */
export const selectPaginatedDocuments = createSelector(
  [selectFilteredDocuments, selectDocumentsState],
  (filteredDocuments, documentsState): Document[] => {
    const { currentPage, pageSize } = documentsState.pagination;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredDocuments.slice(startIndex, startIndex + pageSize);
  }
);

/**
 * Select documents by type with HIPAA compliance validation
 */
export const selectDocumentsByType = createSelector(
  [selectAllDocuments, (state: RootState, type: DocumentType) => type],
  (documents, type): Document[] =>
    documents.filter(doc => doc.type === type && doc.isHIPAACompliant)
);

/**
 * Select documents requiring review based on processing results
 */
export const selectDocumentsRequiringReview = createSelector(
  [selectAllDocuments],
  (documents): Document[] =>
    documents.filter(doc => doc.processingResult.requiresReview)
);

/**
 * Select documents with failed processing status
 */
export const selectFailedDocuments = createSelector(
  [selectAllDocuments, selectDocumentsState],
  (documents, documentsState): Document[] =>
    documents.filter(doc => 
      documentsState.processingStatus[doc.id]?.status === 'failed'
    )
);

/**
 * Select average processing accuracy score
 */
export const selectAverageAccuracyScore = createSelector(
  [selectDocumentsState],
  (documentsState): number => {
    const scores = Object.values(documentsState.processingStatus)
      .map(status => status.accuracyScore)
      .filter(score => score > 0);
    
    if (!scores.length) return 0;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }
);