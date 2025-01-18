"""
Health services package initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides unified interface for health platform integrations with enhanced validation and error handling.

Version: 1.0.0
"""

from functools import wraps
import logging
from typing import Dict, List, Optional, Union

from core.config import settings
from core.exceptions import HealthDataException, ValidationError
from services.health.apple import HealthKitService
from services.health.google import GoogleFitClient
from services.health.fhir import FHIRConverter

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
SUPPORTED_PLATFORMS = ["apple_health", "google_fit"]
DEFAULT_SYNC_INTERVAL = 3600  # 1 hour in seconds
MAX_RETRY_ATTEMPTS = 3

# Platform service mapping
PLATFORM_SERVICE_MAPPING = {
    "apple_health": HealthKitService,
    "google_fit": GoogleFitClient
}

# Platform capabilities mapping
PLATFORM_CAPABILITIES = {
    "apple_health": ["metrics", "workouts", "vitals"],
    "google_fit": ["metrics", "activities"]
}

def validate_platform(func):
    """Decorator for platform validation with enhanced error handling."""
    @wraps(func)
    def wrapper(platform_name: str, *args, **kwargs):
        if platform_name not in SUPPORTED_PLATFORMS:
            raise ValidationError(
                f"Unsupported platform: {platform_name}",
                error_details={
                    "supported_platforms": SUPPORTED_PLATFORMS,
                    "provided_platform": platform_name
                }
            )
        return func(platform_name, *args, **kwargs)
    return wrapper

def circuit_breaker(max_retries: int = MAX_RETRY_ATTEMPTS):
    """Circuit breaker decorator for platform service calls."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            attempts = 0
            last_error = None
            
            while attempts < max_retries:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    attempts += 1
                    last_error = e
                    logger.warning(
                        f"Platform service call failed (attempt {attempts}/{max_retries})",
                        extra={
                            "error": str(e),
                            "function": func.__name__
                        }
                    )
            
            raise HealthDataException(
                f"Platform service call failed after {max_retries} attempts",
                error_details={"last_error": str(last_error)}
            )
        return wrapper
    return decorator

@validate_platform
@circuit_breaker(max_retries=MAX_RETRY_ATTEMPTS)
def get_platform_service(
    platform_name: str,
    config: Dict,
    validate_capabilities: bool = True
) -> Union[HealthKitService, GoogleFitClient]:
    """
    Enhanced factory function to get appropriate health platform service instance.
    
    Args:
        platform_name: Name of the health platform
        config: Platform-specific configuration
        validate_capabilities: Whether to validate platform capabilities
        
    Returns:
        Initialized and validated platform service instance
        
    Raises:
        ValidationError: If platform validation fails
        HealthDataException: If service initialization fails
    """
    try:
        # Validate platform configuration
        if not validate_platform_config(platform_name, config):
            raise ValidationError(
                f"Invalid configuration for platform: {platform_name}",
                error_details={"config": config}
            )
        
        # Get service class from mapping
        service_class = PLATFORM_SERVICE_MAPPING.get(platform_name)
        if not service_class:
            raise ValidationError(f"Service class not found for platform: {platform_name}")
        
        # Initialize service instance
        service = service_class(config)
        
        # Validate platform capabilities if requested
        if validate_capabilities:
            required_capabilities = config.get("required_capabilities", [])
            available_capabilities = PLATFORM_CAPABILITIES.get(platform_name, [])
            
            missing_capabilities = [
                cap for cap in required_capabilities 
                if cap not in available_capabilities
            ]
            
            if missing_capabilities:
                raise ValidationError(
                    f"Platform {platform_name} missing required capabilities",
                    error_details={
                        "missing_capabilities": missing_capabilities,
                        "available_capabilities": available_capabilities
                    }
                )
        
        logger.info(
            f"Platform service initialized successfully",
            extra={
                "platform": platform_name,
                "service_class": service_class.__name__
            }
        )
        
        return service
        
    except Exception as e:
        logger.error(
            f"Failed to initialize platform service",
            extra={
                "platform": platform_name,
                "error": str(e)
            }
        )
        raise HealthDataException(
            f"Failed to initialize platform service: {str(e)}",
            error_details={"platform": platform_name}
        )

def validate_platform_config(platform_name: str, config: Dict) -> bool:
    """
    Validates platform configuration for completeness and correctness.
    
    Args:
        platform_name: Name of the health platform
        config: Platform configuration to validate
        
    Returns:
        bool: True if configuration is valid, False otherwise
    """
    try:
        # Check required configuration parameters
        required_params = {
            "apple_health": ["client_id", "client_secret", "api_base_url"],
            "google_fit": ["client_id", "client_secret", "redirect_uri"]
        }
        
        platform_required_params = required_params.get(platform_name, [])
        missing_params = [
            param for param in platform_required_params 
            if param not in config
        ]
        
        if missing_params:
            logger.error(
                f"Missing required configuration parameters",
                extra={
                    "platform": platform_name,
                    "missing_params": missing_params
                }
            )
            return False
        
        # Validate API credentials format
        if not all(isinstance(config.get(param), str) for param in platform_required_params):
            logger.error(
                f"Invalid credential format",
                extra={"platform": platform_name}
            )
            return False
        
        # Validate rate limiting settings
        rate_limit = config.get("rate_limit", {})
        if rate_limit:
            if not all(key in rate_limit for key in ["requests", "period"]):
                logger.error(
                    f"Invalid rate limit configuration",
                    extra={"platform": platform_name}
                )
                return False
        
        return True
        
    except Exception as e:
        logger.error(
            f"Configuration validation failed",
            extra={
                "platform": platform_name,
                "error": str(e)
            }
        )
        return False

# Export public interface
__all__ = [
    'get_platform_service',
    'validate_platform_config',
    'SUPPORTED_PLATFORMS',
    'DEFAULT_SYNC_INTERVAL',
    'HealthKitService',
    'GoogleFitClient'
]