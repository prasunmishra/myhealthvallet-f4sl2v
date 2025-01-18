"""
Core security module for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements cryptographic operations, password hashing, and security utilities
with enhanced key rotation and monitoring capabilities.

Version: 1.0.0
"""

import base64
import logging
import re
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, Optional, Tuple

from cryptography.fernet import Fernet  # cryptography v41.0+
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # cryptography v41.0+
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from passlib.context import CryptContext  # passlib v1.7+
import secrets

from core.config import Settings

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
ALGORITHM = "HS256"
NONCE_SIZE = 12
TOKEN_LENGTH = 32
MIN_PASSWORD_LENGTH = 12
KEY_ROTATION_DAYS = 90
MAX_KEY_VERSIONS = 3

# Initialize password context with bcrypt
PWD_CONTEXT = CryptContext(
    schemes=["bcrypt"],
    default="bcrypt",
    bcrypt__rounds=12,
    deprecated="auto"
)

def rate_limit(max_attempts: int = 5, window_seconds: int = 300):
    """Decorator for rate limiting password verification attempts."""
    def decorator(func):
        attempts: Dict[str, Tuple[int, datetime]] = {}
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = f"{args[0]}:{args[1][:8]}"  # Hash of password attempt
            now = datetime.utcnow()
            
            if key in attempts:
                count, start_time = attempts[key]
                if (now - start_time).total_seconds() > window_seconds:
                    attempts[key] = (1, now)
                elif count >= max_attempts:
                    logger.warning(f"Rate limit exceeded for password verification: {key}")
                    return False
                else:
                    attempts[key] = (count + 1, start_time)
            else:
                attempts[key] = (1, now)
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

class SecurityManager:
    """Enhanced manager class for cryptographic operations and security utilities."""
    
    def __init__(self, settings: Settings):
        """Initialize security manager with encryption keys and versioning."""
        self._settings = settings
        self._key_versions: Dict[int, bytes] = {}
        self._current_key_version = 1
        self._last_rotation = datetime.utcnow()
        
        # Generate initial encryption keys
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"phrsat_secure_salt",  # Fixed salt for deterministic key derivation
            iterations=100000,
        )
        base_key = kdf.derive(settings.SECRET_KEY.encode())
        
        # Initialize encryption instances
        self._encryption_key = base_key
        self._key_versions[self._current_key_version] = base_key
        self._fernet = Fernet(base64.urlsafe_b64encode(base_key))
        self._aes_gcm = AESGCM(base_key)
        
        logger.info("SecurityManager initialized with encryption keys")

    def encrypt_phi(self, data: str, validate_entropy: bool = True) -> bytes:
        """Encrypt protected health information using AES-GCM with key versioning."""
        if not data:
            raise ValueError("Data cannot be empty")
            
        if validate_entropy and len(data) < 8:
            raise ValueError("Data length insufficient for secure encryption")
            
        try:
            # Generate random nonce
            nonce = secrets.token_bytes(NONCE_SIZE)
            
            # Encrypt data using current key version
            ciphertext = self._aes_gcm.encrypt(
                nonce,
                data.encode(),
                associated_data=None
            )
            
            # Combine version, nonce and ciphertext
            version_bytes = self._current_key_version.to_bytes(2, byteorder='big')
            encrypted_data = version_bytes + nonce + ciphertext
            
            logger.debug(f"Data encrypted successfully with key version {self._current_key_version}")
            return encrypted_data
            
        except Exception as e:
            logger.error(f"Encryption failed: {str(e)}")
            raise RuntimeError("Encryption failed") from e

    def decrypt_phi(self, encrypted_data: bytes) -> str:
        """Decrypt protected health information using AES-GCM with version support."""
        if len(encrypted_data) < NONCE_SIZE + 3:
            raise ValueError("Invalid encrypted data format")
            
        try:
            # Extract version, nonce and ciphertext
            version = int.from_bytes(encrypted_data[:2], byteorder='big')
            nonce = encrypted_data[2:NONCE_SIZE+2]
            ciphertext = encrypted_data[NONCE_SIZE+2:]
            
            # Get appropriate key version
            if version not in self._key_versions:
                raise ValueError(f"Unsupported key version: {version}")
            
            key = self._key_versions[version]
            aes_gcm = AESGCM(key)
            
            # Decrypt data
            plaintext = aes_gcm.decrypt(
                nonce,
                ciphertext,
                associated_data=None
            )
            
            logger.debug(f"Data decrypted successfully using key version {version}")
            return plaintext.decode()
            
        except Exception as e:
            logger.error(f"Decryption failed: {str(e)}")
            raise RuntimeError("Decryption failed") from e

    def rotate_keys(self) -> bool:
        """Perform key rotation and update version tracking."""
        try:
            # Check if rotation is needed
            if (datetime.utcnow() - self._last_rotation).days < KEY_ROTATION_DAYS:
                return False
                
            # Generate new key
            new_key = secrets.token_bytes(32)
            new_version = self._current_key_version + 1
            
            # Update key versions
            self._key_versions[new_version] = new_key
            self._current_key_version = new_version
            self._last_rotation = datetime.utcnow()
            
            # Remove old versions if exceeding max
            if len(self._key_versions) > MAX_KEY_VERSIONS:
                oldest_version = min(self._key_versions.keys())
                del self._key_versions[oldest_version]
            
            # Update encryption instances
            self._encryption_key = new_key
            self._fernet = Fernet(base64.urlsafe_b64encode(new_key))
            self._aes_gcm = AESGCM(new_key)
            
            logger.info(f"Key rotation completed successfully. New version: {new_version}")
            return True
            
        except Exception as e:
            logger.error(f"Key rotation failed: {str(e)}")
            return False

@rate_limit(max_attempts=5, window_seconds=300)
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hashed password with rate limiting."""
    try:
        return PWD_CONTEXT.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"Password verification failed: {str(e)}")
        return False

def get_password_hash(password: str) -> str:
    """Generate password hash using bcrypt with strength validation."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
        
    # Check password complexity
    if not re.match(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]", password):
        raise ValueError("Password must contain uppercase, lowercase, number and special character")
        
    try:
        return PWD_CONTEXT.hash(password)
    except Exception as e:
        logger.error(f"Password hashing failed: {str(e)}")
        raise RuntimeError("Password hashing failed") from e