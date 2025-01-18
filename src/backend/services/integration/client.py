"""
Base client implementation for health platform integrations providing comprehensive,
HIPAA-compliant functionality for secure authentication, resilient data fetching,
and standardized error handling across different health data providers.

Version: 1.0.0
"""

import abc
import ssl
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

import aiohttp  # version 3.8+
from tenacity import (  # version 8.0+
    retry,
    stop_after_attempt,
    wait_exponential,
    RetryError
)

from core.config import Settings
from core.exceptions import HealthDataException

# Global constants
DEFAULT_TIMEOUT = 30
MAX_RETRIES = 3
SUPPORTED_PLATFORMS = ["apple_health", "google_fit", "fitbit", "samsung_health"]
SECURITY_HEADERS = {
    "X-Security-Version": "1.0",
    "X-HIPAA-Compliance": "enabled"
}
SSL_PROTOCOLS = ssl.PROTOCOL_TLS_CLIENT

class HealthPlatformClient(abc.ABC):
    """
    Enhanced abstract base class for HIPAA-compliant health platform API clients
    with comprehensive security features.
    """

    def __init__(
        self,
        base_url: str,
        headers: Optional[Dict[str, str]] = None,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = MAX_RETRIES,
        ssl_config: Optional[Dict[str, Any]] = None,
        connection_params: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize secure base client with enhanced configuration."""
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.max_retries = max_retries
        self.session: Optional[aiohttp.ClientSession] = None
        
        # Initialize logger with security context
        self.logger = logging.getLogger(f"health_platform.{self.__class__.__name__}")
        
        # Configure SSL context
        self.ssl_context = self._configure_ssl(ssl_config)
        
        # Configure secure headers
        self.headers = {
            **SECURITY_HEADERS,
            "User-Agent": f"PHRSAT-HealthClient/1.0",
            "Accept": "application/json",
            "Content-Type": "application/json",
            **(headers or {})
        }
        
        # Configure connection parameters
        self.connection_params = {
            "timeout": aiohttp.ClientTimeout(total=self.timeout),
            "ssl": self.ssl_context,
            "raise_for_status": True,
            **(connection_params or {})
        }

    def _configure_ssl(self, ssl_config: Optional[Dict[str, Any]] = None) -> ssl.SSLContext:
        """Configure SSL context with secure defaults and custom certificates."""
        ssl_context = ssl.create_default_context()
        ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
        ssl_context.verify_mode = ssl.CERT_REQUIRED
        
        if ssl_config:
            if cert_path := ssl_config.get("cert_path"):
                ssl_context.load_cert_chain(cert_path)
            if verify_path := ssl_config.get("verify_path"):
                ssl_context.load_verify_locations(verify_path)
                
        return ssl_context

    async def __aenter__(self) -> 'HealthPlatformClient':
        """Async context manager entry with session initialization."""
        if not self.session:
            self.session = aiohttp.ClientSession(
                headers=self.headers,
                **self.connection_params
            )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit with proper cleanup."""
        if self.session:
            await self.session.close()
            self.session = None

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Make secure HTTP request with comprehensive retry handling and monitoring."""
        if not self.session:
            raise HealthDataException("Client session not initialized")

        full_url = f"{self.base_url}/{endpoint.lstrip('/')}"
        request_headers = {**self.headers, **(headers or {})}
        
        try:
            async with self.session.request(
                method=method,
                url=full_url,
                params=params,
                json=data,
                headers=request_headers
            ) as response:
                response_data = await response.json()
                
                # Validate response format
                if not self.validate_response(response_data, Settings.HEALTH_DATA_FORMAT):
                    raise HealthDataException("Invalid response format")
                
                return response_data
                
        except aiohttp.ClientError as e:
            self.logger.error(
                "Request failed",
                extra={
                    "error": str(e),
                    "url": full_url,
                    "method": method
                }
            )
            raise HealthDataException(f"Request failed: {str(e)}")

    @abc.abstractmethod
    async def fetch_health_data(
        self,
        metric_types: List[str],
        start_date: datetime,
        end_date: datetime,
        access_token: str,
        additional_params: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Fetch health data from platform API with comprehensive validation."""
        raise NotImplementedError("Subclasses must implement fetch_health_data")

    def validate_response(
        self,
        response: Dict[str, Any],
        expected_format: str
    ) -> bool:
        """Comprehensive validation of API response format and data integrity."""
        if not isinstance(response, dict):
            return False
            
        # Validate required fields based on format
        if expected_format == "FHIR R4":
            return self._validate_fhir_response(response)
        elif expected_format == "HL7 v2":
            return self._validate_hl7_response(response)
            
        return True

    def _validate_fhir_response(self, response: Dict[str, Any]) -> bool:
        """Validate FHIR R4 response format."""
        required_fields = ["resourceType", "id", "meta"]
        return all(field in response for field in required_fields)

    def _validate_hl7_response(self, response: Dict[str, Any]) -> bool:
        """Validate HL7 v2 response format."""
        required_fields = ["message_type", "message_control_id"]
        return all(field in response for field in required_fields)

def normalize_date(
    date: datetime,
    timezone_name: Optional[str] = None,
    output_format: str = "%Y-%m-%dT%H:%M:%S.%fZ"
) -> str:
    """Enhanced date format normalization with timezone handling."""
    if timezone_name:
        date = date.astimezone(timezone.gettz(timezone_name))
    return date.strftime(output_format)