"""
Enterprise-grade initialization module for machine learning models in PHRSAT.
Provides secure model management, version control, configuration validation,
and comprehensive error handling for document classification and health prediction models.

Version: 1.0.0
"""

import logging
import json
from typing import Dict, Optional
from jsonschema import validate, ValidationError  # jsonschema v4.0.0
import semver  # semver v3.0.0

from .document_classifier import DocumentClassifier
from .health_predictor import (
    HealthPredictor,
    LSTMHealthPredictor,
    RandomForestHealthPredictor
)
from core.logging import setup_logging

# Configure logging
logger = setup_logging()

# Model version configuration
MODEL_VERSIONS = {
    "document_classifier": "1.0.0",
    "health_predictor": "1.0.0",
    "min_compatible_version": "0.9.0"
}

# Default model paths configuration
DEFAULT_MODEL_PATHS = {
    "document_classifier": "models/document_classifier",
    "health_predictor": "models/health_predictor"
}

# Model configuration schema
MODEL_CONFIG_SCHEMA = {
    "type": "object",
    "properties": {
        "version": {"type": "string"},
        "path": {"type": "string"},
        "parameters": {
            "type": "object",
            "properties": {
                "model_type": {"type": "string"},
                "input_shape": {"type": "array"},
                "output_shape": {"type": "array"},
                "hyperparameters": {"type": "object"}
            },
            "required": ["model_type"]
        }
    },
    "required": ["version", "parameters"]
}

def validate_model_name(func):
    """Decorator to validate model name against supported models."""
    def wrapper(model_name: str, *args, **kwargs):
        if model_name not in MODEL_VERSIONS:
            raise ValueError(f"Unsupported model: {model_name}")
        return func(model_name, *args, **kwargs)
    return wrapper

def log_version_check(func):
    """Decorator to log version checking operations."""
    def wrapper(*args, **kwargs):
        logger.debug(f"Checking version for args: {args}, kwargs: {kwargs}")
        result = func(*args, **kwargs)
        logger.debug(f"Version check result: {result}")
        return result
    return wrapper

def validate_path_security(func):
    """Decorator to validate path security."""
    def wrapper(*args, **kwargs):
        path = func(*args, **kwargs)
        if "../" in path or "~" in path:
            raise SecurityError("Invalid path detected")
        return path
    return wrapper

@validate_model_name
@log_version_check
def get_model_version(model_name: str) -> str:
    """
    Get and validate the version of a specific model.
    
    Args:
        model_name: Name of the model to check
        
    Returns:
        Validated version string
        
    Raises:
        ValueError: If model version is invalid or incompatible
    """
    try:
        version = MODEL_VERSIONS[model_name]
        min_version = MODEL_VERSIONS["min_compatible_version"]
        
        # Validate version format
        if not semver.VersionInfo.isvalid(version):
            raise ValueError(f"Invalid version format for {model_name}: {version}")
            
        # Check version compatibility
        if semver.compare(version, min_version) < 0:
            raise ValueError(
                f"Model version {version} is below minimum compatible version {min_version}"
            )
            
        return version
        
    except Exception as e:
        logger.error(f"Version check failed for {model_name}: {str(e)}")
        raise

@validate_model_name
@validate_path_security
def get_model_path(model_name: str) -> str:
    """
    Get and validate the default path for a specific model.
    
    Args:
        model_name: Name of the model
        
    Returns:
        Validated model path
        
    Raises:
        ValueError: If model path is invalid
        SecurityError: If path contains security risks
    """
    try:
        if model_name not in DEFAULT_MODEL_PATHS:
            raise ValueError(f"No default path configured for model: {model_name}")
            
        path = DEFAULT_MODEL_PATHS[model_name]
        
        # Additional security checks could be implemented here
        
        return path
        
    except Exception as e:
        logger.error(f"Path retrieval failed for {model_name}: {str(e)}")
        raise

@validate_model_name
def validate_model_config(config: Dict, model_name: str) -> bool:
    """
    Validate model configuration against schema.
    
    Args:
        config: Model configuration dictionary
        model_name: Name of the model
        
    Returns:
        True if configuration is valid
        
    Raises:
        ValidationError: If configuration is invalid
    """
    try:
        # Validate against schema
        validate(instance=config, schema=MODEL_CONFIG_SCHEMA)
        
        # Validate version compatibility
        version = config.get("version")
        if version:
            min_version = MODEL_VERSIONS["min_compatible_version"]
            if semver.compare(version, min_version) < 0:
                raise ValidationError(
                    f"Configuration version {version} is below minimum compatible version {min_version}"
                )
        
        return True
        
    except ValidationError as e:
        logger.error(f"Configuration validation failed for {model_name}: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during config validation: {str(e)}")
        raise

class SecurityError(Exception):
    """Custom exception for security-related errors."""
    pass

# Export components
__all__ = [
    'DocumentClassifier',
    'HealthPredictor',
    'LSTMHealthPredictor',
    'RandomForestHealthPredictor',
    'get_model_version',
    'get_model_path',
    'validate_model_config'
]