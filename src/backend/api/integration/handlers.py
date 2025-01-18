"""
FastAPI request handlers for managing external health platform integrations.
Implements secure OAuth flows and data synchronization with HIPAA compliance.

Version: 1.0.0
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from prometheus_client import Counter, Histogram

from api.integration.schemas import PlatformConnectionBase, PlatformConnectionCreate
from api.integration.services import IntegrationService
from core.security import validate_oauth_token
from core.logging import get_logger

# Initialize router with prefix and tags
router = APIRouter(prefix='/api/v1/integration', tags=['integration'])

# Configure logging with security context
logger = get_logger(
    __name__,
    security_context={"module": "integration_handlers", "compliance": "HIPAA"}
)

# Prometheus metrics
SYNC_REQUESTS_COUNTER = Counter(
    'integration_sync_requests_total',
    'Total sync requests by platform',
    ['platform_type']
)

SYNC_DURATION_HISTOGRAM = Histogram(
    'integration_sync_duration_seconds',
    'Sync operation duration',
    ['platform_type']
)

@router.post('/platforms/connect', response_model=Dict)
@validate_oauth_token
async def connect_health_platform(
    connection_data: PlatformConnectionCreate,
    user_id: str,
    request: Request
) -> Dict:
    """
    Securely connect a new health platform integration with HIPAA compliance.
    
    Args:
        connection_data: Platform connection details and OAuth data
        user_id: Authenticated user ID
        request: FastAPI request object
        
    Returns:
        Dict containing connection status and details
    """
    try:
        # Validate platform type
        PlatformConnectionBase.validate_platform_type(connection_data.platform_type)
        
        # Initialize integration service
        integration_service = IntegrationService(user_id)
        
        # Validate connection security parameters
        await integration_service.validate_connection_security(connection_data)
        
        # Create platform connection
        connection = await integration_service.connect_platform(
            platform_type=connection_data.platform_type,
            oauth_tokens={
                "access_token": connection_data.auth_code,
                "refresh_token": connection_data.auth_code,
                "expires_at": datetime.now(timezone.utc)
            },
            platform_config=connection_data.platform_config
        )
        
        # Log audit trail
        logger.info(
            f"Platform connection established: {connection_data.platform_type}",
            extra={
                "user_id": user_id,
                "platform": connection_data.platform_type,
                "event_type": "platform_connection"
            }
        )
        
        return {
            "status": "success",
            "connection_id": str(connection.id),
            "platform_type": connection.platform_type,
            "connected_at": connection.connected_at.isoformat()
        }
        
    except ValueError as ve:
        logger.warning(
            f"Invalid platform connection request: {str(ve)}",
            extra={"user_id": user_id, "error_type": "validation_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
        
    except Exception as e:
        logger.error(
            f"Platform connection failed: {str(e)}",
            extra={"user_id": user_id, "error_type": "connection_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to establish platform connection"
        )

@router.post('/platforms/sync', response_model=Dict)
@validate_oauth_token
async def sync_platform_data(
    sync_request: Dict,
    user_id: str,
    request: Request
) -> Dict:
    """
    Trigger secure synchronization of health data with monitoring.
    
    Args:
        sync_request: Synchronization parameters
        user_id: Authenticated user ID
        request: FastAPI request object
        
    Returns:
        Dict containing sync status and results
    """
    try:
        platform_type = sync_request.get("platform_type")
        if not platform_type:
            raise ValueError("platform_type is required")
            
        # Update metrics
        SYNC_REQUESTS_COUNTER.labels(platform_type=platform_type).inc()
        
        # Initialize integration service
        integration_service = IntegrationService(user_id)
        
        # Start sync operation with monitoring
        with SYNC_DURATION_HISTOGRAM.labels(platform_type=platform_type).time():
            success, results = await integration_service.sync_platform_data(
                integration_id=sync_request.get("connection_id"),
                sync_options=sync_request.get("options")
            )
        
        # Log audit trail
        logger.info(
            f"Platform sync completed: {platform_type}",
            extra={
                "user_id": user_id,
                "platform": platform_type,
                "event_type": "platform_sync",
                "sync_status": "success" if success else "failed"
            }
        )
        
        return {
            "status": "success" if success else "failed",
            "sync_results": results,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except ValueError as ve:
        logger.warning(
            f"Invalid sync request: {str(ve)}",
            extra={"user_id": user_id, "error_type": "validation_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
        
    except Exception as e:
        logger.error(
            f"Platform sync failed: {str(e)}",
            extra={"user_id": user_id, "error_type": "sync_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to synchronize platform data"
        )

@router.get('/platforms/{platform_type}/health')
@validate_oauth_token
async def check_platform_health(
    platform_type: str,
    user_id: str
) -> Dict:
    """
    Check platform connection health and security status.
    
    Args:
        platform_type: Type of health platform
        user_id: Authenticated user ID
        
    Returns:
        Dict containing platform health status
    """
    try:
        # Validate platform type
        PlatformConnectionBase.validate_platform_type(platform_type)
        
        # Initialize integration service
        integration_service = IntegrationService(user_id)
        
        # Check platform health
        health_status = await integration_service.check_platform_health(
            platform_type=platform_type
        )
        
        # Log health check
        logger.info(
            f"Platform health check completed: {platform_type}",
            extra={
                "user_id": user_id,
                "platform": platform_type,
                "event_type": "health_check",
                "status": health_status.get("status")
            }
        )
        
        return health_status
        
    except ValueError as ve:
        logger.warning(
            f"Invalid platform type: {str(ve)}",
            extra={"user_id": user_id, "error_type": "validation_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
        
    except Exception as e:
        logger.error(
            f"Health check failed: {str(e)}",
            extra={"user_id": user_id, "error_type": "health_check_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check platform health"
        )