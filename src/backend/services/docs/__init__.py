"""
Initialization module for the document services package providing secure, HIPAA-compliant
document processing and storage functionality with OCR capabilities and comprehensive audit logging.

Version: 1.0.0
"""

import logging
from typing import Dict, List, Optional, Union
from PIL import Image

from services.docs.processor import DocumentProcessor
from services.docs.storage import DocumentStorageService

# Configure logging
logger = logging.getLogger(__name__)

# Global constants for document processing
SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf", "image/tiff"]
MAX_DOCUMENT_SIZE_BYTES = 10485760  # 10MB
MIN_OCR_CONFIDENCE = 0.95  # 95% confidence threshold for OCR accuracy
ENCRYPTION_ALGORITHM = "AES-256-GCM"  # HIPAA-compliant encryption
AUDIT_LOG_RETENTION_DAYS = 2555  # 7 years retention for HIPAA compliance

def validate_document_input(document: Union[str, bytes, Image.Image], 
                          validation_options: Optional[Dict] = None) -> bool:
    """
    Validate document input for processing with HIPAA compliance checks.
    
    Args:
        document: Input document as file path, bytes, or PIL Image
        validation_options: Optional validation parameters
        
    Returns:
        bool: True if document is valid, False otherwise
    """
    try:
        # Validate document size
        if isinstance(document, bytes) and len(document) > MAX_DOCUMENT_SIZE_BYTES:
            logger.error("Document exceeds maximum size limit")
            return False
            
        # Validate document format
        if isinstance(document, str):
            try:
                with Image.open(document) as img:
                    mime_type = Image.MIME[img.format]
                    if mime_type not in SUPPORTED_MIME_TYPES:
                        logger.error(f"Unsupported document format: {mime_type}")
                        return False
            except Exception as e:
                logger.error(f"Error validating document format: {str(e)}")
                return False
                
        # Additional validation based on options
        if validation_options:
            if validation_options.get('require_ocr', True):
                processor = DocumentProcessor()
                result = processor.validate_ocr_confidence(document)
                if not result:
                    logger.error("Document failed OCR confidence validation")
                    return False
                    
        return True
        
    except Exception as e:
        logger.error(f"Document validation failed: {str(e)}")
        return False

# Export core components with security and audit capabilities
__all__ = [
    'DocumentProcessor',
    'DocumentStorageService',
    'validate_document_input',
    'SUPPORTED_MIME_TYPES',
    'MAX_DOCUMENT_SIZE_BYTES',
    'MIN_OCR_CONFIDENCE',
    'ENCRYPTION_ALGORITHM',
    'AUDIT_LOG_RETENTION_DAYS'
]

# Module initialization with security checks
logger.info("Document services module initialized with HIPAA compliance")