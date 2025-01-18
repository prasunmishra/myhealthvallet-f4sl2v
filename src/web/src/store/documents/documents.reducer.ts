/**
 * @fileoverview Redux reducer for document state management with HIPAA compliance
 * @version 1.0.0
 */

import { createReducer, PayloadAction } from '@reduxjs/toolkit'; // version: ^1.9.5
import { 
  DocumentsState, 
  DocumentActionTypes,
  Document,
  ProcessingStatus,
  DocumentFilter,
  PaginationUpdate,
  SortingUpdate,
  FetchDocumentsPayload
} from './documents.types';

/**
 * Initial state for documents slice
 */
const initialState: DocumentsState = {
  documents: {},
  selectedDocumentId: null,
  filters: {
    types: [],
    tags: [],
    startDate: new Date(),
    endDate: new Date(),
    searchQuery: '',
    includeArchived: false,
    providers: [],
    categories: [],
    flaggedOnly: false,
    processingStatuses: []
  },
  loading: false,
  error: null,
  processingStatus: {},
  pagination: {
    currentPage: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0
  },
  sorting: {
    field: 'uploadedAt',
    direction: 'desc'
  }
};

/**
 * Documents reducer with enhanced processing and HIPAA compliance tracking
 */
export default createReducer(initialState, (builder) => {
  builder
    // Fetch documents request
    .addCase(DocumentActionTypes.FETCH_DOCUMENTS_REQUEST, (state, action: PayloadAction<FetchDocumentsPayload>) => {
      state.loading = true;
      state.error = null;
      state.filters = {
        ...state.filters,
        ...action.payload.filters
      };
      state.pagination = {
        ...state.pagination,
        ...action.payload.pagination
      };
      state.sorting = action.payload.sorting;
    })

    // Fetch documents success
    .addCase(DocumentActionTypes.FETCH_DOCUMENTS_SUCCESS, (state, action: PayloadAction<Document[]>) => {
      state.loading = false;
      state.error = null;
      
      // Normalize documents into object
      state.documents = action.payload.reduce((acc, document) => {
        acc[document.id] = {
          ...document,
          isHIPAACompliant: document.securityInfo.complianceInfo.hipaaCompliant
        };
        return acc;
      }, {} as Record<string, Document>);
    })

    // Fetch documents failure
    .addCase(DocumentActionTypes.FETCH_DOCUMENTS_FAILURE, (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    })

    // Update document processing status
    .addCase(DocumentActionTypes.UPDATE_PROCESSING_STATUS, (state, action: PayloadAction<{ documentId: string; status: ProcessingStatus }>) => {
      const { documentId, status } = action.payload;
      state.processingStatus[documentId] = {
        ...status,
        lastUpdated: new Date()
      };

      // Update document if it exists in state
      if (state.documents[documentId]) {
        state.documents[documentId].processingResult = {
          ...state.documents[documentId].processingResult,
          status: status.status,
          confidence: status.accuracyScore
        };
      }
    })

    // Set selected document
    .addCase(DocumentActionTypes.SET_SELECTED_DOCUMENT, (state, action: PayloadAction<string | null>) => {
      state.selectedDocumentId = action.payload;
    })

    // Set document filters
    .addCase(DocumentActionTypes.SET_DOCUMENT_FILTERS, (state, action: PayloadAction<DocumentFilter>) => {
      state.filters = {
        ...state.filters,
        ...action.payload
      };
    })

    // Update pagination
    .addCase(DocumentActionTypes.SET_PAGINATION, (state, action: PayloadAction<PaginationUpdate>) => {
      state.pagination = {
        ...state.pagination,
        ...action.payload
      };
    })

    // Update sorting
    .addCase(DocumentActionTypes.SET_SORTING, (state, action: PayloadAction<SortingUpdate>) => {
      state.sorting = action.payload;
    })

    // Upload document success
    .addCase(DocumentActionTypes.UPLOAD_DOCUMENT_SUCCESS, (state, action: PayloadAction<Document>) => {
      const document = action.payload;
      state.documents[document.id] = {
        ...document,
        isHIPAACompliant: document.securityInfo.complianceInfo.hipaaCompliant
      };
      
      // Initialize processing status
      state.processingStatus[document.id] = {
        status: 'pending',
        progress: 0,
        errors: [],
        startTime: new Date(),
        lastUpdated: new Date(),
        accuracyScore: 0,
        requiresReview: false
      };
    })

    // Delete document success
    .addCase(DocumentActionTypes.DELETE_DOCUMENT_SUCCESS, (state, action: PayloadAction<string>) => {
      const documentId = action.payload;
      delete state.documents[documentId];
      delete state.processingStatus[documentId];
      
      if (state.selectedDocumentId === documentId) {
        state.selectedDocumentId = null;
      }
    })

    // Clear error
    .addCase(DocumentActionTypes.CLEAR_ERROR, (state) => {
      state.error = null;
    });
});