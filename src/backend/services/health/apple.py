"""
Apple HealthKit integration service module for PHRSAT.
Provides secure, HIPAA-compliant health data synchronization with comprehensive
error handling, performance optimization, and monitoring capabilities.

Version: 1.0.0
"""

import asyncio
from datetime import datetime, timezone
import json
from typing import Dict, List, Optional, Union

import aiohttp  # aiohttp v3.8+
import jwt  # pyjwt v2.7+
from tenacity import (  # tenacity v8.2+
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from cryptography.fernet import Fernet  # cryptography v41.0+
from prometheus_client import Counter, Histogram  # prometheus_client v0.17+

from core.config import Settings
from core.exceptions import HealthDataException
from services.health.fhir import FHIRService

# Metrics collectors
HEALTHKIT_REQUESTS = Counter(
    'healthkit_requests_total',
    'Total HealthKit API requests',
    ['endpoint', 'status']
)
HEALTHKIT_LATENCY = Histogram(
    'healthkit_request_latency_seconds',
    'HealthKit API request latency',
    ['endpoint']
)

# Constants
HEALTHKIT_API_VERSION = "v1"
SUPPORTED_METRICS = [
    "heart_rate", "blood_pressure", "blood_glucose", "steps", 
    "weight", "height", "sleep", "oxygen_saturation", "respiratory_rate"
]
HEALTHKIT_FHIR_MAPPING = {
    "heart_rate": "HeartRate",
    "blood_pressure": "BloodPressure",
    "blood_glucose": "BloodGlucose",
    "oxygen_saturation": "OxygenSaturation",
    "respiratory_rate": "RespiratoryRate"
}
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Strict-Transport-Security": "max-age=31536000",
    "X-Frame-Options": "DENY"
}
RETRY_CONFIGURATION = {
    "max_attempts": 3,
    "backoff_factor": 2,
    "max_delay": 30
}

class HealthKitService:
    """Enhanced service class for Apple HealthKit integration with comprehensive security and monitoring."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        api_base_url: str,
        pool_config: Dict = None,
        retry_config: Dict = None,
        cache_config: Dict = None
    ):
        """Initialize HealthKit service with enhanced configuration and security features."""
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_base_url = api_base_url
        self.fhir_service = FHIRService()
        
        # Configure connection pooling
        self.pool_config = pool_config or {
            "limit": 100,
            "force_close": True,
            "enable_cleanup_closed": True
        }
        
        # Configure retry strategy
        self.retry_config = retry_config or RETRY_CONFIGURATION
        
        # Initialize session with security settings
        self.session = aiohttp.ClientSession(
            headers=SECURITY_HEADERS,
            timeout=aiohttp.ClientTimeout(total=30),
            connector=aiohttp.TCPConnector(**self.pool_config)
        )
        
        # Initialize encryption for sensitive data
        self.encryption_key = Fernet.generate_key()
        self.fernet = Fernet(self.encryption_key)

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        await self.close()

    async def close(self):
        """Close session and cleanup resources."""
        if self.session and not self.session.closed:
            await self.session.close()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(aiohttp.ClientError)
    )
    async def authenticate(self, user_token: str, auth_options: Dict = None) -> Dict:
        """Enhanced authentication with HealthKit API including retry and security features."""
        try:
            endpoint = f"{self.api_base_url}/auth"
            start_time = datetime.now(timezone.utc)
            
            # Prepare authentication payload
            payload = {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "user_token": user_token,
                "timestamp": start_time.isoformat(),
                **auth_options if auth_options else {}
            }
            
            # Generate secure JWT token
            auth_token = jwt.encode(
                payload,
                self.client_secret,
                algorithm="HS256"
            )
            
            async with self.session.post(
                endpoint,
                headers={
                    **SECURITY_HEADERS,
                    "Authorization": f"Bearer {auth_token}"
                },
                json=payload
            ) as response:
                # Record metrics
                HEALTHKIT_REQUESTS.labels(
                    endpoint="authenticate",
                    status=response.status
                ).inc()
                
                # Validate response
                if response.status != 200:
                    raise HealthDataException(
                        f"Authentication failed with status {response.status}",
                        error_details={"endpoint": endpoint}
                    )
                
                result = await response.json()
                
                # Record latency
                HEALTHKIT_LATENCY.labels(
                    endpoint="authenticate"
                ).observe(
                    (datetime.now(timezone.utc) - start_time).total_seconds()
                )
                
                return result

        except Exception as e:
            raise HealthDataException(
                f"HealthKit authentication error: {str(e)}",
                error_details={"endpoint": endpoint}
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(aiohttp.ClientError)
    )
    async def fetch_health_data(
        self,
        user_id: str,
        metric_types: List[str],
        start_date: datetime,
        end_date: datetime,
        options: Dict = None
    ) -> List[Dict]:
        """Fetch health data from HealthKit with enhanced security and validation."""
        try:
            endpoint = f"{self.api_base_url}/health-data"
            start_time = datetime.now(timezone.utc)
            
            # Validate metric types
            invalid_metrics = [m for m in metric_types if m not in SUPPORTED_METRICS]
            if invalid_metrics:
                raise ValueError(f"Unsupported metric types: {invalid_metrics}")
            
            # Prepare request payload
            payload = {
                "user_id": user_id,
                "metric_types": metric_types,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                **options if options else {}
            }
            
            async with self.session.get(
                endpoint,
                headers=SECURITY_HEADERS,
                params=payload
            ) as response:
                # Record metrics
                HEALTHKIT_REQUESTS.labels(
                    endpoint="fetch_health_data",
                    status=response.status
                ).inc()
                
                if response.status != 200:
                    raise HealthDataException(
                        f"Health data fetch failed with status {response.status}",
                        error_details={"endpoint": endpoint}
                    )
                
                data = await response.json()
                
                # Convert to FHIR format
                fhir_data = [
                    self.fhir_service.metric_to_observation(metric)
                    for metric in data
                ]
                
                # Record latency
                HEALTHKIT_LATENCY.labels(
                    endpoint="fetch_health_data"
                ).observe(
                    (datetime.now(timezone.utc) - start_time).total_seconds()
                )
                
                return fhir_data

        except Exception as e:
            raise HealthDataException(
                f"HealthKit data fetch error: {str(e)}",
                error_details={"endpoint": endpoint}
            )

def validate_healthkit_response(response: Dict, validation_options: Dict = None) -> Dict:
    """Enhanced validation of HealthKit API responses with security checks."""
    try:
        # Validate response structure
        required_fields = ["status", "data", "metadata"]
        missing_fields = [f for f in required_fields if f not in response]
        if missing_fields:
            raise ValueError(f"Missing required fields: {missing_fields}")
        
        # Validate security headers
        headers = response.get("headers", {})
        for header, value in SECURITY_HEADERS.items():
            if header not in headers or headers[header] != value:
                raise ValueError(f"Missing or invalid security header: {header}")
        
        # Validate data format
        if "data" in response:
            for item in response["data"]:
                if "metric_type" in item and item["metric_type"] not in SUPPORTED_METRICS:
                    raise ValueError(f"Unsupported metric type: {item['metric_type']}")
        
        # Apply custom validation options
        if validation_options:
            for validator in validation_options.get("custom_validators", []):
                validator(response)
        
        return {
            "valid": True,
            "data": response["data"],
            "metadata": response["metadata"]
        }

    except Exception as e:
        return {
            "valid": False,
            "error": str(e),
            "data": None
        }