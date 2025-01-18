"""
Machine Learning package initialization module for PHRSAT.
Exposes core ML models and functionality for document classification and health prediction
with comprehensive model validation, version tracking, and telemetry.

Version: 1.0.0
"""

import logging  # logging >=3.8.0

from ml.models.document_classifier import DocumentClassifier
from ml.models.health_predictor import (
    HealthPredictor,
    LSTMHealthPredictor,
    RandomForestHealthPredictor
)

# Package version
__version__ = "1.0.0"

# Define minimum required model versions for compatibility
MINIMUM_MODEL_VERSIONS = {
    "DocumentClassifier": "1.0.0",
    "HealthPredictor": "1.0.0",
    "LSTMHealthPredictor": "1.0.0",
    "RandomForestHealthPredictor": "1.0.0"
}

# Configure package-level logger
logger = logging.getLogger(__name__)

def _validate_model_versions(minimum_versions: dict) -> bool:
    """
    Validates that all imported models meet minimum version requirements.
    
    Args:
        minimum_versions: Dictionary of model names and their minimum required versions
        
    Returns:
        bool: True if all versions are compatible, raises ValueError otherwise
        
    Raises:
        ValueError: If any model version is incompatible
    """
    try:
        # Validate DocumentClassifier version
        if DocumentClassifier.VERSION < minimum_versions["DocumentClassifier"]:
            raise ValueError(
                f"DocumentClassifier version {DocumentClassifier.VERSION} is below "
                f"minimum required version {minimum_versions['DocumentClassifier']}"
            )

        # Validate HealthPredictor versions
        if HealthPredictor.VERSION < minimum_versions["HealthPredictor"]:
            raise ValueError(
                f"HealthPredictor version {HealthPredictor.VERSION} is below "
                f"minimum required version {minimum_versions['HealthPredictor']}"
            )

        if LSTMHealthPredictor.VERSION < minimum_versions["LSTMHealthPredictor"]:
            raise ValueError(
                f"LSTMHealthPredictor version {LSTMHealthPredictor.VERSION} is below "
                f"minimum required version {minimum_versions['LSTMHealthPredictor']}"
            )

        if RandomForestHealthPredictor.VERSION < minimum_versions["RandomForestHealthPredictor"]:
            raise ValueError(
                f"RandomForestHealthPredictor version {RandomForestHealthPredictor.VERSION} is below "
                f"minimum required version {minimum_versions['RandomForestHealthPredictor']}"
            )

        logger.info("All model versions validated successfully")
        return True

    except Exception as e:
        logger.error(f"Model version validation failed: {str(e)}")
        raise

# Validate model versions on import
_validate_model_versions(MINIMUM_MODEL_VERSIONS)

# Define package exports
__all__ = [
    "DocumentClassifier",
    "HealthPredictor",
    "LSTMHealthPredictor",
    "RandomForestHealthPredictor"
]