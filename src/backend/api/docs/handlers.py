"""
HIPAA-compliant request handlers for health document management operations.
Implements secure document processing with comprehensive audit logging and error handling.

Version: 1.0.0
"""

import logging
from typing import Dict, Optional, Tuple
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException, status
from asgi_correlation_id import correlation_id

from api.docs.services import DocumentService
from core.security import SecurityManager
from core.logging import setup_logging
from hipaa_audit_logger import AuditLogger
from rate_limiter import RateLimiter

# Configure logging
logger = setup_logging()

# Constants
MAX_SHARE_USERS = 10
RATE_LIMIT_REQUESTS = 100
RATE_LIMIT_PERIOD = 3600  # 1 hour

class DocumentHandler:
    """HIPAA-compliant handler class for processing document-related requests."""

    def __init__(
        self,
        document_service: DocumentService,
        security_manager: SecurityManager,
        audit_logger: AuditLogger,
        rate_limiter: RateLimiter
    ):
        """Initialize document handler with required services and security components."""
        self._document_service = document_service
        self._security_manager = security_manager
        self._audit_logger = audit_logger
        self._rate_limiter = rate_limiter
        
        logger.info("Document handler initialized with security configuration")

    async def handle_create_document(
        self,
        document_data: Dict,
        user_id: str,
        correlation_id: str
    ) -> Dict:
        """
        Handle secure document creation with HIPAA compliance.
        
        Args:
            document_data: Document creation request data
            user_id: ID of the requesting user
            correlation_id: Request correlation ID for tracking
            
        Returns:
            Created document response with security headers
        """
        try:
            # Check rate limits
            if not await self._rate_limiter.check_limit(user_id, RATE_LIMIT_REQUESTS, RATE_LIMIT_PERIOD):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded"
                )

            # Validate document data
            if not document_data.get('content'):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Document content is required"
                )

            # Verify user permissions
            if not await self._security_manager.verify_user_permissions(user_id, "document:create"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions"
                )

            # Create audit context
            audit_context = {
                'user_id': user_id,
                'correlation_id': correlation_id,
                'action': 'CREATE_DOCUMENT',
                'timestamp': datetime.now(timezone.utc).isoformat()
            }

            # Process document creation
            document = await self._document_service.upload_document(
                document_content=document_data['content'],
                document_type=document_data.get('document_type', 'medical_record'),
                user_id=user_id,
                title=document_data.get('title', ''),
                tags=document_data.get('tags', []),
                security_metadata={
                    'correlation_id': correlation_id,
                    'encryption_required': True,
                    'phi_detection': True
                }
            )

            # Log audit trail
            await self._audit_logger.log_event(
                event_type="DOCUMENT_CREATION",
                user_id=user_id,
                details={
                    'document_id': str(document.id),
                    'document_type': document.document_type,
                    'correlation_id': correlation_id
                }
            )

            return {
                'status': 'success',
                'document_id': str(document.id),
                'storage_url': document.storage_url,
                'metadata': {
                    'created_at': document.created_at.isoformat(),
                    'document_type': document.document_type,
                    'processing_status': document.ocr_status
                }
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Document creation failed: {str(e)}",
                extra={'correlation_id': correlation_id}
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Document creation failed"
            )

    async def handle_get_document(
        self,
        document_id: str,
        user_id: str,
        correlation_id: str
    ) -> Dict:
        """Handle secure document retrieval with access validation."""
        try:
            # Check rate limits
            if not await self._rate_limiter.check_limit(user_id, RATE_LIMIT_REQUESTS, RATE_LIMIT_PERIOD):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded"
                )

            # Retrieve document
            document, content = await self._document_service.get_document(
                document_id=document_id,
                user_id=user_id
            )

            # Log access
            await self._audit_logger.log_event(
                event_type="DOCUMENT_ACCESS",
                user_id=user_id,
                details={
                    'document_id': document_id,
                    'correlation_id': correlation_id,
                    'access_type': 'VIEW'
                }
            )

            return {
                'document': document.to_dict(),
                'content': content,
                'metadata': {
                    'accessed_at': datetime.now(timezone.utc).isoformat(),
                    'correlation_id': correlation_id
                }
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Document retrieval failed: {str(e)}",
                extra={'correlation_id': correlation_id}
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Document retrieval failed"
            )

    async def handle_update_document(
        self,
        document_id: str,
        update_data: Dict,
        user_id: str,
        correlation_id: str
    ) -> Dict:
        """Handle secure document updates with validation."""
        try:
            # Verify user permissions
            if not await self._security_manager.verify_user_permissions(user_id, "document:update"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions"
                )

            # Update document
            document = await self._document_service.update_document(
                document_id=document_id,
                user_id=user_id,
                update_data=update_data
            )

            # Log update
            await self._audit_logger.log_event(
                event_type="DOCUMENT_UPDATE",
                user_id=user_id,
                details={
                    'document_id': document_id,
                    'correlation_id': correlation_id,
                    'updates': update_data
                }
            )

            return {
                'status': 'success',
                'document': document.to_dict(),
                'metadata': {
                    'updated_at': document.updated_at.isoformat(),
                    'correlation_id': correlation_id
                }
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Document update failed: {str(e)}",
                extra={'correlation_id': correlation_id}
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Document update failed"
            )

    async def handle_delete_document(
        self,
        document_id: str,
        user_id: str,
        correlation_id: str
    ) -> Dict:
        """Handle secure document deletion with audit logging."""
        try:
            # Verify user permissions
            if not await self._security_manager.verify_user_permissions(user_id, "document:delete"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions"
                )

            # Delete document
            success = await self._document_service.delete_document(
                document_id=document_id,
                user_id=user_id
            )

            if success:
                # Log deletion
                await self._audit_logger.log_event(
                    event_type="DOCUMENT_DELETION",
                    user_id=user_id,
                    details={
                        'document_id': document_id,
                        'correlation_id': correlation_id
                    }
                )

                return {
                    'status': 'success',
                    'message': 'Document deleted successfully',
                    'metadata': {
                        'deleted_at': datetime.now(timezone.utc).isoformat(),
                        'correlation_id': correlation_id
                    }
                }
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Document deletion failed"
                )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Document deletion failed: {str(e)}",
                extra={'correlation_id': correlation_id}
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Document deletion failed"
            )

    async def handle_share_document(
        self,
        document_id: str,
        share_with: list,
        user_id: str,
        correlation_id: str
    ) -> Dict:
        """Handle secure document sharing with access control."""
        try:
            # Validate share list
            if len(share_with) > MAX_SHARE_USERS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot share with more than {MAX_SHARE_USERS} users"
                )

            # Share document
            document = await self._document_service.share_document(
                document_id=document_id,
                user_id=user_id,
                share_with=share_with
            )

            # Log sharing
            await self._audit_logger.log_event(
                event_type="DOCUMENT_SHARE",
                user_id=user_id,
                details={
                    'document_id': document_id,
                    'shared_with': share_with,
                    'correlation_id': correlation_id
                }
            )

            return {
                'status': 'success',
                'document': document.to_dict(),
                'metadata': {
                    'shared_at': datetime.now(timezone.utc).isoformat(),
                    'correlation_id': correlation_id
                }
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Document sharing failed: {str(e)}",
                extra={'correlation_id': correlation_id}
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Document sharing failed"
            )

def create_document_handler(
    document_service: DocumentService,
    security_manager: SecurityManager,
    audit_logger: AuditLogger,
    rate_limiter: RateLimiter
) -> DocumentHandler:
    """Factory function to create secure document handler instance."""
    try:
        return DocumentHandler(
            document_service=document_service,
            security_manager=security_manager,
            audit_logger=audit_logger,
            rate_limiter=rate_limiter
        )
    except Exception as e:
        logger.error(f"Handler creation failed: {str(e)}")
        raise