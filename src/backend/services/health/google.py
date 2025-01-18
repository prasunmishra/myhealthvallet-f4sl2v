"""
Google Fit API integration service for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides secure, HIPAA-compliant synchronization of health metrics between Google Fit and PHRSAT.

Version: 1.0.0
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import aiohttp  # version 3.8+
from tenacity import retry, stop_after_attempt, wait_exponential  # version 8.0+
from cachetools import TTLCache  # version 5.3+
from circuitbreaker import circuit  # version 1.4+
from cryptography.fernet import Fernet  # version 41.0+
from prometheus_client import Counter, Histogram  # version 0.17+

from api.health.models import HealthMetric, HealthPlatformSync
from services.integration.client import HealthPlatformClient

# API Configuration
GOOGLE_FIT_API_BASE_URL = "https://www.googleapis.com/fitness/v1"

# Data type mappings for Google Fit
GOOGLE_FIT_DATA_TYPES = {
    "heart_rate": "com.google.heart_rate.bpm",
    "steps": "com.google.step_count.delta",
    "weight": "com.google.weight",
    "height": "com.google.height",
    "blood_pressure": "com.google.blood_pressure",
    "sleep": "com.google.sleep.segment"
}

# Unit mappings for standardization
GOOGLE_FIT_UNIT_MAPPING = {
    "bpm": "beats/minute",
    "count": "steps",
    "kg": "kilogram",
    "m": "meter",
    "mmHg": "mm[Hg]",
    "min": "minutes"
}

# Error mappings for standardized handling
GOOGLE_FIT_ERROR_MAPPING = {
    "401": "InvalidCredentials",
    "403": "PermissionDenied",
    "429": "RateLimitExceeded",
    "500": "ServerError"
}

# Metrics for monitoring
google_fit_requests = Counter(
    'google_fit_requests_total',
    'Total Google Fit API requests',
    ['endpoint', 'status']
)

google_fit_latency = Histogram(
    'google_fit_request_latency_seconds',
    'Google Fit API request latency',
    ['endpoint']
)

@circuit(failure_threshold=5, recovery_timeout=60)
class GoogleFitClient(HealthPlatformClient):
    """Enhanced client for secure and monitored interaction with Google Fit REST API."""

    def __init__(self, config: Dict[str, Any]) -> None:
        """Initialize Google Fit client with enhanced security and monitoring."""
        super().__init__(
            base_url=GOOGLE_FIT_API_BASE_URL,
            headers={
                "X-HIPAA-Compliance": "enabled",
                "X-Security-Version": "1.0"
            }
        )
        
        self.oauth_config = {
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "redirect_uri": config["redirect_uri"],
            "token_uri": "https://oauth2.googleapis.com/token",
            "scope": ["https://www.googleapis.com/auth/fitness.activity.read",
                     "https://www.googleapis.com/auth/fitness.body.read",
                     "https://www.googleapis.com/auth/fitness.heart_rate.read"]
        }
        
        # Initialize connection pool
        self.session_pool = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(ssl=True, limit=10)
        )
        
        # Initialize cache with TTL
        self.response_cache = TTLCache(maxsize=1000, ttl=300)  # 5 minutes cache

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def get_oauth_token(self, auth_code: str) -> Dict[str, Any]:
        """Securely exchange authorization code for Google OAuth tokens."""
        try:
            with google_fit_latency.labels('token_exchange').time():
                response = await self.make_request(
                    method="POST",
                    endpoint="oauth2/token",
                    data={
                        "code": auth_code,
                        "client_id": self.oauth_config["client_id"],
                        "client_secret": self.oauth_config["client_secret"],
                        "redirect_uri": self.oauth_config["redirect_uri"],
                        "grant_type": "authorization_code"
                    }
                )
                
                google_fit_requests.labels(
                    endpoint='token_exchange',
                    status='success'
                ).inc()
                
                return response
                
        except Exception as e:
            google_fit_requests.labels(
                endpoint='token_exchange',
                status='error'
            ).inc()
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def fetch_metrics(
        self,
        metric_types: List[str],
        start_date: datetime,
        end_date: datetime,
        access_token: str
    ) -> List[Dict[str, Any]]:
        """Securely fetch and process health metrics from Google Fit API."""
        metrics = []
        
        for metric_type in metric_types:
            cache_key = f"{metric_type}:{start_date}:{end_date}"
            
            # Check cache first
            if cache_key in self.response_cache:
                return self.response_cache[cache_key]
            
            data_type = map_google_fit_type(metric_type)
            
            try:
                with google_fit_latency.labels('fetch_metrics').time():
                    response = await self.make_request(
                        method="GET",
                        endpoint=f"users/me/dataset:aggregate",
                        headers={"Authorization": f"Bearer {access_token}"},
                        data={
                            "aggregateBy": [{
                                "dataTypeName": data_type
                            }],
                            "startTimeMillis": int(start_date.timestamp() * 1000),
                            "endTimeMillis": int(end_date.timestamp() * 1000)
                        }
                    )
                    
                    google_fit_requests.labels(
                        endpoint='fetch_metrics',
                        status='success'
                    ).inc()
                    
                    # Process and normalize metrics
                    for bucket in response.get("bucket", []):
                        for dataset in bucket.get("dataset", []):
                            for point in dataset.get("point", []):
                                metric = self.normalize_metric(point, metric_type)
                                metrics.append(metric)
                    
                    # Update cache
                    self.response_cache[cache_key] = metrics
                    
            except Exception as e:
                google_fit_requests.labels(
                    endpoint='fetch_metrics',
                    status='error'
                ).inc()
                raise
                
        return metrics

    def normalize_metric(
        self,
        raw_metric: Dict[str, Any],
        metric_type: str
    ) -> HealthMetric:
        """Convert Google Fit format to internal metric format with FHIR compliance."""
        value = raw_metric["value"][0]["fpVal"]
        start_time = datetime.fromtimestamp(
            int(raw_metric["startTimeNanos"]) / 1e9,
            tz=timezone.utc
        )
        
        # Convert units to FHIR standard
        google_unit = raw_metric["value"][0].get("unit", "")
        fhir_unit = convert_google_fit_unit(google_unit, metric_type)
        
        metric = HealthMetric(
            metric_type=metric_type,
            value=value,
            unit=fhir_unit,
            recorded_at=start_time,
            source="Google Fit",
            raw_data=raw_metric
        )
        
        # Validate metric before returning
        if not metric.validate_metric_type(metric_type):
            raise ValueError(f"Invalid metric type: {metric_type}")
            
        return metric

def map_google_fit_type(metric_type: str) -> str:
    """Map internal metric type to Google Fit data type with validation."""
    if metric_type not in GOOGLE_FIT_DATA_TYPES:
        raise ValueError(f"Unsupported metric type: {metric_type}")
    return GOOGLE_FIT_DATA_TYPES[metric_type]

def convert_google_fit_unit(google_unit: str, metric_type: str) -> str:
    """Convert Google Fit unit to FHIR-compliant internal unit format."""
    if not google_unit:
        return GOOGLE_FIT_UNIT_MAPPING.get(metric_type, "")
    return GOOGLE_FIT_UNIT_MAPPING.get(google_unit, google_unit)