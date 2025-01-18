"""
Core health data service module for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements secure health data operations, platform integrations, and data synchronization
with comprehensive monitoring and error handling.

Version: 1.0.0
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import structlog  # structlog v23.1.0
import tenacity  # tenacity v8.2+
from security_audit_logger import SecurityAuditLogger  # security-audit-logger v2.1.0
from performance_monitor import PerformanceMonitor  # performance-monitor v1.2.0

from api.health.models import HealthMetric
from core.config import settings
from core.constants import HealthDataFormat, DocumentStatus

# Global constants
SYNC_BATCH_SIZE = 100
MAX_SYNC_ATTEMPTS = 3
DEFAULT_SYNC_WINDOW_DAYS = 30
SECURITY_AUDIT_ENABLED = True
PERFORMANCE_MONITORING_ENABLED = True
MAX_CONCURRENT_SYNCS = 5

# Configure structured logging
logger = structlog.get_logger(__name__)

class HealthDataService:
    """
    Enhanced service class for managing health data operations with comprehensive
    security, monitoring, and error handling capabilities.
    """

    def __init__(self, user_id: str, security_config: Dict[str, Any], 
                 monitoring_config: Dict[str, Any]):
        """Initialize health data service with enhanced security and monitoring."""
        self.user_id = user_id
        
        # Initialize structured logger with context
        self.logger = logger.bind(
            user_id=user_id,
            service="HealthDataService"
        )
        
        # Initialize security audit logger
        self.audit_logger = SecurityAuditLogger(
            app_name=settings.APP_NAME,
            component="HealthDataService",
            security_config=security_config
        )
        
        # Initialize performance monitoring
        self.monitor = PerformanceMonitor(
            service_name="HealthDataService",
            config=monitoring_config
        )
        
        # Initialize platform clients with security context
        self.platform_clients = {}
        self._initialize_platform_clients()
        
        self.logger.info("HealthDataService initialized", 
                        security_enabled=SECURITY_AUDIT_ENABLED,
                        monitoring_enabled=PERFORMANCE_MONITORING_ENABLED)

    def _initialize_platform_clients(self):
        """Initialize health platform clients with security context."""
        try:
            # Initialize supported platform clients
            if settings.FEATURE_FLAGS.get("enable_apple_health", True):
                self.platform_clients["apple_health"] = self._create_apple_health_client()
            
            if settings.FEATURE_FLAGS.get("enable_google_fit", True):
                self.platform_clients["google_fit"] = self._create_google_fit_client()
            
            if settings.FEATURE_FLAGS.get("enable_fitbit", True):
                self.platform_clients["fitbit"] = self._create_fitbit_client()
                
            self.logger.info("Platform clients initialized",
                           platforms=list(self.platform_clients.keys()))
                           
        except Exception as e:
            self.logger.error("Failed to initialize platform clients", error=str(e))
            raise RuntimeError("Platform client initialization failed") from e

    @tenacity.retry(
        stop=tenacity.stop_after_attempt(MAX_SYNC_ATTEMPTS),
        retry=tenacity.retry_if_exception_type(Exception),
        wait=tenacity.wait_exponential(multiplier=1, min=4, max=10)
    )
    async def sync_platform_data(
        self,
        platform: str,
        start_date: datetime,
        end_date: datetime,
        metric_types: List[str],
        sync_options: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Synchronize health data from specified platform with comprehensive error handling
        and monitoring.
        """
        sync_id = f"sync_{platform}_{datetime.now(timezone.utc).timestamp()}"
        
        # Start monitoring
        with self.monitor.measure(f"platform_sync_{platform}"):
            try:
                # Validate inputs
                if platform not in self.platform_clients:
                    raise ValueError(f"Unsupported platform: {platform}")
                
                for metric_type in metric_types:
                    if not HealthMetric.validate_metric_type(metric_type):
                        raise ValueError(f"Invalid metric type: {metric_type}")
                
                # Initialize sync tracking
                sync_status = {
                    "id": sync_id,
                    "platform": platform,
                    "status": DocumentStatus.PROCESSING.value,
                    "metrics_processed": 0,
                    "errors": []
                }
                
                # Audit log sync start
                self.audit_logger.log_event(
                    event_type="health_data_sync_started",
                    user_id=self.user_id,
                    platform=platform,
                    sync_id=sync_id
                )
                
                # Get platform client
                client = self.platform_clients[platform]
                
                # Process data in batches
                processed_metrics = []
                for batch in self._get_data_batches(client, start_date, end_date, 
                                                  metric_types, SYNC_BATCH_SIZE):
                    # Validate and transform batch data
                    validated_metrics = self._validate_metrics_batch(batch)
                    
                    # Store metrics
                    stored_metrics = await self._store_metrics_batch(validated_metrics)
                    processed_metrics.extend(stored_metrics)
                    
                    sync_status["metrics_processed"] += len(stored_metrics)
                
                # Update sync status
                sync_status["status"] = DocumentStatus.COMPLETED.value
                sync_status["completed_at"] = datetime.now(timezone.utc).isoformat()
                sync_status["total_metrics"] = len(processed_metrics)
                
                # Audit log sync completion
                self.audit_logger.log_event(
                    event_type="health_data_sync_completed",
                    user_id=self.user_id,
                    platform=platform,
                    sync_id=sync_id,
                    metrics_count=len(processed_metrics)
                )
                
                self.logger.info("Platform sync completed successfully",
                               sync_id=sync_id,
                               metrics_count=len(processed_metrics))
                
                return sync_status
                
            except Exception as e:
                # Update sync status with error
                sync_status["status"] = DocumentStatus.FAILED.value
                sync_status["error"] = str(e)
                
                # Audit log sync failure
                self.audit_logger.log_event(
                    event_type="health_data_sync_failed",
                    user_id=self.user_id,
                    platform=platform,
                    sync_id=sync_id,
                    error=str(e)
                )
                
                self.logger.error("Platform sync failed",
                                sync_id=sync_id,
                                error=str(e))
                
                raise

    async def _store_metrics_batch(
        self,
        metrics: List[Dict[str, Any]]
    ) -> List[HealthMetric]:
        """Store a batch of health metrics with validation and error handling."""
        stored_metrics = []
        
        for metric_data in metrics:
            try:
                metric = HealthMetric(
                    user_id=self.user_id,
                    **metric_data
                )
                await metric.save()
                stored_metrics.append(metric)
                
            except Exception as e:
                self.logger.error("Failed to store metric",
                                metric_type=metric_data.get("metric_type"),
                                error=str(e))
                
        return stored_metrics

    def _validate_metrics_batch(
        self,
        metrics: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Validate a batch of health metrics before storage."""
        validated_metrics = []
        
        for metric_data in metrics:
            try:
                # Validate metric type
                if not HealthMetric.validate_metric_type(metric_data["metric_type"]):
                    raise ValueError(f"Invalid metric type: {metric_data['metric_type']}")
                
                # Validate required fields
                required_fields = ["value", "unit", "recorded_at"]
                for field in required_fields:
                    if field not in metric_data:
                        raise ValueError(f"Missing required field: {field}")
                
                validated_metrics.append(metric_data)
                
            except Exception as e:
                self.logger.error("Metric validation failed",
                                metric_data=metric_data,
                                error=str(e))
                
        return validated_metrics

    def _get_data_batches(
        self,
        client: Any,
        start_date: datetime,
        end_date: datetime,
        metric_types: List[str],
        batch_size: int
    ):
        """Generator for retrieving data in batches from health platforms."""
        current_date = start_date
        
        while current_date < end_date:
            batch_end = min(
                current_date + timedelta(days=1),
                end_date
            )
            
            try:
                batch_data = client.get_metrics(
                    start_date=current_date,
                    end_date=batch_end,
                    metric_types=metric_types
                )
                
                if batch_data:
                    yield batch_data
                    
            except Exception as e:
                self.logger.error("Failed to retrieve data batch",
                                start_date=current_date,
                                end_date=batch_end,
                                error=str(e))
                
            current_date = batch_end

def create_health_data_service(
    user_id: str,
    security_config: Dict[str, Any],
    monitoring_config: Dict[str, Any]
) -> HealthDataService:
    """
    Factory function to create a configured HealthDataService instance with security
    and monitoring.
    """
    try:
        # Validate configurations
        if not security_config:
            raise ValueError("Security configuration is required")
        if not monitoring_config:
            raise ValueError("Monitoring configuration is required")
            
        # Create service instance
        service = HealthDataService(
            user_id=user_id,
            security_config=security_config,
            monitoring_config=monitoring_config
        )
        
        return service
        
    except Exception as e:
        logger.error("Failed to create HealthDataService",
                    user_id=user_id,
                    error=str(e))
        raise