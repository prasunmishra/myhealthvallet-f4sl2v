"""
MongoDB document models for external health platform integrations and OAuth credentials.
Implements secure storage and validation for health platform synchronization configurations.

Version: 1.0.0
"""

import os
from datetime import datetime, timezone
import json
from typing import Dict, List, Optional

from mongoengine import fields  # mongoengine v0.24+
from cryptography.fernet import Fernet  # cryptography v41.0+

from core.db.base import BaseDocument

# Supported health platforms
SUPPORTED_PLATFORMS = ["apple_health", "google_fit", "fitbit", "samsung_health"]

# Sync operation status types
SYNC_STATUS_TYPES = ["pending", "in_progress", "completed", "failed", "partial"]

# Encryption key for sensitive data
TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY")

# Platform-specific configuration requirements
PLATFORM_CONFIGS = {
    "apple_health": {
        "required_permissions": ["activity", "heart_rate"]
    },
    "google_fit": {
        "scopes": ["activity.read", "body.read"]
    }
}

class PlatformIntegration(BaseDocument):
    """
    MongoDB document model for external health platform integration configurations.
    Implements comprehensive validation and secure storage of platform settings.
    """
    
    # Core fields
    user_id = fields.StringField(required=True)
    platform_type = fields.StringField(required=True, choices=SUPPORTED_PLATFORMS)
    status = fields.StringField(default="pending", choices=SYNC_STATUS_TYPES)
    is_active = fields.BooleanField(default=True)
    
    # Timestamps
    connected_at = fields.DateTimeField(default=datetime.now(timezone.utc))
    last_sync_at = fields.DateTimeField()
    
    # Configuration and settings
    platform_config = fields.DictField(required=True)
    sync_settings = fields.DictField(default=dict)
    metadata = fields.DictField(default=dict)
    
    # Error tracking
    error_history = fields.ListField(fields.DictField(), default=list)
    sync_attempt_count = fields.IntField(default=0)
    
    meta = {
        'indexes': [
            ('user_id', 'platform_type'),
            'status'
        ],
        'collection': 'platform_integrations'
    }
    
    def __init__(self, **kwargs):
        """Initialize platform integration document with validation."""
        super().__init__(**kwargs)
        
        # Set default sync settings
        self.sync_settings.setdefault('frequency', 'daily')
        self.sync_settings.setdefault('last_successful_sync', None)
        self.sync_settings.setdefault('enabled_metrics', [])
        
        # Initialize metadata
        self.metadata.setdefault('version', '1.0.0')
        self.metadata.setdefault('created_timestamp', datetime.now(timezone.utc).isoformat())
        
        # Validate platform type
        if not self.validate_platform_type(self.platform_type):
            raise ValueError(f"Unsupported platform type: {self.platform_type}")

    def validate_platform_type(self, platform_type: str) -> bool:
        """Validate platform type against supported platforms."""
        if platform_type not in SUPPORTED_PLATFORMS:
            return False
            
        # Validate platform-specific requirements
        if platform_type in PLATFORM_CONFIGS:
            required_config = PLATFORM_CONFIGS[platform_type]
            for key, value in required_config.items():
                if key not in self.platform_config:
                    return False
                    
        return True

    def update_sync_status(self, status: str, error_message: Optional[str] = None,
                          sync_metadata: Optional[Dict] = None) -> bool:
        """Update synchronization status with error tracking."""
        if status not in SYNC_STATUS_TYPES:
            raise ValueError(f"Invalid sync status: {status}")
            
        try:
            current_time = datetime.now(timezone.utc)
            self.status = status
            self.last_sync_at = current_time
            self.sync_attempt_count += 1
            
            if error_message:
                self.error_history.append({
                    'timestamp': current_time.isoformat(),
                    'error': error_message,
                    'status': status
                })
                
            if sync_metadata:
                self.metadata['last_sync'] = sync_metadata
                
            self.save()
            return True
            
        except Exception as e:
            self.error_history.append({
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'error': str(e),
                'status': 'error'
            })
            return False

class OAuthCredential(BaseDocument):
    """
    MongoDB document model for secure OAuth credential storage.
    Implements encryption and secure token management.
    """
    
    # Core fields
    user_id = fields.StringField(required=True)
    platform_type = fields.StringField(required=True, choices=SUPPORTED_PLATFORMS)
    
    # Encrypted token fields
    access_token = fields.StringField(required=True)
    refresh_token = fields.StringField(required=True)
    token_expiry = fields.DateTimeField(required=True)
    
    # Additional fields
    token_metadata = fields.DictField(default=dict)
    scope_permissions = fields.DictField(default=dict)
    refresh_history = fields.ListField(fields.DictField(), default=list)
    refresh_count = fields.IntField(default=0)
    
    meta = {
        'indexes': [
            ('user_id', 'platform_type'),
            'token_expiry'
        ],
        'collection': 'oauth_credentials'
    }
    
    def __init__(self, **kwargs):
        """Initialize OAuth credential document with encryption."""
        # Initialize Fernet for token encryption
        self._fernet = Fernet(TOKEN_ENCRYPTION_KEY.encode())
        
        # Encrypt tokens before saving
        if 'access_token' in kwargs:
            kwargs['access_token'] = self._encrypt_token(kwargs['access_token'])
        if 'refresh_token' in kwargs:
            kwargs['refresh_token'] = self._encrypt_token(kwargs['refresh_token'])
            
        super().__init__(**kwargs)
        
        # Initialize token metadata
        self.token_metadata.setdefault('created_at', datetime.now(timezone.utc).isoformat())
        self.token_metadata.setdefault('last_refreshed', None)

    def is_token_valid(self, buffer_minutes: int = 5) -> bool:
        """Check if the access token is still valid with a time buffer."""
        if not self.token_expiry:
            return False
            
        buffer_time = datetime.now(timezone.utc) + \
                     timezone.timedelta(minutes=buffer_minutes)
        return buffer_time < self.token_expiry

    def update_tokens(self, access_token: str, refresh_token: str,
                     expiry: datetime, metadata: Optional[Dict] = None) -> bool:
        """Update OAuth tokens with encryption and audit trail."""
        try:
            current_time = datetime.now(timezone.utc)
            
            # Encrypt new tokens
            self.access_token = self._encrypt_token(access_token)
            self.refresh_token = self._encrypt_token(refresh_token)
            self.token_expiry = expiry
            
            # Update metadata
            self.token_metadata['last_refreshed'] = current_time.isoformat()
            if metadata:
                self.token_metadata.update(metadata)
                
            # Update refresh history
            self.refresh_history.append({
                'timestamp': current_time.isoformat(),
                'expiry': expiry.isoformat()
            })
            self.refresh_count += 1
            
            self.save()
            return True
            
        except Exception as e:
            self.error_history.append({
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'error': str(e),
                'operation': 'token_update'
            })
            return False

    def _encrypt_token(self, token: str) -> str:
        """Encrypt OAuth token using Fernet."""
        return self._fernet.encrypt(token.encode()).decode()

    def _decrypt_token(self, encrypted_token: str) -> str:
        """Decrypt OAuth token using Fernet."""
        return self._fernet.decrypt(encrypted_token.encode()).decode()