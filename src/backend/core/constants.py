"""
Core constants module for the Personal Health Record Store and Analysis Tool (PHRSAT).
Defines system-wide constants, enumerations, and configuration values for backend services.

Version: 1.0.0
"""

from enum import Enum, unique

# API Configuration
API_VERSION = "v1"
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100

# Cache Configuration
DEFAULT_CACHE_TTL = 3600  # 1 hour in seconds

# Upload Configuration
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB in bytes

# Health Check Configuration
HEALTH_CHECK_INTERVAL = 30  # seconds

# Security Configuration
JWT_ALGORITHM = "RS256"

# Supported File Types
SUPPORTED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/tiff"
]

SUPPORTED_DOCUMENT_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff"
]

@unique
class HealthDataFormat(Enum):
    """
    Enumeration of supported health data format standards.
    Based on industry-standard healthcare data formats.
    """
    FHIR_R4 = "FHIR R4"
    DICOM_3_0 = "DICOM 3.0"
    HL7_V2 = "HL7 v2"
    CDA_R2 = "CDA R2"

@unique
class HealthMetricType(Enum):
    """
    Enumeration of supported health metric types.
    Defines the types of health metrics that can be tracked and analyzed.
    """
    HEART_RATE = "heart_rate"
    BLOOD_PRESSURE = "blood_pressure"
    BLOOD_GLUCOSE = "blood_glucose"
    WEIGHT = "weight"
    STEPS = "steps"
    SLEEP = "sleep"
    ACTIVITY = "activity"

@unique
class DocumentStatus(Enum):
    """
    Enumeration of document processing statuses.
    Tracks the lifecycle of document processing within the system.
    """
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    ARCHIVED = "archived"

# Export all constants and enums
__all__ = [
    'API_VERSION',
    'DEFAULT_PAGE_SIZE',
    'MAX_PAGE_SIZE',
    'DEFAULT_CACHE_TTL',
    'MAX_UPLOAD_SIZE',
    'HEALTH_CHECK_INTERVAL',
    'JWT_ALGORITHM',
    'SUPPORTED_IMAGE_TYPES',
    'SUPPORTED_DOCUMENT_TYPES',
    'HealthDataFormat',
    'HealthMetricType',
    'DocumentStatus'
]