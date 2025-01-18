"""
Pydantic schemas for authentication and authorization request/response validation in the PHRSAT system.
Implements HIPAA-compliant validation rules and secure data handling.

Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, EmailStr, constr, SecretStr, validator  # pydantic v2.0+

from core.constants import AuthProvider
from models import User

# Global constants
PASSWORD_MIN_LENGTH = 12
PASSWORD_REGEX = r'^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{12,}$'
MAX_LOGIN_ATTEMPTS = 5
TOKEN_EXPIRY_MINUTES = 60
REFRESH_TOKEN_EXPIRY_DAYS = 30
ALLOWED_BIOMETRIC_TYPES = ['FINGERPRINT', 'FACE_ID', 'IRIS']

class UserBase(BaseModel):
    """Base schema for user data with HIPAA-compliant field validation."""
    
    email: EmailStr = Field(..., description="User's email address")
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    preferences: Dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        frozen = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class UserCreate(UserBase):
    """Schema for user registration with strong password validation."""
    
    password: SecretStr = Field(..., min_length=PASSWORD_MIN_LENGTH)
    auth_provider: AuthProvider = Field(default=AuthProvider.INTERNAL)
    device_id: str = Field(..., min_length=8)
    device_metadata: Dict = Field(default_factory=dict)
    accept_terms: bool = Field(...)
    accept_privacy_policy: bool = Field(...)

    @validator('password')
    def validate_password(cls, value: SecretStr) -> SecretStr:
        """Validate password complexity requirements."""
        password = value.get_secret_value()
        if not any(c.isupper() for c in password):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in password):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in password):
            raise ValueError("Password must contain at least one number")
        if not any(c in '@$!%*#?&' for c in password):
            raise ValueError("Password must contain at least one special character")
        return value

    @validator('accept_terms', 'accept_privacy_policy')
    def validate_acceptance(cls, value: bool) -> bool:
        """Validate terms and privacy policy acceptance."""
        if not value:
            raise ValueError("Terms and Privacy Policy must be accepted")
        return value

class UserLogin(BaseModel):
    """Schema for user login with rate limiting metadata."""
    
    email: EmailStr
    password: SecretStr
    device_fingerprint: str = Field(..., min_length=8)
    location_data: Dict = Field(default_factory=dict)
    client_version: str = Field(...)
    security_metadata: Dict = Field(default_factory=dict)

    class Config:
        frozen = True

class TokenResponse(BaseModel):
    """Schema for authentication token response with enhanced security."""
    
    access_token: str = Field(..., min_length=32)
    refresh_token: str = Field(..., min_length=32)
    token_type: str = Field(default="bearer")
    expires_in: int = Field(default=TOKEN_EXPIRY_MINUTES * 60)
    scope: List[str] = Field(default_factory=list)
    session_data: Dict = Field(default_factory=dict)

    class Config:
        frozen = True

class BiometricAuth(BaseModel):
    """Schema for biometric authentication data."""
    
    biometric_type: str = Field(..., regex=f"^({'|'.join(ALLOWED_BIOMETRIC_TYPES)})$")
    device_id: str = Field(..., min_length=8)
    signature: str = Field(..., min_length=32)
    auth_metadata: Dict = Field(default_factory=dict)

    class Config:
        frozen = True

    @validator('biometric_type')
    def validate_biometric_type(cls, value: str) -> str:
        """Validate biometric type is supported."""
        if value not in ALLOWED_BIOMETRIC_TYPES:
            raise ValueError(f"Unsupported biometric type. Allowed types: {ALLOWED_BIOMETRIC_TYPES}")
        return value

class SocialAuth(BaseModel):
    """Schema for social authentication validation."""
    
    provider: AuthProvider = Field(...)
    access_token: str = Field(..., min_length=20)
    user_info: Dict = Field(default_factory=dict)
    scope_data: Dict = Field(default_factory=dict)

    class Config:
        frozen = True

    @validator('provider')
    def validate_provider(cls, value: AuthProvider) -> AuthProvider:
        """Validate authentication provider is supported."""
        if value == AuthProvider.INTERNAL:
            raise ValueError("Invalid authentication provider for social auth")
        return value

class MFASetup(BaseModel):
    """Schema for multi-factor authentication setup."""
    
    mfa_type: str = Field(default="TOTP")
    backup_codes: List[str] = Field(default_factory=list)
    qr_code: Optional[str] = None
    secret: Optional[SecretStr] = None

    class Config:
        frozen = True

class MFAVerify(BaseModel):
    """Schema for multi-factor authentication verification."""
    
    code: str = Field(..., min_length=6, max_length=6)
    device_id: str = Field(..., min_length=8)
    verification_metadata: Dict = Field(default_factory=dict)

    class Config:
        frozen = True

class PasswordReset(BaseModel):
    """Schema for password reset requests."""
    
    email: EmailStr
    reset_token: Optional[str] = None
    new_password: Optional[SecretStr] = None
    security_questions: Optional[Dict] = None

    class Config:
        frozen = True

    @validator('new_password')
    def validate_new_password(cls, value: Optional[SecretStr]) -> Optional[SecretStr]:
        """Validate new password complexity if provided."""
        if value:
            password = value.get_secret_value()
            if len(password) < PASSWORD_MIN_LENGTH:
                raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
            if not any(c.isupper() for c in password):
                raise ValueError("Password must contain at least one uppercase letter")
            if not any(c.islower() for c in password):
                raise ValueError("Password must contain at least one lowercase letter")
            if not any(c.isdigit() for c in password):
                raise ValueError("Password must contain at least one number")
            if not any(c in '@$!%*#?&' for c in password):
                raise ValueError("Password must contain at least one special character")
        return value