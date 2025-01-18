"""
Pydantic schemas for secure notification data validation and serialization.
Implements comprehensive validation for notification content with enhanced security features.

Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, Optional, Any, List
from uuid import UUID

from pydantic import BaseModel, Field, validator, root_validator

from api.notifications.models import (
    NOTIFICATION_TYPES,
    NOTIFICATION_PRIORITIES,
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES
)

class NotificationContentSchema(BaseModel):
    """Schema for secure notification content validation with enhanced security features."""
    
    title: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Notification title with length validation"
    )
    
    body: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Notification body content with length validation"
    )
    
    data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional structured data for the notification"
    )
    
    language: str = Field(
        default=DEFAULT_LANGUAGE,
        description="Language code for the notification content"
    )
    
    contains_phi: bool = Field(
        default=False,
        description="Indicates if content contains Protected Health Information"
    )
    
    encryption_status: Optional[str] = Field(
        default=None,
        description="Current encryption status of the notification content"
    )

    @validator("language")
    def validate_language(cls, value: str) -> str:
        """Validate language code with security checks."""
        # Sanitize and validate language code
        value = value.lower().strip()
        
        if value not in SUPPORTED_LANGUAGES:
            return DEFAULT_LANGUAGE
            
        return value

    @validator("data")
    def validate_data(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        """Validate notification data with security checks."""
        if not value:
            return {}
            
        # Remove any potentially harmful keys
        sanitized_data = {}
        for key, val in value.items():
            # Sanitize keys to prevent injection
            safe_key = str(key).strip().replace(".", "_")[:50]
            
            # Basic value validation and sanitization
            if isinstance(val, (str, int, float, bool)):
                sanitized_data[safe_key] = val
            elif isinstance(val, (list, dict)):
                # Convert complex types to string representation
                sanitized_data[safe_key] = str(val)
            else:
                continue
                
        return sanitized_data

    class Config:
        """Pydantic model configuration."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }
        extra = "forbid"  # Prevent additional fields

class NotificationCreateSchema(BaseModel):
    """Schema for creating new notifications with security validation."""
    
    user_id: UUID = Field(
        ...,
        description="UUID of the target user"
    )
    
    type: str = Field(
        ...,
        description="Type of notification"
    )
    
    priority: str = Field(
        ...,
        description="Priority level of notification"
    )
    
    content: NotificationContentSchema = Field(
        ...,
        description="Notification content with validation"
    )
    
    scheduled_at: Optional[datetime] = Field(
        default=None,
        description="Optional scheduled delivery time"
    )
    
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Additional metadata for the notification"
    )
    
    requires_encryption: Optional[bool] = Field(
        default=False,
        description="Indicates if content requires encryption"
    )

    @validator("type")
    def validate_type(cls, value: str) -> str:
        """Validate notification type with security checks."""
        value = value.lower().strip()
        
        if value not in NOTIFICATION_TYPES:
            raise ValueError(f"Invalid notification type: {value}")
            
        return value

    @validator("priority")
    def validate_priority(cls, value: str) -> str:
        """Validate notification priority with security checks."""
        value = value.lower().strip()
        
        if value not in NOTIFICATION_PRIORITIES:
            raise ValueError(f"Invalid notification priority: {value}")
            
        return value

    @validator("metadata")
    def validate_metadata(cls, value: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate metadata with security checks."""
        if not value:
            return {}
            
        # Sanitize metadata fields
        sanitized_metadata = {}
        for key, val in value.items():
            # Sanitize keys
            safe_key = str(key).strip().replace(".", "_")[:50]
            
            # Validate and sanitize values
            if isinstance(val, (str, int, float, bool)):
                sanitized_metadata[safe_key] = val
            elif isinstance(val, (list, dict)):
                sanitized_metadata[safe_key] = str(val)
            else:
                continue
                
        return sanitized_metadata

    @root_validator
    def validate_encryption_requirements(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """Validate encryption requirements based on content."""
        content = values.get("content")
        requires_encryption = values.get("requires_encryption")
        
        if content and content.contains_phi and not requires_encryption:
            values["requires_encryption"] = True
            
        return values

    class Config:
        """Pydantic model configuration."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }
        extra = "forbid"  # Prevent additional fields