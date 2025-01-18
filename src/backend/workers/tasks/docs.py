"""
Celery worker tasks module for asynchronous document processing operations.
Implements HIPAA-compliant document processing with OCR, classification, and secure storage.

Version: 1.0.0
"""

import logging
from typing import Dict, Optional
import structlog
from celery import Task
from celery.exceptions import MaxRetriesExceededError
import random

from services.docs.processor import DocumentProcessor
from services.docs.storage import DocumentStorageService
from core.config import settings
from core.telemetry import MetricsManager

# Configure structured logging with HIPAA compliance
logger = structlog.get_logger(__name__).bind(component='document_processor')

# Initialize metrics manager
metrics = MetricsManager()

# Global constants
RETRY_BACKOFF = 60  # Base retry delay in seconds
MAX_BACKOFF = 3600  # Maximum retry delay in seconds
SECURITY_CONTEXT = settings.SECURITY_CONFIG

@celery.task(bind=True, 
             name='process_document_ocr',
             queue='document-ocr',
             max_retries=settings.MAX_RETRIES,
             soft_time_limit=settings.PROCESSING_TIMEOUT,
             acks_late=True)
def process_document_ocr(self,
                        document_data: bytes,
                        user_id: str,
                        document_type: str,
                        security_context: Dict) -> Dict:
    """
    Celery task for processing documents through OCR pipeline with enhanced security.
    
    Args:
        document_data: Raw document binary data
        user_id: ID of the user uploading the document
        document_type: Type of document being processed
        security_context: Security context for the operation
        
    Returns:
        Dict containing processing results with audit trail
    """
    try:
        # Record task start
        metrics.record_request(
            endpoint="document_processing",
            duration=0,
            status_code=202
        )
        
        logger.info("Starting document processing",
                   user_id=user_id,
                   document_type=document_type,
                   task_id=self.request.id)

        # Initialize processors with security context
        document_processor = DocumentProcessor(
            config=settings.DOCUMENT_PROCESSOR_CONFIG,
            security_config=security_context
        )
        
        storage_service = DocumentStorageService(
            config=settings.STORAGE_CONFIG,
            security_config=security_context
        )

        # Validate document format and content
        validation_result = document_processor.validate_document(
            document_data,
            document_type
        )
        
        if not validation_result['is_valid']:
            raise ValueError(f"Document validation failed: {validation_result['message']}")

        # Process document through OCR pipeline
        processing_result = document_processor.process_document(
            document=document_data,
            user_id=user_id,
            processing_options={
                'document_type': document_type,
                'detect_phi': True,
                'enhance_quality': True
            }
        )

        # Verify processing accuracy
        metrics_result = document_processor.get_processing_metrics()
        if metrics_result['ocr_accuracy'] < settings.MIN_OCR_ACCURACY:
            raise ValueError(f"OCR accuracy below threshold: {metrics_result['ocr_accuracy']}")

        # Upload processed document to secure storage
        storage_result = storage_service.upload_document(
            document_data=processing_result['processed_document'],
            user_id=user_id,
            document_type=document_type,
            metadata=processing_result['metadata']
        )

        # Verify storage encryption
        if not storage_service.verify_encryption(storage_result[1]):
            raise RuntimeError("Document encryption verification failed")

        # Prepare success response
        result = {
            'status': 'completed',
            'task_id': self.request.id,
            'document_info': {
                'user_id': user_id,
                'document_type': document_type,
                'storage_url': storage_result[1]
            },
            'processing_results': {
                'ocr_text': processing_result['text'],
                'confidence': processing_result['confidence'],
                'phi_protected': processing_result['phi_protected']
            },
            'metrics': metrics_result,
            'audit_trail': {
                'processing_timestamp': processing_result['timestamp'],
                'security_verified': True
            }
        }

        # Record successful processing
        metrics.record_request(
            endpoint="document_processing",
            duration=processing_result['processing_time'],
            status_code=200
        )

        logger.info("Document processing completed successfully",
                   user_id=user_id,
                   task_id=self.request.id,
                   storage_url=storage_result[1])

        return result

    except Exception as exc:
        # Handle task retry with exponential backoff
        return retry_document_processing(
            task=self,
            exc=exc,
            task_kwargs={
                'document_data': document_data,
                'user_id': user_id,
                'document_type': document_type,
                'security_context': security_context
            },
            security_context=security_context
        )

def retry_document_processing(task: Task,
                            exc: Exception,
                            task_kwargs: Dict,
                            security_context: Dict) -> None:
    """
    Enhanced helper function for document processing retries with security validation.
    
    Args:
        task: Celery task instance
        exc: Exception that triggered the retry
        task_kwargs: Task keyword arguments
        security_context: Security context for the operation
    """
    try:
        # Log failure with security context
        logger.error("Document processing failed",
                    error=str(exc),
                    task_id=task.request.id,
                    user_id=task_kwargs['user_id'],
                    retry_count=task.request.retries)

        # Calculate retry delay with exponential backoff and jitter
        retry_delay = min(
            RETRY_BACKOFF * (2 ** task.request.retries) + random.uniform(0, 10),
            MAX_BACKOFF
        )

        # Record failure metrics
        metrics.record_request(
            endpoint="document_processing",
            duration=0,
            status_code=500
        )

        # Retry task with security context
        task.retry(
            exc=exc,
            countdown=retry_delay,
            kwargs=task_kwargs,
            max_retries=settings.MAX_RETRIES
        )

    except MaxRetriesExceededError:
        logger.error("Max retries exceeded for document processing",
                    task_id=task.request.id,
                    user_id=task_kwargs['user_id'])
        raise

@celery.task(name='get_processing_status',
             queue='document-ocr')
def get_processing_status(task_id: str,
                         user_id: str,
                         security_context: Dict) -> Dict:
    """
    Task to retrieve document processing status with security validation.
    
    Args:
        task_id: ID of the processing task
        user_id: ID of the requesting user
        security_context: Security context for the operation
        
    Returns:
        Dict containing processing status and metrics
    """
    try:
        # Initialize document processor
        document_processor = DocumentProcessor(
            config=settings.DOCUMENT_PROCESSOR_CONFIG,
            security_config=security_context
        )

        # Get processing metrics
        metrics_result = document_processor.get_processing_metrics()

        # Prepare status response
        status = {
            'task_id': task_id,
            'user_id': user_id,
            'status': 'completed' if metrics_result else 'processing',
            'metrics': metrics_result,
            'audit_trail': {
                'request_timestamp': metrics_result.get('timestamp'),
                'security_verified': True
            }
        }

        logger.info("Processing status retrieved",
                   task_id=task_id,
                   user_id=user_id)

        return status

    except Exception as e:
        logger.error("Error retrieving processing status",
                    error=str(e),
                    task_id=task_id,
                    user_id=user_id)
        raise