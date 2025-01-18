"""
Integration service module for managing secure health platform integrations.
Implements HIPAA-compliant OAuth flows and data synchronization with comprehensive monitoring.

Version: 1.0.0
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from prometheus_client import Counter, Histogram  # prometheus-client v0.17+
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.2+
from cryptography.fernet import Fernet  # cryptography v41.0+

from api.integration.models import PlatformIntegration, OAuthCredential
from core.config import settings
from core.security import SecurityManager

# Configure logging
logger = logging.getLogger(__name__)

# Constants
SYNC_BATCH_SIZE = 1000
MAX_SYNC_DAYS = 30
MAX_RETRY_ATTEMPTS = 3
RATE_LIMIT_REQUESTS = 100
RATE_LIMIT_PERIOD = 60
ENCRYPTION_ALGORITHM = "AES-256-GCM"
AUDIT_LOG_RETENTION_DAYS = 365

# Prometheus metrics
METRICS_PREFIX = "phrsat_integration"
sync_attempts = Counter(
    f"{METRICS_PREFIX}_sync_attempts_total",
    "Total number of platform sync attempts",
    ["platform", "status"]
)
sync_duration = Histogram(
    f"{METRICS_PREFIX}_sync_duration_seconds",
    "Duration of platform sync operations",
    ["platform"]
)
oauth_errors = Counter(
    f"{METRICS_PREFIX}_oauth_errors_total",
    "Total number of OAuth-related errors",
    ["platform", "error_type"]
)

class IntegrationService:
    """
    Service class for managing secure health platform integrations with HIPAA compliance.
    Implements OAuth flows, data synchronization, and comprehensive monitoring.
    """
    
    def __init__(self, user_id: str):
        """Initialize integration service with security and monitoring."""
        self.user_id = user_id
        self._security_manager = SecurityManager(settings)
        self._platform_configs = {}
        self._platform_clients = {}
        
        # Initialize metrics
        self.sync_attempts_counter = sync_attempts
        self.sync_duration_histogram = sync_duration
        
        logger.info(f"IntegrationService initialized for user {user_id}")

    @retry(
        stop=stop_after_attempt(MAX_RETRY_ATTEMPTS),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def connect_platform(
        self,
        platform_type: str,
        oauth_tokens: Dict[str, str],
        platform_config: Dict[str, any]
    ) -> PlatformIntegration:
        """
        Securely connect a new health platform integration with HIPAA compliance.
        
        Args:
            platform_type: Type of health platform to connect
            oauth_tokens: OAuth credentials for the platform
            platform_config: Platform-specific configuration
            
        Returns:
            Created PlatformIntegration instance
        """
        try:
            # Validate platform type
            if not PlatformIntegration.validate_platform_type(platform_type):
                raise ValueError(f"Unsupported platform type: {platform_type}")
            
            # Encrypt OAuth tokens
            encrypted_tokens = {
                "access_token": self._security_manager.encrypt_phi(oauth_tokens["access_token"]),
                "refresh_token": self._security_manager.encrypt_phi(oauth_tokens["refresh_token"]),
                "token_expiry": oauth_tokens["expires_at"]
            }
            
            # Create OAuth credentials
            oauth_cred = OAuthCredential(
                user_id=self.user_id,
                platform_type=platform_type,
                **encrypted_tokens
            )
            await oauth_cred.save()
            
            # Create platform integration
            integration = PlatformIntegration(
                user_id=self.user_id,
                platform_type=platform_type,
                platform_config=platform_config,
                metadata={
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "encryption_algorithm": ENCRYPTION_ALGORITHM,
                    "compliance_version": "HIPAA-2023"
                }
            )
            await integration.save()
            
            # Initialize platform client
            await self._initialize_platform_client(integration, oauth_cred)
            
            logger.info(f"Successfully connected {platform_type} for user {self.user_id}")
            return integration
            
        except Exception as e:
            oauth_errors.labels(
                platform=platform_type,
                error_type="connection_error"
            ).inc()
            logger.error(f"Platform connection failed: {str(e)}")
            raise

    async def sync_platform_data(
        self,
        integration_id: str,
        sync_options: Optional[Dict] = None
    ) -> Tuple[bool, Dict]:
        """
        Synchronize health data from connected platform with HIPAA compliance.
        
        Args:
            integration_id: ID of the platform integration
            sync_options: Optional synchronization parameters
            
        Returns:
            Tuple of (success status, sync results)
        """
        integration = await PlatformIntegration.objects.get(id=integration_id)
        if not integration:
            raise ValueError(f"Integration not found: {integration_id}")
            
        try:
            # Start sync metrics
            start_time = datetime.now(timezone.utc)
            self.sync_attempts_counter.labels(
                platform=integration.platform_type,
                status="started"
            ).inc()
            
            # Update sync status
            await integration.update_sync_status(
                status="in_progress",
                sync_metadata={"start_time": start_time.isoformat()}
            )
            
            # Perform HIPAA-compliant sync
            with self.sync_duration_histogram.labels(
                platform=integration.platform_type
            ).time():
                sync_results = await self._perform_secure_sync(integration, sync_options)
            
            # Update completion status
            end_time = datetime.now(timezone.utc)
            await integration.update_sync_status(
                status="completed",
                sync_metadata={
                    "end_time": end_time.isoformat(),
                    "records_synced": sync_results.get("record_count", 0)
                }
            )
            
            logger.info(
                f"Successfully synced {integration.platform_type} data for user {self.user_id}"
            )
            return True, sync_results
            
        except Exception as e:
            self.sync_attempts_counter.labels(
                platform=integration.platform_type,
                status="failed"
            ).inc()
            
            await integration.update_sync_status(
                status="failed",
                error_message=str(e)
            )
            
            logger.error(f"Platform sync failed: {str(e)}")
            return False, {"error": str(e)}

    async def _initialize_platform_client(
        self,
        integration: PlatformIntegration,
        oauth_cred: OAuthCredential
    ) -> None:
        """Initialize secure platform client with OAuth credentials."""
        if not oauth_cred.is_token_valid():
            await self._refresh_oauth_tokens(integration, oauth_cred)
            
        platform_config = integration.platform_config.copy()
        platform_config.update({
            "encryption_key": self._security_manager._encryption_key,
            "audit_enabled": True
        })
        
        self._platform_clients[integration.id] = {
            "client": self._create_platform_client(
                integration.platform_type,
                platform_config
            ),
            "last_used": datetime.now(timezone.utc)
        }

    async def _perform_secure_sync(
        self,
        integration: PlatformIntegration,
        sync_options: Optional[Dict]
    ) -> Dict:
        """Perform HIPAA-compliant data synchronization."""
        client = self._platform_clients.get(integration.id, {}).get("client")
        if not client:
            raise RuntimeError("Platform client not initialized")
            
        sync_options = sync_options or {}
        sync_options.update({
            "batch_size": SYNC_BATCH_SIZE,
            "max_days": MAX_SYNC_DAYS,
            "encryption_enabled": True
        })
        
        return await client.sync_health_data(sync_options)

def create_integration_service(user_id: str) -> IntegrationService:
    """Factory function to create secure IntegrationService instance."""
    return IntegrationService(user_id)