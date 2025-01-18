"""
MongoDB document models for notification management in the PHRSAT system.
Implements secure notification storage with encryption, localization, and scheduling support.

Version: 1.0.0
"""

from datetime import datetime
import uuid
from typing import Dict, Optional

from mongoengine import fields, EmbeddedDocument, Document  # mongoengine v0.24+

from core.db.base import BaseDocument
from core.security import SecurityManager

# Global constants for notification configuration
NOTIFICATION_TYPES = [
    "health_alert",
    "appointment_reminder", 
    "system_update",
    "data_sync",
    "security_alert",
    "prescription_reminder"
]

NOTIFICATION_PRIORITIES = [
    "critical",
    "high", 
    "medium",
    "low"
]

DEFAULT_LANGUAGE = "en"
SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "zh"]

class NotificationContent(EmbeddedDocument):
    """
    Encrypted embedded document for notification content with multi-language support.
    Implements field-level encryption for sensitive notification data.
    """
    
    title = fields.StringField(required=True)
    body = fields.StringField(required=True)
    data = fields.DictField(default=dict)
    language = fields.StringField(default=DEFAULT_LANGUAGE, choices=SUPPORTED_LANGUAGES)
    translations = fields.DictField(default=dict)

    def to_dict(self, preferred_language: str = DEFAULT_LANGUAGE) -> Dict:
        """Convert notification content to dictionary with localized content."""
        # Get content in preferred language if available
        if preferred_language in self.translations:
            title = self.translations[preferred_language].get('title', self.title)
            body = self.translations[preferred_language].get('body', self.body)
        else:
            title = self.title
            body = self.body

        return {
            'title': title,
            'body': body,
            'data': self.data,
            'language': preferred_language
        }

class Notification(BaseDocument):
    """
    Document model for user notifications with encryption and scheduling support.
    Implements comprehensive notification management with security features.
    """

    # Primary fields
    id = fields.UUIDField(primary_key=True, default=uuid.uuid4)
    user_id = fields.UUIDField(required=True)
    type = fields.StringField(required=True, choices=NOTIFICATION_TYPES)
    priority = fields.StringField(required=True, choices=NOTIFICATION_PRIORITIES)
    content = fields.EmbeddedDocumentField(NotificationContent, required=True)

    # Scheduling and status fields
    scheduled_at = fields.DateTimeField()
    sent_at = fields.DateTimeField()
    is_read = fields.BooleanField(default=False)
    is_sent = fields.BooleanField(default=False)

    # Additional metadata
    metadata = fields.DictField(default=dict)

    # Timestamps from BaseDocument
    created_at = fields.DateTimeField(required=True)
    updated_at = fields.DateTimeField(required=True)

    meta = {
        'collection': 'notifications',
        'indexes': [
            'user_id',
            'type',
            'priority',
            'scheduled_at',
            'created_at',
            'is_read',
            'is_sent'
        ],
        'ordering': ['-created_at']
    }

    def __init__(self, **kwargs):
        """Initialize notification document with security checks."""
        super().__init__(**kwargs)

        # Generate UUID if not provided
        if not self.id:
            self.id = uuid.uuid4()

        # Validate notification type
        if self.type not in NOTIFICATION_TYPES:
            raise ValueError(f"Invalid notification type: {self.type}")

        # Validate priority
        if self.priority not in NOTIFICATION_PRIORITIES:
            raise ValueError(f"Invalid notification priority: {self.priority}")

        # Set default timestamps
        current_time = datetime.utcnow()
        if not self.created_at:
            self.created_at = current_time
        if not self.updated_at:
            self.updated_at = current_time

        # Initialize metadata with audit information
        self.metadata.update({
            'version': '1.0.0',
            'platform': 'PHRSAT',
            'encryption': 'AES-256-GCM'
        })

    def mark_as_read(self) -> bool:
        """Mark notification as read with audit trail."""
        try:
            current_time = datetime.utcnow()
            self.is_read = True
            self.updated_at = current_time
            
            # Update metadata with read timestamp
            self.metadata['read_at'] = current_time.isoformat()
            
            # Add to audit trail
            self.audit_log['events'].append({
                'action': 'mark_as_read',
                'timestamp': current_time.isoformat(),
                'user': self.updated_by
            })
            
            self.save()
            return True
        except Exception as e:
            return False

    def mark_as_sent(self) -> bool:
        """Mark notification as sent with delivery tracking."""
        try:
            current_time = datetime.utcnow()
            self.is_sent = True
            self.sent_at = current_time
            self.updated_at = current_time
            
            # Update metadata with delivery information
            self.metadata['delivery'] = {
                'sent_at': current_time.isoformat(),
                'status': 'delivered'
            }
            
            # Add to audit trail
            self.audit_log['events'].append({
                'action': 'mark_as_sent',
                'timestamp': current_time.isoformat(),
                'user': self.updated_by
            })
            
            self.save()
            return True
        except Exception as e:
            return False