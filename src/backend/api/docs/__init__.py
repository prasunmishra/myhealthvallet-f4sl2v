"""
Package initialization file for the documents API module providing secure, HIPAA-compliant 
document management functionality including models, services, routes, and type validation.

Version: 1.0.0
"""

from .models import (
    HealthDocument,
    DOCUMENT_TYPES,
    OCR_STATUS_TYPES
)
from .services import DocumentService
from .routes import router

# Package version
__version__ = "1.0.0"

# Expose key components for document management
__all__ = [
    "HealthDocument",
    "DocumentService",
    "router",
    "DOCUMENT_TYPES",
    "OCR_STATUS_TYPES"
]

# Validate document types and OCR status types are properly defined
if not DOCUMENT_TYPES:
    raise ValueError("DOCUMENT_TYPES must be defined")
if not OCR_STATUS_TYPES:
    raise ValueError("OCR_STATUS_TYPES must be defined")

# Validate HealthDocument model has required HIPAA-compliant fields
required_fields = {
    'user_id',
    'document_type',
    'storage_url',
    'encrypted_content',
    'encrypted_metadata',
    'access_log'
}

model_fields = set(HealthDocument._fields.keys())
missing_fields = required_fields - model_fields

if missing_fields:
    raise ValueError(f"HealthDocument model missing required fields: {missing_fields}")

# Validate DocumentService has required security methods
required_methods = {
    'upload_document',
    'get_document',
    'delete_document',
    'share_document'
}

service_methods = set(dir(DocumentService))
missing_methods = required_methods - service_methods

if missing_methods:
    raise ValueError(f"DocumentService missing required methods: {missing_methods}")

# Validate router has required HIPAA-compliant endpoints
required_endpoints = {
    'create_document',
    'get_document', 
    'update_document',
    'delete_document',
    'share_document',
    'get_document_status'
}

router_endpoints = {route.name for route in router.routes}
missing_endpoints = required_endpoints - router_endpoints

if missing_endpoints:
    raise ValueError(f"API router missing required endpoints: {missing_endpoints}")

# Log initialization status
import logging
logger = logging.getLogger(__name__)
logger.info(
    "Documents API module initialized successfully",
    extra={
        'version': __version__,
        'document_types': len(DOCUMENT_TYPES),
        'status_types': len(OCR_STATUS_TYPES),
        'endpoints': len(router.routes)
    }
)