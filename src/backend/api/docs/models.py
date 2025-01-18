"""
MongoDB document models for health records and documents with enhanced security features.
Implements HIPAA-compliant storage with field-level encryption and OCR support.

Version: 1.0.0
"""

from datetime import datetime, timezone
import uuid
from typing import Dict, List, Optional

from mongoengine import fields, ValidationError  # mongoengine v0.24+
from cryptography.fernet import Fernet  # cryptography v3.4+

from core.db.base import BaseDocument
from core.security import SecurityManager
from core.config import Settings

# Document type constants
DOCUMENT_TYPES = [
    "LAB_REPORT",
    "PRESCRIPTION", 
    "IMAGING",
    "CLINICAL_NOTES",
    "VACCINATION",
    "INSURANCE",
    "OTHER"
]

# OCR processing status types
OCR_STATUS_TYPES = [
    "PENDING",
    "PROCESSING", 
    "COMPLETED",
    "FAILED"
]

# Configuration constants
MAX_TAGS = 10
CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.85

class HealthDocument(BaseDocument):
    """
    Enhanced MongoDB document model for health records with field-level encryption 
    and HIPAA compliance features.
    """
    
    # Primary fields
    id = fields.UUIDField(primary_key=True, default=uuid.uuid4)
    user_id = fields.StringField(required=True, index=True)
    title = fields.StringField(required=True, max_length=200)
    document_type = fields.StringField(required=True, choices=DOCUMENT_TYPES)
    document_date = fields.DateTimeField(required=True)
    tags = fields.ListField(fields.StringField(max_length=50), max_length=MAX_TAGS)
    
    # Storage and content fields
    storage_url = fields.StringField(required=True)
    encrypted_content = fields.BinaryField()
    encrypted_metadata = fields.DictField()
    
    # OCR and classification fields
    ocr_status = fields.StringField(choices=OCR_STATUS_TYPES, default="PENDING")
    ocr_results = fields.DictField()
    classification = fields.StringField()
    classification_confidence = fields.FloatField(min_value=0.0, max_value=1.0)
    
    # Access control fields
    is_favorite = fields.BooleanField(default=False)
    shared_with = fields.ListField(fields.StringField())
    access_log = fields.DictField()
    
    # Audit trail fields
    created_at = fields.DateTimeField(default=datetime.now(timezone.utc))
    updated_at = fields.DateTimeField(default=datetime.now(timezone.utc))
    created_by = fields.StringField(required=True)
    updated_by = fields.StringField(required=True)

    meta = {
        'collection': 'health_documents',
        'indexes': [
            'user_id',
            'document_type',
            'document_date',
            'tags',
            'classification',
            ('user_id', 'document_type'),
            ('user_id', 'document_date')
        ],
        'ordering': ['-document_date']
    }

    def __init__(self, **kwargs):
        """Initialize health document with enhanced security features."""
        super().__init__(**kwargs)
        
        # Initialize security manager
        settings = Settings()
        self._security_manager = SecurityManager(settings)
        
        # Set default values
        if not self.id:
            self.id = uuid.uuid4()
        if not self.ocr_status:
            self.ocr_status = "PENDING"
        if not self.tags:
            self.tags = []
        if not self.shared_with:
            self.shared_with = []
        if not self.access_log:
            self.access_log = {
                'views': [],
                'modifications': [],
                'shares': []
            }

    def validate_document_type(self, document_type: str) -> bool:
        """Validate document type against allowed types."""
        if document_type not in DOCUMENT_TYPES:
            raise ValidationError(f"Invalid document type: {document_type}")
            
        # Additional business rule validations
        if document_type == "IMAGING" and not self.storage_url.endswith(('.jpg', '.png', '.dcm')):
            raise ValidationError("Invalid file format for imaging document")
            
        return True

    def encrypt_sensitive_data(self, data: Dict) -> Dict:
        """Encrypt sensitive PHI fields."""
        try:
            sensitive_fields = ['medical_notes', 'diagnosis', 'test_results']
            encrypted_data = {}
            
            for field, value in data.items():
                if field in sensitive_fields and value:
                    encrypted_value = self._security_manager.encrypt_phi(str(value))
                    encrypted_data[field] = encrypted_value
                else:
                    encrypted_data[field] = value
                    
            # Update encryption metadata
            self.encrypted_metadata.update({
                'encryption_date': datetime.now(timezone.utc).isoformat(),
                'encrypted_fields': sensitive_fields
            })
            
            return encrypted_data
            
        except Exception as e:
            raise ValidationError(f"Encryption failed: {str(e)}")

    def update_access_log(self, user_id: str, action_type: str, details: Dict) -> bool:
        """Log document access and modifications."""
        try:
            timestamp = datetime.now(timezone.utc)
            log_entry = {
                'user_id': user_id,
                'timestamp': timestamp.isoformat(),
                'action': action_type,
                'details': details
            }
            
            # Add entry to appropriate log type
            if action_type == 'view':
                self.access_log['views'].append(log_entry)
            elif action_type == 'modify':
                self.access_log['modifications'].append(log_entry)
            elif action_type == 'share':
                self.access_log['shares'].append(log_entry)
                
            self.updated_at = timestamp
            self.updated_by = user_id
            self.save()
            
            return True
            
        except Exception as e:
            return False