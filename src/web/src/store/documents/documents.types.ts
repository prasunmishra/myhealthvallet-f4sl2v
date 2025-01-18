/**
 * @fileoverview Redux store type definitions for document management
 * @version 1.0.0
 * 
 * Type definitions for document state management including:
 * - Document state interfaces
 * - Action types
 * - Filter and processing status types
 * - HIPAA compliance tracking
 */

import { PayloadAction } from '@reduxjs/toolkit'; // version: ^1.9.5
import { Document, DocumentType, DocumentMetadata } from '../../types/documents.types';

/**
 * Document pagination state interface
 */
interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Document sorting state interface
 */
interface SortingState {
  field: keyof Document;
  direction: 'asc' | 'desc';
}

/**
 * Enhanced document processing status interface
 */
export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'review_required';
  progress: number;
  errors: string[];
  startTime: Date;
  lastUpdated: Date;
  accuracyScore: number;
  requiresReview: boolean;
}

/**
 * Comprehensive document filter interface
 */
export interface DocumentFilter {
  types: DocumentType[];
  tags: string[];
  startDate: Date;
  endDate: Date;
  searchQuery: string;
  includeArchived: boolean;
  providers: string[];
  categories: string[];
  flaggedOnly: boolean;
  processingStatuses: ProcessingStatus[];
}

/**
 * Document fetch payload interface
 */
export interface FetchDocumentsPayload {
  filters: DocumentFilter;
  pagination: PaginationState;
  sorting: SortingState;
}

/**
 * Document upload payload interface
 */
export interface UploadDocumentPayload {
  file: File;
  metadata: DocumentMetadata;
  type: DocumentType;
}

/**
 * Pagination update payload interface
 */
export interface PaginationUpdate {
  currentPage?: number;
  pageSize?: number;
}

/**
 * Sorting update payload interface
 */
export interface SortingUpdate {
  field: keyof Document;
  direction: 'asc' | 'desc';
}

/**
 * Enhanced documents state interface
 */
export interface DocumentsState {
  documents: Record<string, Document>;
  selectedDocumentId: string | null;
  filters: DocumentFilter;
  loading: boolean;
  error: string | null;
  processingStatus: Record<string, ProcessingStatus>;
  pagination: PaginationState;
  sorting: SortingState;
}

/**
 * Document action types enum
 */
export enum DocumentActionTypes {
  FETCH_DOCUMENTS_REQUEST = 'documents/fetchRequest',
  FETCH_DOCUMENTS_SUCCESS = 'documents/fetchSuccess',
  FETCH_DOCUMENTS_FAILURE = 'documents/fetchFailure',
  UPLOAD_DOCUMENT_REQUEST = 'documents/uploadRequest',
  UPLOAD_DOCUMENT_SUCCESS = 'documents/uploadSuccess',
  UPLOAD_DOCUMENT_FAILURE = 'documents/uploadFailure',
  UPDATE_DOCUMENT_REQUEST = 'documents/updateRequest',
  UPDATE_DOCUMENT_SUCCESS = 'documents/updateSuccess',
  UPDATE_DOCUMENT_FAILURE = 'documents/updateFailure',
  DELETE_DOCUMENT_REQUEST = 'documents/deleteRequest',
  DELETE_DOCUMENT_SUCCESS = 'documents/deleteSuccess',
  DELETE_DOCUMENT_FAILURE = 'documents/deleteFailure',
  SET_SELECTED_DOCUMENT = 'documents/setSelected',
  SET_DOCUMENT_FILTERS = 'documents/setFilters',
  UPDATE_PROCESSING_STATUS = 'documents/updateProcessing',
  SET_PAGINATION = 'documents/setPagination',
  SET_SORTING = 'documents/setSorting',
  CLEAR_ERROR = 'documents/clearError'
}

/**
 * Document action types
 */
export type DocumentsAction =
  | PayloadAction<FetchDocumentsPayload>
  | PayloadAction<Document[]>
  | PayloadAction<UploadDocumentPayload>
  | PayloadAction<Document>
  | PayloadAction<string>
  | PayloadAction<DocumentFilter>
  | PayloadAction<ProcessingStatus>
  | PayloadAction<Error>
  | PayloadAction<PaginationUpdate>
  | PayloadAction<SortingUpdate>;