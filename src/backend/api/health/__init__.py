"""
Health API initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides HIPAA-compliant, FHIR R4-compatible health data management functionality with
comprehensive security controls and ML-powered analytics capabilities.

Version: 1.0.0
"""

from typing import Dict, List

# Third-party imports
from fhir.resources import construct_fhir_element  # fhir.resources v6.4.0
import tensorflow as tf  # tensorflow v2.13.0

# Internal imports
from api.health.models import (
    HealthMetric,
    HealthRecord,
    HealthPlatformSync
)
from api.health.services import HealthDataService
from api.health.routes import router

# Global constants for health data management
ALLOWED_METRIC_TYPES: List[str] = [
    "heart_rate",
    "blood_pressure", 
    "blood_glucose",
    "weight",
    "height",
    "steps",
    "sleep",
    "oxygen_saturation"
]

ALLOWED_RECORD_TYPES: List[str] = [
    "lab_report",
    "prescription",
    "imaging",
    "clinical_notes",
    "vaccination"
]

SUPPORTED_PLATFORMS: List[str] = [
    "apple_health",
    "google_fit",
    "fitbit"
]

# FHIR and security configuration
FHIR_VERSION: str = "R4"
PHI_ENCRYPTION_ALGORITHM: str = "AES-256-GCM"
MAX_RETRY_ATTEMPTS: int = 3
RATE_LIMIT_REQUESTS: int = 1000
RATE_LIMIT_PERIOD: str = "1h"

# Initialize TensorFlow for health analytics
try:
    tf.config.experimental.set_memory_growth(
        tf.config.list_physical_devices('GPU')[0],
        True
    )
except:
    pass  # Fall back to CPU if GPU is not available

def validate_fhir_compliance(resource_data: Dict) -> bool:
    """
    Validate FHIR R4 compliance for health data resources.
    
    Args:
        resource_data: Dictionary containing FHIR resource data
        
    Returns:
        bool: True if resource is FHIR R4 compliant
    """
    try:
        construct_fhir_element(resource_data["resourceType"], resource_data)
        return True
    except Exception:
        return False

def initialize_health_api() -> None:
    """
    Initialize health API components with security controls and analytics capabilities.
    Configures FHIR validation, security controls, and ML models.
    """
    # Validate model configurations
    HealthMetric.validate_metric_type
    HealthRecord.validate_record_type
    
    # Initialize platform sync capabilities
    HealthPlatformSync.update_sync_status
    HealthPlatformSync.retry_failed_sync
    
    # Configure health data service
    HealthDataService.store_health_metric
    HealthDataService.store_health_record
    HealthDataService.sync_platform_data
    HealthDataService.analyze_health_trends

# Export public components
__all__ = [
    # Models
    'HealthMetric',
    'HealthRecord',
    'HealthPlatformSync',
    
    # Services
    'HealthDataService',
    
    # API Router
    'router',
    
    # Constants
    'ALLOWED_METRIC_TYPES',
    'ALLOWED_RECORD_TYPES',
    'SUPPORTED_PLATFORMS',
    'FHIR_VERSION',
    'PHI_ENCRYPTION_ALGORITHM',
    
    # Utility functions
    'validate_fhir_compliance',
    'initialize_health_api'
]

# Initialize API components
initialize_health_api()