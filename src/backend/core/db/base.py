"""
Core database module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides base document class and common database functionality for MongoDB document models
with enhanced security features and performance optimizations.

Version: 1.0.0
"""

from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional

from mongoengine import Document, fields, signals  # mongoengine v0.24+
from core.config import Settings
from core.security import SecurityManager

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
DATETIME_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"
ENCRYPTION_ALGORITHM = "AES-256-GCM"
AUDIT_LOG_LEVELS = {"INFO": 1, "WARNING": 2, "ERROR": 3}

def format_timestamp(timestamp: datetime, timezone_name: str = 'UTC') -> str:
    """Format datetime object to ISO format string with timezone handling."""
    if not isinstance(timestamp, datetime):
        raise ValueError("Invalid timestamp format")
    
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    
    return timestamp.isoformat()

class BaseDocument(Document):
    """
    Enhanced base document class for all MongoDB models providing common functionality
    with security features and audit logging capabilities.
    """
    
    # Common fields for all documents
    created_at = fields.DateTimeField(required=True)
    updated_at = fields.DateTimeField(required=True)
    created_by = fields.StringField(required=True)
    updated_by = fields.StringField(required=True)
    is_deleted = fields.BooleanField(default=False)
    metadata = fields.DictField(default=dict)
    encrypted_fields = fields.ListField(fields.StringField(), default=list)
    audit_log = fields.DictField(default=dict)
    index_config = fields.DictField(default=dict)

    meta = {
        'abstract': True,
        'indexes': [
            'created_at',
            'updated_at',
            'created_by',
            'is_deleted'
        ],
        'ordering': ['-created_at']
    }

    def __init__(self, *args, **kwargs):
        """Initialize base document with enhanced security and monitoring features."""
        encryption_config = kwargs.pop('encryption_config', {})
        super().__init__(*args, **kwargs)
        
        # Initialize security manager
        settings = Settings()
        self._security_manager = SecurityManager(settings)
        
        # Set default values for timestamps
        current_time = datetime.now(timezone.utc)
        if not self.created_at:
            self.created_at = current_time
        if not self.updated_at:
            self.updated_at = current_time
            
        # Initialize metadata
        self.metadata.setdefault('version', '1.0.0')
        self.metadata.setdefault('encryption_algorithm', ENCRYPTION_ALGORITHM)
        
        # Configure encrypted fields
        self.encrypted_fields.extend(encryption_config.get('encrypted_fields', []))
        
        # Initialize audit log
        self.audit_log.setdefault('events', [])
        self.audit_log.setdefault('last_modified', format_timestamp(current_time))

    def save(self, encrypt: bool = True, **kwargs) -> 'BaseDocument':
        """Enhanced save method with encryption and audit logging."""
        # Update timestamps
        current_time = datetime.now(timezone.utc)
        self.updated_at = current_time
        
        # Encrypt sensitive fields if specified
        if encrypt:
            for field_name in self.encrypted_fields:
                if hasattr(self, field_name) and getattr(self, field_name):
                    encrypted_value = self.encrypt_field(field_name, getattr(self, field_name))
                    setattr(self, field_name, encrypted_value)
        
        # Update metadata
        self.metadata['last_modified'] = format_timestamp(current_time)
        
        # Log audit trail
        self.audit_log['events'].append({
            'action': 'save',
            'timestamp': format_timestamp(current_time),
            'user': self.updated_by,
            'changes': kwargs.get('changes', {})
        })
        
        try:
            return super().save(**kwargs)
        except Exception as e:
            logger.error(f"Error saving document: {str(e)}")
            raise

    def to_dict(self, mask_sensitive: bool = True) -> Dict[str, Any]:
        """Convert document to dictionary with optional field masking."""
        data = json.loads(self.to_json())
        
        # Format timestamps
        data['created_at'] = format_timestamp(self.created_at)
        data['updated_at'] = format_timestamp(self.updated_at)
        
        # Mask sensitive fields if specified
        if mask_sensitive:
            for field_name in self.encrypted_fields:
                if field_name in data:
                    data[field_name] = '********'
        
        # Include metadata and audit log
        data['metadata'] = self.metadata
        data['audit_log'] = self.audit_log
        
        return data

    def soft_delete(self, deleted_by: str, reason: str) -> bool:
        """Secure soft delete with audit logging."""
        try:
            current_time = datetime.now(timezone.utc)
            self.is_deleted = True
            self.updated_at = current_time
            self.updated_by = deleted_by
            
            # Log deletion in audit trail
            self.audit_log['events'].append({
                'action': 'soft_delete',
                'timestamp': format_timestamp(current_time),
                'user': deleted_by,
                'reason': reason
            })
            
            self.save(encrypt=False)
            return True
        except Exception as e:
            logger.error(f"Error performing soft delete: {str(e)}")
            return False

    def encrypt_field(self, field_name: str, value: Any) -> str:
        """Encrypt specific field value."""
        if field_name not in self.encrypted_fields:
            raise ValueError(f"Field {field_name} is not configured for encryption")
            
        try:
            # Convert value to string if necessary
            if not isinstance(value, str):
                value = str(value)
                
            encrypted_value = self._security_manager.encrypt_phi(value)
            
            # Log encryption operation
            self.audit_log['events'].append({
                'action': 'field_encryption',
                'timestamp': format_timestamp(datetime.now(timezone.utc)),
                'field': field_name
            })
            
            return encrypted_value
        except Exception as e:
            logger.error(f"Error encrypting field {field_name}: {str(e)}")
            raise

    @classmethod
    def pre_save(cls, sender, document, **kwargs):
        """Pre-save signal handler for validation and processing."""
        if not document.created_by or not document.updated_by:
            raise ValueError("created_by and updated_by fields are required")

# Connect signals
signals.pre_save.connect(BaseDocument.pre_save, sender=BaseDocument)

__all__ = ['BaseDocument', 'format_timestamp']