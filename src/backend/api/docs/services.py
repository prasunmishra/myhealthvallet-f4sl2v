"""
Service layer for managing health document operations with HIPAA compliance,
OCR support, and enhanced security measures.

Version: 1.0.0
"""

import logging
from typing import Dict, List, Optional, Tuple, Union
from datetime import datetime
import asyncio
from functools import wraps

from fastapi import HTTPException, UploadFile  # fastapi v0.100+
from celery import Celery  # celery v5.3+
from cachetools import TTLCache  # cachetools v5.3+

from api.docs.models import HealthDocument, validate_document_type
from services.docs.processor import DocumentProcessor, validate_document_input
from services.docs.storage import DocumentStorageService
from core.security import SecurityManager
from core.logging import setup_logging

# Configure logging
logger = setup_logging()

# Constants
PROCESSING_TIMEOUT_SECONDS = 300
MAX_SHARE_USERS = 10
PRESIGNED_URL_EXPIRY = 3600
MAX_RETRY_ATTEMPTS = 3
DOCUMENT_CACHE_TTL = 1800
PHI_ENCRYPTION_ALGORITHM = 'AES-256-GCM'

def audit_log(func):
    """Decorator for HIPAA-compliant audit logging."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            # Log operation start
            logger.info(f"Starting {func.__name__} operation", 
                       extra={'user_id': kwargs.get('user_id')})
            
            result = await func(*args, **kwargs)
            
            # Log operation completion
            logger.info(f"Completed {func.__name__} operation successfully",
                       extra={'user_id': kwargs.get('user_id')})
            
            return result
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {str(e)}",
                        extra={'user_id': kwargs.get('user_id')})
            raise
    return wrapper

def validate_phi(func):
    """Decorator for PHI validation and protection."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            # Enable PHI protection
            kwargs['phi_protection'] = True
            return await func(*args, **kwargs)
        except Exception as e:
            logger.error(f"PHI validation error: {str(e)}")
            raise HTTPException(status_code=400, detail="PHI validation failed")
    return wrapper

class DocumentService:
    """Service class for managing health document operations with enhanced security."""
    
    def __init__(self, settings: Dict, security_config: Dict):
        """Initialize document service with security configuration."""
        self.settings = settings
        self.security_config = security_config
        
        # Initialize components
        self.processor = DocumentProcessor(
            config=settings.get('processor_config'),
            gpu_config={'use_gpu': True},
            security_config=security_config
        )
        
        self.storage = DocumentStorageService(
            config=settings.get('storage_config'),
            security_manager=SecurityManager(security_config)
        )
        
        # Initialize document cache
        self.document_cache = TTLCache(
            maxsize=1000,
            ttl=DOCUMENT_CACHE_TTL
        )
        
        # Initialize Celery for async processing
        self.celery = Celery(
            'document_processing',
            broker=settings['CELERY_BROKER_URL']
        )
        
        # Configure retry settings
        self.retry_config = {
            'max_attempts': MAX_RETRY_ATTEMPTS,
            'backoff_factor': 2
        }
        
        logger.info("Document service initialized with security configuration")

    @audit_log
    @validate_phi
    async def upload_document(
        self,
        document_content: bytes,
        document_type: str,
        user_id: str,
        title: str,
        tags: List[str],
        security_metadata: Dict
    ) -> HealthDocument:
        """
        Upload and process a new health document with enhanced security validation.
        
        Args:
            document_content: Binary document content
            document_type: Type of health document
            user_id: ID of the user uploading document
            title: Document title
            tags: Document tags
            security_metadata: Security-related metadata
            
        Returns:
            Created HealthDocument instance
        """
        try:
            # Validate document type
            if not validate_document_type(document_type):
                raise ValueError(f"Invalid document type: {document_type}")
            
            # Validate document content
            validation_result = await validate_document_input(
                document_content,
                {'document_type': document_type}
            )
            
            if not validation_result[0]:
                raise ValueError(f"Document validation failed: {validation_result[1]}")
            
            # Create document record
            document = HealthDocument(
                user_id=user_id,
                title=title,
                document_type=document_type,
                tags=tags,
                created_by=user_id,
                updated_by=user_id
            )
            
            # Upload to storage with encryption
            upload_result = await self.storage.upload_document(
                document_data=document_content,
                user_id=user_id,
                document_type=document_type,
                metadata={
                    'title': title,
                    'tags': tags,
                    **security_metadata
                }
            )
            
            if not upload_result[0]:
                raise Exception("Document upload failed")
            
            # Update document with storage information
            document.storage_url = upload_result[1]
            document.save()
            
            # Queue document for processing
            processing_task = self.celery.send_task(
                'process_document',
                args=[document.id, user_id],
                retry=True,
                retry_policy={
                    'max_retries': self.retry_config['max_attempts'],
                    'interval_start': 0,
                    'interval_step': 2,
                    'interval_max': 10
                }
            )
            
            # Update document status
            document.update_ocr_status("PROCESSING")
            
            # Log audit trail
            document.update_audit_log(
                user_id=user_id,
                action="UPLOAD",
                details={
                    'processing_task_id': processing_task.id,
                    'security_metadata': security_metadata
                }
            )
            
            return document
            
        except Exception as e:
            logger.error(f"Document upload failed: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Document upload failed: {str(e)}"
            )

    @audit_log
    async def get_document(
        self,
        document_id: str,
        user_id: str
    ) -> Tuple[HealthDocument, bytes]:
        """
        Retrieve document with content and validate access permissions.
        
        Args:
            document_id: ID of the document to retrieve
            user_id: ID of the user requesting document
            
        Returns:
            Tuple of (document_record, document_content)
        """
        try:
            # Check cache first
            cache_key = f"{document_id}:{user_id}"
            if cache_key in self.document_cache:
                return self.document_cache[cache_key]
            
            # Retrieve document record
            document = HealthDocument.objects(id=document_id).first()
            if not document:
                raise HTTPException(status_code=404, detail="Document not found")
            
            # Validate access permissions
            if not (document.user_id == user_id or user_id in document.shared_with):
                raise HTTPException(status_code=403, detail="Access denied")
            
            # Download document content
            download_result = await self.storage.download_document(
                storage_url=document.storage_url,
                user_id=user_id
            )
            
            if not download_result[0]:
                raise Exception("Document download failed")
            
            # Update access log
            document.update_audit_log(
                user_id=user_id,
                action="VIEW",
                details={'access_timestamp': datetime.utcnow()}
            )
            
            # Cache result
            result = (document, download_result[1])
            self.document_cache[cache_key] = result
            
            return result
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Document retrieval failed: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Document retrieval failed: {str(e)}"
            )

    @audit_log
    async def delete_document(
        self,
        document_id: str,
        user_id: str
    ) -> bool:
        """
        Delete document with security validation and audit logging.
        
        Args:
            document_id: ID of the document to delete
            user_id: ID of the user requesting deletion
            
        Returns:
            Boolean indicating success
        """
        try:
            # Retrieve document
            document = HealthDocument.objects(id=document_id).first()
            if not document:
                raise HTTPException(status_code=404, detail="Document not found")
            
            # Validate ownership
            if document.user_id != user_id:
                raise HTTPException(status_code=403, detail="Access denied")
            
            # Delete from storage
            delete_result = await self.storage.delete_document(
                storage_url=document.storage_url,
                user_id=user_id
            )
            
            if not delete_result:
                raise Exception("Storage deletion failed")
            
            # Update document status
            document.soft_delete(
                deleted_by=user_id,
                reason="User requested deletion"
            )
            
            # Clear cache
            cache_key = f"{document_id}:{user_id}"
            self.document_cache.pop(cache_key, None)
            
            return True
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Document deletion failed: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Document deletion failed: {str(e)}"
            )

    @audit_log
    async def share_document(
        self,
        document_id: str,
        user_id: str,
        share_with: List[str]
    ) -> HealthDocument:
        """
        Share document with other users with security validation.
        
        Args:
            document_id: ID of the document to share
            user_id: ID of the user sharing document
            share_with: List of user IDs to share with
            
        Returns:
            Updated HealthDocument instance
        """
        try:
            # Validate share list
            if len(share_with) > MAX_SHARE_USERS:
                raise ValueError(f"Cannot share with more than {MAX_SHARE_USERS} users")
            
            # Retrieve document
            document = HealthDocument.objects(id=document_id).first()
            if not document:
                raise HTTPException(status_code=404, detail="Document not found")
            
            # Validate ownership
            if document.user_id != user_id:
                raise HTTPException(status_code=403, detail="Access denied")
            
            # Update shared users
            document.shared_with = list(set(document.shared_with + share_with))
            document.save()
            
            # Update audit log
            document.update_audit_log(
                user_id=user_id,
                action="SHARE",
                details={
                    'shared_with': share_with,
                    'share_timestamp': datetime.utcnow()
                }
            )
            
            return document
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Document sharing failed: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Document sharing failed: {str(e)}"
            )

def create_document_service(settings: Dict, security_config: Dict) -> DocumentService:
    """Factory function to create document service instance with security configuration."""
    try:
        # Validate security configuration
        if not security_config.get('encryption_key'):
            raise ValueError("Missing encryption configuration")
        
        # Initialize service
        return DocumentService(settings, security_config)
        
    except Exception as e:
        logger.error(f"Service creation failed: {str(e)}")
        raise