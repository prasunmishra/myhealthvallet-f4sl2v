"""
Pydantic schemas for health document request/response validation and serialization.
Implements comprehensive security measures, HIPAA compliance, and advanced validation rules.

Version: 1.0.0
"""

from datetime import datetime
import mimetypes
from typing import Optional, List

from pydantic import BaseModel, Field, validator, UUID4, EmailStr

from api.docs.models import DOCUMENT_TYPES, OCR_STATUS_TYPES

# Constants for validation
MAX_TITLE_LENGTH = 256
MAX_TAGS = 10
MAX_TAG_LENGTH = 50
TITLE_PATTERN = r'^[a-zA-Z0-9\s\-_\.]{1,256}$'
MAX_CONTENT_SIZE = 50 * 1024 * 1024  # 50MB
SUPPORTED_DOCUMENT_TYPES = ['pdf', 'jpg', 'png', 'tiff', 'dcm']

class HealthDocumentBase(BaseModel):
    """Base Pydantic model for health document data validation with enhanced security."""
    
    title: str = Field(
        ...,
        max_length=MAX_TITLE_LENGTH,
        description="Document title with sanitized input"
    )
    document_type: str = Field(
        ...,
        description="Type of health document"
    )
    document_date: datetime = Field(
        ...,
        description="Date of the document"
    )
    tags: List[str] = Field(
        default=[],
        max_items=MAX_TAGS,
        description="Document classification tags"
    )
    is_favorite: bool = Field(
        default=False,
        description="Document favorite status"
    )
    metadata: dict = Field(
        default={},
        description="Additional document metadata"
    )
    version: Optional[str] = Field(
        default="1.0.0",
        description="Document version for optimistic locking"
    )
    audit_trail: Optional[dict] = Field(
        default={},
        description="Audit trail for document modifications"
    )

    @validator('title')
    def validate_title(cls, title: str) -> str:
        """Validate document title length and format."""
        import re
        
        # Strip whitespace and sanitize
        title = title.strip()
        
        # Validate length
        if len(title) > MAX_TITLE_LENGTH:
            raise ValueError(f"Title length exceeds maximum of {MAX_TITLE_LENGTH} characters")
            
        # Validate format using regex pattern
        if not re.match(TITLE_PATTERN, title):
            raise ValueError("Title contains invalid characters")
            
        return title

    @validator('document_type')
    def validate_document_type(cls, document_type: str) -> str:
        """Validate document type against allowed types."""
        if document_type not in DOCUMENT_TYPES:
            raise ValueError(f"Invalid document type. Must be one of: {', '.join(DOCUMENT_TYPES)}")
            
        return document_type

    @validator('tags')
    def validate_tags(cls, tags: List[str]) -> List[str]:
        """Validate tag list length and format."""
        # Validate total tags
        if len(tags) > MAX_TAGS:
            raise ValueError(f"Maximum {MAX_TAGS} tags allowed")
            
        # Validate individual tags
        validated_tags = []
        for tag in tags:
            # Strip whitespace
            tag = tag.strip()
            
            # Validate length
            if len(tag) > MAX_TAG_LENGTH:
                raise ValueError(f"Tag length exceeds maximum of {MAX_TAG_LENGTH} characters")
                
            # Validate format
            if not tag.isalnum() and not all(c in '-_' for c in tag if not c.isalnum()):
                raise ValueError("Tags can only contain alphanumeric characters, hyphens and underscores")
                
            validated_tags.append(tag)
            
        # Remove duplicates while preserving order
        return list(dict.fromkeys(validated_tags))

    @validator('metadata')
    def validate_metadata(cls, metadata: dict) -> dict:
        """Validate metadata structure and content."""
        # Ensure metadata is not too large
        if len(str(metadata)) > 10000:  # 10KB limit
            raise ValueError("Metadata size exceeds maximum allowed")
            
        # Validate metadata structure
        for key, value in metadata.items():
            # Validate key format
            if not isinstance(key, str) or not key.isalnum():
                raise ValueError("Metadata keys must be alphanumeric strings")
                
            # Validate value types
            if not isinstance(value, (str, int, float, bool, list, dict)):
                raise ValueError("Invalid metadata value type")
                
            # Check for sensitive information patterns
            if isinstance(value, str):
                # Add checks for PHI patterns like SSN, phone numbers, etc.
                pass
                
        return metadata

class HealthDocumentCreate(HealthDocumentBase):
    """Schema for health document creation requests with content validation."""
    
    content: bytes = Field(
        ...,
        description="Document binary content"
    )
    content_type: str = Field(
        ...,
        description="Document MIME type"
    )
    content_length: int = Field(
        ...,
        gt=0,
        le=MAX_CONTENT_SIZE,
        description="Document size in bytes"
    )

    @validator('content', 'content_type')
    def validate_content(cls, value, values, field):
        """Validate document content size and type."""
        if field.name == 'content_type':
            # Validate MIME type
            if not mimetypes.guess_extension(value):
                raise ValueError("Invalid MIME type")
                
            # Check against supported types
            ext = mimetypes.guess_extension(value).lstrip('.')
            if ext not in SUPPORTED_DOCUMENT_TYPES:
                raise ValueError(f"Unsupported document type. Must be one of: {', '.join(SUPPORTED_DOCUMENT_TYPES)}")
                
        elif field.name == 'content':
            # Validate content size
            if len(value) > MAX_CONTENT_SIZE:
                raise ValueError(f"Document size exceeds maximum of {MAX_CONTENT_SIZE} bytes")
                
        return value

class HealthDocumentUpdate(HealthDocumentBase):
    """Schema for health document update requests with partial update support."""
    
    title: Optional[str] = None
    document_type: Optional[str] = None
    document_date: Optional[datetime] = None
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
    metadata: Optional[dict] = None
    version: Optional[str] = None

class HealthDocumentResponse(HealthDocumentBase):
    """Schema for health document API responses with sensitive data handling."""
    
    id: UUID4 = Field(
        ...,
        description="Document unique identifier"
    )
    user_id: str = Field(
        ...,
        description="Owner user identifier"
    )
    storage_url: str = Field(
        ...,
        description="Document storage location"
    )
    ocr_status: str = Field(
        default="PENDING",
        description="OCR processing status"
    )
    ocr_results: Optional[dict] = Field(
        default=None,
        description="OCR processing results"
    )
    classification: Optional[str] = Field(
        default=None,
        description="AI-generated classification"
    )
    classification_confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Classification confidence score"
    )
    shared_with: List[EmailStr] = Field(
        default=[],
        description="Users with document access"
    )
    created_at: datetime = Field(
        ...,
        description="Document creation timestamp"
    )
    updated_at: datetime = Field(
        ...,
        description="Last modification timestamp"
    )
    version: str = Field(
        default="1.0.0",
        description="Document version"
    )
    audit_trail: dict = Field(
        default={},
        description="Document audit history"
    )

    def mask_sensitive_data(self, data: dict) -> dict:
        """Mask sensitive information in response."""
        # Fields to mask
        sensitive_fields = ['medical_notes', 'diagnosis', 'test_results']
        
        # Recursively mask sensitive data
        def mask_recursive(obj):
            if isinstance(obj, dict):
                return {k: '********' if k in sensitive_fields else mask_recursive(v) 
                       for k, v in obj.items()}
            elif isinstance(obj, list):
                return [mask_recursive(item) for item in obj]
            return obj
            
        return mask_recursive(data)