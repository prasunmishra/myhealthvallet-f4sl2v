"""
MongoDB document models for authentication and authorization in the PHRSAT system.
Implements HIPAA-compliant user authentication, role-based access control, and multi-factor authentication.

Version: 1.0.0
"""

from datetime import datetime, timedelta
import logging
from typing import Dict, List, Optional, Set

from mongoengine import fields  # mongoengine v0.24+
import bcrypt  # bcrypt v4.0+
import pyotp  # pyotp v2.8+
from cryptography.fernet import Fernet  # cryptography v39.0+

from core.db.base import BaseDocument
from core.constants import AuthProvider

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
DEFAULT_ROLES = ["user"]
SYSTEM_ROLES = ["admin", "healthcare_provider", "family_caregiver"]
PASSWORD_HASH_ROUNDS = 12
MAX_LOGIN_ATTEMPTS = 5
MFA_TIME_WINDOW = 30
TOKEN_EXPIRY_HOURS = 24
BACKUP_CODE_COUNT = 10

class User(BaseDocument):
    """HIPAA-compliant user document model with enhanced security features."""
    
    # Core user fields with encryption
    email = fields.EmailField(required=True, unique=True)
    password_hash = fields.EncryptedStringField(required=True)
    first_name = fields.EncryptedStringField(required=True)
    last_name = fields.EncryptedStringField(required=True)
    
    # Account status
    is_active = fields.BooleanField(default=True)
    is_verified = fields.BooleanField(default=False)
    
    # Multi-factor authentication
    mfa_enabled = fields.BooleanField(default=False)
    mfa_secret = fields.EncryptedStringField()
    
    # Authentication and authorization
    auth_provider = fields.EnumField(AuthProvider, default=AuthProvider.INTERNAL)
    roles = fields.ListField(fields.StringField(), default=DEFAULT_ROLES)
    
    # User preferences and settings
    preferences = fields.EncryptedDictField(default=dict)
    
    # Security tracking
    last_login = fields.DateTimeField()
    refresh_token = fields.EncryptedStringField()
    refresh_token_expires_at = fields.DateTimeField()
    login_attempts = fields.ListField(fields.DateTimeField(), default=list)
    security_events = fields.ListField(fields.DictField(), default=list)
    device_fingerprints = fields.DictField(default=dict)
    last_ip_address = fields.StringField()
    password_changed_at = fields.DateTimeField()

    meta = {
        'collection': 'users',
        'indexes': [
            'email',
            'roles',
            'auth_provider',
            'last_login',
            {'fields': ['email'], 'unique': True}
        ]
    }

    def __init__(self, **kwargs):
        """Initialize user document with enhanced security defaults."""
        super().__init__(**kwargs)
        self.password_changed_at = datetime.utcnow()
        self.security_events = []
        self.login_attempts = []
        self.device_fingerprints = {}

    def set_password(self, password: str) -> None:
        """Securely hash and set user password with audit logging."""
        salt = bcrypt.gensalt(rounds=PASSWORD_HASH_ROUNDS)
        password_hash = bcrypt.hashpw(password.encode(), salt)
        self.password_hash = password_hash.decode()
        self.password_changed_at = datetime.utcnow()
        
        self.security_events.append({
            'event': 'password_change',
            'timestamp': datetime.utcnow(),
            'ip_address': self.last_ip_address
        })

    def verify_password(self, password: str) -> bool:
        """Verify password with rate limiting and security logging."""
        # Check rate limiting
        recent_attempts = [
            attempt for attempt in self.login_attempts
            if (datetime.utcnow() - attempt).total_seconds() < 300
        ]
        if len(recent_attempts) >= MAX_LOGIN_ATTEMPTS:
            logger.warning(f"Max login attempts exceeded for user: {self.email}")
            return False

        # Verify password
        is_valid = bcrypt.checkpw(
            password.encode(),
            self.password_hash.encode()
        )
        
        # Update login attempts and security events
        self.login_attempts.append(datetime.utcnow())
        self.security_events.append({
            'event': 'password_verification',
            'timestamp': datetime.utcnow(),
            'success': is_valid,
            'ip_address': self.last_ip_address
        })
        
        self.save()
        return is_valid

    def generate_mfa_secret(self) -> Dict[str, str]:
        """Generate and store MFA secret with backup codes."""
        secret = pyotp.random_base32()
        self.mfa_secret = secret
        self.mfa_enabled = True
        
        # Generate backup codes
        backup_codes = [
            pyotp.random_base32()[:16] 
            for _ in range(BACKUP_CODE_COUNT)
        ]
        self.preferences['mfa_backup_codes'] = backup_codes
        
        # Create provisioning URI for QR code
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            self.email,
            issuer_name="PHRSAT"
        )
        
        self.security_events.append({
            'event': 'mfa_enabled',
            'timestamp': datetime.utcnow(),
            'ip_address': self.last_ip_address
        })
        
        self.save()
        return {
            'secret': secret,
            'backup_codes': backup_codes,
            'provisioning_uri': provisioning_uri
        }

    def verify_mfa_code(self, code: str) -> bool:
        """Verify MFA code with time window and backup code support."""
        if not self.mfa_enabled:
            return False
            
        # Check if code is a backup code
        backup_codes = self.preferences.get('mfa_backup_codes', [])
        if code in backup_codes:
            backup_codes.remove(code)
            self.preferences['mfa_backup_codes'] = backup_codes
            self.save()
            return True
            
        # Verify TOTP code
        totp = pyotp.TOTP(self.mfa_secret)
        is_valid = totp.verify(
            code,
            valid_window=MFA_TIME_WINDOW
        )
        
        self.security_events.append({
            'event': 'mfa_verification',
            'timestamp': datetime.utcnow(),
            'success': is_valid,
            'ip_address': self.last_ip_address
        })
        
        self.save()
        return is_valid

class Role(BaseDocument):
    """Enhanced role model for hierarchical RBAC."""
    
    name = fields.StringField(required=True, unique=True)
    description = fields.StringField(required=True)
    permissions = fields.ListField(fields.StringField(), default=list)
    is_system_role = fields.BooleanField(default=False)
    parent_roles = fields.ListField(fields.ReferenceField('Role'), default=list)
    permission_overrides = fields.DictField(default=dict)
    audit_log = fields.ListField(fields.DictField(), default=list)

    meta = {
        'collection': 'roles',
        'indexes': [
            'name',
            'is_system_role',
            {'fields': ['name'], 'unique': True}
        ]
    }

    def get_effective_permissions(self) -> Set[str]:
        """Calculate effective permissions including inheritance."""
        effective_permissions = set(self.permissions)
        
        # Add parent role permissions
        for parent_role in self.parent_roles:
            parent_permissions = parent_role.get_effective_permissions()
            effective_permissions.update(parent_permissions)
        
        # Apply permission overrides
        for permission, override in self.permission_overrides.items():
            if override is False and permission in effective_permissions:
                effective_permissions.remove(permission)
            elif override is True:
                effective_permissions.add(permission)
        
        return effective_permissions