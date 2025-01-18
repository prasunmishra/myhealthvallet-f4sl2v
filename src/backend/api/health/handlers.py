"""
Health API request handlers for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements secure business logic for health metrics, records, and platform integrations
with comprehensive validation and monitoring.

Version: 1.0.0
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from core.config import settings
from core.constants import DocumentStatus, HealthMetricType
from api.health.services import HealthDataService
from api.health.schemas import (
    HealthMetricBase,
    HealthRecordBase,
    PlatformSyncBase,
    HealthAnalyticsBase
)

# Configure structured logging
logger = logging.getLogger(__name__)

# Constants
METRIC_CACHE_TTL = 300  # 5 minutes
MAX_RETRY_ATTEMPTS = 3
BATCH_SIZE = 100

async def handle_create_health_metric(
    metric_data: HealthMetricBase,
    user_id: str,
    security_config: Dict,
    monitoring_config: Dict
) -> Dict:
    """Handle creation of new health metric with validation and security checks."""
    try:
        # Log incoming request with sanitized data
        logger.info(
            "Creating health metric",
            user_id=user_id,
            metric_type=metric_data.metric_type,
            source=metric_data.source
        )

        # Initialize health data service with security context
        health_service = HealthDataService(
            user_id=user_id,
            security_config=security_config,
            monitoring_config=monitoring_config
        )

        # Store metric with retry mechanism
        stored_metric = await health_service.store_health_metric(
            metric_data=metric_data.dict(),
            retry_attempts=MAX_RETRY_ATTEMPTS
        )

        logger.info(
            "Health metric created successfully",
            user_id=user_id,
            metric_id=stored_metric.id
        )

        return {
            "status": "success",
            "metric_id": stored_metric.id,
            "created_at": stored_metric.created_at.isoformat()
        }

    except ValueError as ve:
        logger.error(
            "Validation error creating health metric",
            user_id=user_id,
            error=str(ve)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(
            "Error creating health metric",
            user_id=user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create health metric"
        )

async def handle_get_health_metrics(
    user_id: str,
    metric_types: Optional[List[str]] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    security_config: Dict = None,
    monitoring_config: Dict = None
) -> List[Dict]:
    """Handle retrieval of health metrics with filtering and analytics."""
    try:
        # Validate date range
        if start_date and end_date and end_date <= start_date:
            raise ValueError("End date must be after start date")

        # Initialize health data service
        health_service = HealthDataService(
            user_id=user_id,
            security_config=security_config,
            monitoring_config=monitoring_config
        )

        # Retrieve metrics with caching
        metrics = await health_service.get_health_metrics(
            metric_types=metric_types,
            start_date=start_date,
            end_date=end_date,
            cache_ttl=METRIC_CACHE_TTL
        )

        logger.info(
            "Health metrics retrieved successfully",
            user_id=user_id,
            metric_count=len(metrics)
        )

        return metrics

    except ValueError as ve:
        logger.error(
            "Validation error retrieving health metrics",
            user_id=user_id,
            error=str(ve)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(
            "Error retrieving health metrics",
            user_id=user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve health metrics"
        )

async def handle_create_health_record(
    record_data: HealthRecordBase,
    user_id: str,
    security_config: Dict,
    monitoring_config: Dict
) -> Dict:
    """Handle creation of new health record with document processing."""
    try:
        logger.info(
            "Creating health record",
            user_id=user_id,
            record_type=record_data.record_type
        )

        # Initialize health data service
        health_service = HealthDataService(
            user_id=user_id,
            security_config=security_config,
            monitoring_config=monitoring_config
        )

        # Store record with document processing
        stored_record = await health_service.store_health_record(
            record_data=record_data.dict(),
            process_document=True
        )

        logger.info(
            "Health record created successfully",
            user_id=user_id,
            record_id=stored_record.id
        )

        return {
            "status": "success",
            "record_id": stored_record.id,
            "created_at": stored_record.created_at.isoformat(),
            "processing_status": stored_record.processing_status
        }

    except ValueError as ve:
        logger.error(
            "Validation error creating health record",
            user_id=user_id,
            error=str(ve)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(
            "Error creating health record",
            user_id=user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create health record"
        )

async def handle_sync_platform_data(
    sync_request: PlatformSyncBase,
    user_id: str,
    security_config: Dict,
    monitoring_config: Dict
) -> Dict:
    """Handle health platform data synchronization with progress tracking."""
    try:
        logger.info(
            "Starting platform sync",
            user_id=user_id,
            platform=sync_request.platform
        )

        # Initialize health data service
        health_service = HealthDataService(
            user_id=user_id,
            security_config=security_config,
            monitoring_config=monitoring_config
        )

        # Start sync process
        sync_result = await health_service.sync_platform_data(
            platform=sync_request.platform,
            start_date=sync_request.start_date,
            end_date=sync_request.end_date,
            data_types=sync_request.data_types
        )

        logger.info(
            "Platform sync completed",
            user_id=user_id,
            platform=sync_request.platform,
            metrics_synced=sync_result.get("metrics_processed", 0)
        )

        return {
            "status": "success",
            "sync_id": sync_result["id"],
            "metrics_processed": sync_result["metrics_processed"],
            "completed_at": sync_result.get("completed_at"),
            "status": sync_result["status"]
        }

    except ValueError as ve:
        logger.error(
            "Validation error during platform sync",
            user_id=user_id,
            error=str(ve)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(
            "Error during platform sync",
            user_id=user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync platform data"
        )

async def handle_get_health_analytics(
    analytics_request: HealthAnalyticsBase,
    user_id: str,
    security_config: Dict,
    monitoring_config: Dict
) -> Dict:
    """Handle health data analytics with aggregation and insights."""
    try:
        logger.info(
            "Processing health analytics request",
            user_id=user_id,
            metric_types=analytics_request.metric_types
        )

        # Initialize health data service
        health_service = HealthDataService(
            user_id=user_id,
            security_config=security_config,
            monitoring_config=monitoring_config
        )

        # Process analytics
        analytics_result = await health_service.process_health_analytics(
            metric_types=analytics_request.metric_types,
            start_date=analytics_request.start_date,
            end_date=analytics_request.end_date,
            aggregation=analytics_request.aggregation,
            include_raw_data=analytics_request.include_raw_data
        )

        logger.info(
            "Health analytics processed successfully",
            user_id=user_id,
            analysis_id=analytics_result["id"]
        )

        return analytics_result

    except ValueError as ve:
        logger.error(
            "Validation error processing analytics",
            user_id=user_id,
            error=str(ve)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(
            "Error processing health analytics",
            user_id=user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process health analytics"
        )