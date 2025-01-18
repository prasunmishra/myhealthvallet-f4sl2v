"""
Cryptographic utility module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides high-level encryption operations for securing sensitive data and PHI with HIPAA compliance.

Version: 1.0.0
"""

from typing import Dict, List, Optional, Any
import base64
import copy
from concurrent.futures import ThreadPoolExecutor
from functools import wraps

from core.security import SecurityManager
from core.config import settings
from core.logging import get_logger

# Initialize logger with security context
logger = get_logger(__name__, {
    "module": "crypto_utils",
    "security_level": "high",
    "data_classification": "phi"
})

# Global constants
ENCODING = "utf-8"
MAX_WORKERS = 4
ENCRYPTION_VERSION_SEPARATOR = ":"
DEFAULT_CHUNK_SIZE = 1000

def security_audit_log(func):
    """Decorator for logging security-related operations with audit trail."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        operation = func.__name__
        logger.info(f"Starting {operation}", extra={
            "event_type": "security_operation",
            "operation": operation,
            "status": "started"
        })
        try:
            result = func(*args, **kwargs)
            logger.info(f"Completed {operation}", extra={
                "event_type": "security_operation",
                "operation": operation,
                "status": "completed"
            })
            return result
        except Exception as e:
            logger.error(f"Failed {operation}: {str(e)}", extra={
                "event_type": "security_operation",
                "operation": operation,
                "status": "failed",
                "error": str(e)
            })
            raise
    return wrapper

def performance_monitor(func):
    """Decorator for monitoring encryption/decryption performance."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        import time
        start_time = time.time()
        result = func(*args, **kwargs)
        duration = time.time() - start_time
        logger.info(f"Operation performance", extra={
            "operation": func.__name__,
            "duration_seconds": duration,
            "document_size": len(str(args[0])) if args else 0
        })
        return result
    return wrapper

@security_audit_log
def encrypt_field(value: str, is_phi: bool = False, key_version: Optional[str] = None) -> str:
    """
    Encrypt a single field value with appropriate encryption method and audit logging.
    
    Args:
        value: The value to encrypt
        is_phi: Whether the value contains protected health information
        key_version: Optional specific encryption key version to use
    
    Returns:
        Base64 encoded encrypted value with key version metadata
    """
    if not value:
        return value

    try:
        security_manager = SecurityManager(settings)
        
        # Use appropriate encryption method based on data type
        if is_phi:
            encrypted_bytes = security_manager.encrypt_phi(value)
        else:
            encrypted_bytes = security_manager.encrypt_sensitive(value)
            
        # Encode with version information
        version = key_version or settings.ENCRYPTION_KEY_VERSION
        encoded = base64.b64encode(encrypted_bytes).decode(ENCODING)
        return f"{version}{ENCRYPTION_VERSION_SEPARATOR}{encoded}"
        
    except Exception as e:
        logger.error("Field encryption failed", extra={
            "error": str(e),
            "is_phi": is_phi
        })
        raise RuntimeError("Field encryption failed") from e

@security_audit_log
def decrypt_field(encrypted_value: str, is_phi: bool = False, key_version: Optional[str] = None) -> str:
    """
    Decrypt a single encrypted field value with validation and error handling.
    
    Args:
        encrypted_value: The encrypted value to decrypt
        is_phi: Whether the value contains protected health information
        key_version: Optional specific encryption key version to use
    
    Returns:
        Decrypted original value
    """
    if not encrypted_value:
        return encrypted_value

    try:
        # Extract version and encrypted data
        if ENCRYPTION_VERSION_SEPARATOR in encrypted_value:
            version, encoded = encrypted_value.split(ENCRYPTION_VERSION_SEPARATOR)
        else:
            version = key_version or settings.ENCRYPTION_KEY_VERSION
            encoded = encrypted_value
            
        encrypted_bytes = base64.b64decode(encoded)
        security_manager = SecurityManager(settings)
        
        # Use appropriate decryption method
        if is_phi:
            return security_manager.decrypt_phi(encrypted_bytes)
        else:
            return security_manager.decrypt_sensitive(encrypted_bytes)
            
    except Exception as e:
        logger.error("Field decryption failed", extra={
            "error": str(e),
            "is_phi": is_phi
        })
        raise RuntimeError("Field decryption failed") from e

@security_audit_log
@performance_monitor
def encrypt_document(document: Dict[str, Any], 
                    phi_fields: List[str], 
                    sensitive_fields: List[str],
                    max_workers: Optional[int] = None) -> Dict[str, Any]:
    """
    Encrypt multiple fields in a document with parallel processing support.
    
    Args:
        document: Document containing fields to encrypt
        phi_fields: List of field names containing PHI
        sensitive_fields: List of field names containing sensitive data
        max_workers: Optional maximum number of parallel encryption workers
    
    Returns:
        Document with encrypted fields
    """
    if not document:
        return document

    result = copy.deepcopy(document)
    workers = max_workers or MAX_WORKERS

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            # Create encryption tasks for PHI fields
            phi_futures = {
                field: executor.submit(encrypt_field, document.get(field), True)
                for field in phi_fields
                if field in document
            }
            
            # Create encryption tasks for sensitive fields
            sensitive_futures = {
                field: executor.submit(encrypt_field, document.get(field), False)
                for field in sensitive_fields
                if field in document
            }
            
            # Collect results from PHI encryption
            for field, future in phi_futures.items():
                try:
                    result[field] = future.result()
                except Exception as e:
                    logger.error(f"PHI field encryption failed: {field}", extra={
                        "error": str(e),
                        "field": field
                    })
                    raise
                    
            # Collect results from sensitive data encryption
            for field, future in sensitive_futures.items():
                try:
                    result[field] = future.result()
                except Exception as e:
                    logger.error(f"Sensitive field encryption failed: {field}", extra={
                        "error": str(e),
                        "field": field
                    })
                    raise
                    
        return result
        
    except Exception as e:
        logger.error("Document encryption failed", extra={"error": str(e)})
        raise RuntimeError("Document encryption failed") from e

@security_audit_log
@performance_monitor
def decrypt_document(document: Dict[str, Any], 
                    phi_fields: List[str], 
                    sensitive_fields: List[str],
                    max_workers: Optional[int] = None) -> Dict[str, Any]:
    """
    Decrypt multiple fields in a document with parallel processing support.
    
    Args:
        document: Document containing encrypted fields
        phi_fields: List of field names containing PHI
        sensitive_fields: List of field names containing sensitive data
        max_workers: Optional maximum number of parallel decryption workers
    
    Returns:
        Document with decrypted fields
    """
    if not document:
        return document

    result = copy.deepcopy(document)
    workers = max_workers or MAX_WORKERS

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            # Create decryption tasks for PHI fields
            phi_futures = {
                field: executor.submit(decrypt_field, document.get(field), True)
                for field in phi_fields
                if field in document
            }
            
            # Create decryption tasks for sensitive fields
            sensitive_futures = {
                field: executor.submit(decrypt_field, document.get(field), False)
                for field in sensitive_fields
                if field in document
            }
            
            # Collect results from PHI decryption
            for field, future in phi_futures.items():
                try:
                    result[field] = future.result()
                except Exception as e:
                    logger.error(f"PHI field decryption failed: {field}", extra={
                        "error": str(e),
                        "field": field
                    })
                    raise
                    
            # Collect results from sensitive data decryption
            for field, future in sensitive_futures.items():
                try:
                    result[field] = future.result()
                except Exception as e:
                    logger.error(f"Sensitive field decryption failed: {field}", extra={
                        "error": str(e),
                        "field": field
                    })
                    raise
                    
        return result
        
    except Exception as e:
        logger.error("Document decryption failed", extra={"error": str(e)})
        raise RuntimeError("Document decryption failed") from e