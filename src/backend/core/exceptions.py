"""
Core exceptions module for Personal Health Record Store and Analysis Tool (PHRSAT).
Defines custom exception classes with enhanced error tracking, monitoring, and HIPAA compliance.

Version: 1.0.0
"""

from datetime import datetime, timezone
import uuid
from typing import Dict, Optional

from fastapi import HTTPException, status  # fastapi v0.100+

from core.constants import API_VERSION
from core.logging import logger

# Error code mapping for standardized error handling
ERROR_CODES = {
    'AUTH_ERROR': 'auth_error',
    'FORBIDDEN': 'forbidden',
    'VALIDATION_ERROR': 'validation_error',
    'DOC_PROCESSING_ERROR': 'doc_processing_error',
    'HEALTH_DATA_ERROR': 'health_data_error',
    'NOT_FOUND': 'not_found',
    'INTERNAL_ERROR': 'internal_error',
    'RATE_LIMIT_ERROR': 'rate_limit_error',
    'INTEGRATION_ERROR': 'integration_error',
    'DATA_SYNC_ERROR': 'data_sync_error'
}

class PHRSATBaseException(HTTPException):
    """
    Enhanced base exception class for all PHRSAT custom exceptions.
    Provides comprehensive error tracking, logging, and HIPAA compliance features.
    """

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: str = ERROR_CODES['INTERNAL_ERROR'],
        error_details: Optional[Dict] = None
    ) -> None:
        """
        Initialize the base exception with enhanced tracking capabilities.

        Args:
            message (str): Human-readable error message
            status_code (int): HTTP status code
            error_code (str): Internal error code for tracking
            error_details (Dict, optional): Additional error context
        """
        self.request_id = str(uuid.uuid4())
        self.timestamp = datetime.now(timezone.utc)
        self.message = self.sanitize_message(message)
        self.status_code = status_code
        self.error_code = error_code
        self.error_details = error_details or {}

        # Log error with structured format
        logger.error(
            "Exception occurred",
            extra={
                'request_id': self.request_id,
                'error_code': self.error_code,
                'status_code': self.status_code,
                'error_details': self.error_details,
                'timestamp': self.timestamp.isoformat()
            }
        )

        # Initialize parent HTTPException
        super().__init__(
            status_code=self.status_code,
            detail=self.to_dict()
        )

    def to_dict(self) -> Dict:
        """
        Convert exception to dictionary format with enhanced details.

        Returns:
            Dict: Comprehensive exception details in API response format
        """
        return {
            'error': {
                'message': self.message,
                'code': self.error_code,
                'request_id': self.request_id,
                'timestamp': self.timestamp.isoformat(),
                'details': self.error_details,
                'api_version': API_VERSION
            }
        }

    @staticmethod
    def sanitize_message(message: str) -> str:
        """
        Sanitize error message to prevent sensitive data exposure.

        Args:
            message (str): Raw error message

        Returns:
            str: Sanitized error message
        """
        # PII/PHI patterns to redact
        patterns = {
            'ssn': r'\d{3}-\d{2}-\d{4}',
            'email': r'[^@]+@[^@]+\.[^@]+',
            'phone': r'\d{3}[-.]?\d{3}[-.]?\d{4}',
            'mrn': r'MRN-\d+',
            'credit_card': r'\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}'
        }

        sanitized_message = message
        for pattern_name, pattern in patterns.items():
            sanitized_message = sanitized_message.replace(
                pattern,
                f'[REDACTED-{pattern_name}]'
            )
        return sanitized_message

class AuthenticationError(PHRSATBaseException):
    """Exception for authentication-related errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=ERROR_CODES['AUTH_ERROR'],
            error_details=error_details
        )

class AuthorizationError(PHRSATBaseException):
    """Exception for authorization-related errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=ERROR_CODES['FORBIDDEN'],
            error_details=error_details
        )

class ValidationError(PHRSATBaseException):
    """Exception for data validation errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code=ERROR_CODES['VALIDATION_ERROR'],
            error_details=error_details
        )

class DocumentProcessingError(PHRSATBaseException):
    """Exception for document processing errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ERROR_CODES['DOC_PROCESSING_ERROR'],
            error_details=error_details
        )

class HealthDataError(PHRSATBaseException):
    """Exception for health data processing errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ERROR_CODES['HEALTH_DATA_ERROR'],
            error_details=error_details
        )

class ResourceNotFoundError(PHRSATBaseException):
    """Exception for resource not found errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=ERROR_CODES['NOT_FOUND'],
            error_details=error_details
        )

class RateLimitError(PHRSATBaseException):
    """Exception for rate limiting errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            error_code=ERROR_CODES['RATE_LIMIT_ERROR'],
            error_details=error_details
        )

class IntegrationError(PHRSATBaseException):
    """Exception for external integration errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_502_BAD_GATEWAY,
            error_code=ERROR_CODES['INTEGRATION_ERROR'],
            error_details=error_details
        )

class DataSyncError(PHRSATBaseException):
    """Exception for data synchronization errors."""
    def __init__(self, message: str, error_details: Optional[Dict] = None) -> None:
        super().__init__(
            message=message,
            status_code=status.HTTP_409_CONFLICT,
            error_code=ERROR_CODES['DATA_SYNC_ERROR'],
            error_details=error_details
        )