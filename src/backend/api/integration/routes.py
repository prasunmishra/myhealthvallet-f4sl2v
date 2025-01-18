"""
FastAPI router implementation for health platform integration endpoints.
Provides secure, HIPAA-compliant platform connections and data synchronization.

Version: 1.0.0
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Security, status
from pydantic import BaseModel, Field

from api.integration.services import IntegrationService
from core.logging import get_logger
from core.security import SecurityManager
from core.config import settings

# Initialize router with prefix and tags
router = APIRouter(
    prefix="/api/v1/integration",
    tags=["integration"]
)

# Initialize logger with security context
logger = get_logger(
    "integration_routes",
    security_context={"service": "integration", "component": "routes"}
)

# Initialize security manager
security_manager = SecurityManager(settings)

# Request/Response Models
class PlatformConnectionCreate(BaseModel):
    """Request model for platform connection creation."""
    platform_type: str = Field(..., description="Type of health platform to connect")
    oauth_tokens: Dict[str, str] = Field(..., description="OAuth credentials")
    platform_config: Dict = Field(default={}, description="Platform-specific configuration")
    
    class Config:
        schema_extra = {
            "example": {
                "platform_type": "apple_health",
                "oauth_tokens": {
                    "access_token": "access_token_value",
                    "refresh_token": "refresh_token_value",
                    "expires_at": "2024-01-01T00:00:00Z"
                },
                "platform_config": {
                    "permissions": ["activity", "heart_rate"]
                }
            }
        }

class PlatformConnectionResponse(BaseModel):
    """Response model for platform connection details."""
    id: str = Field(..., description="Integration ID")
    platform_type: str = Field(..., description="Connected platform type")
    status: str = Field(..., description="Connection status")
    connected_at: datetime = Field(..., description="Connection timestamp")
    metadata: Dict = Field(default={}, description="Connection metadata")

class SyncRequest(BaseModel):
    """Request model for data synchronization."""
    sync_options: Optional[Dict] = Field(
        default={},
        description="Synchronization options and filters"
    )

class SyncResponse(BaseModel):
    """Response model for synchronization results."""
    success: bool = Field(..., description="Sync operation success status")
    records_synced: int = Field(..., description="Number of records synchronized")
    sync_timestamp: datetime = Field(..., description="Sync completion timestamp")
    details: Dict = Field(default={}, description="Sync operation details")

@router.post(
    "/platforms/connect",
    response_model=PlatformConnectionResponse,
    status_code=status.HTTP_201_CREATED,
    description="Connect a new health platform integration"
)
async def connect_health_platform(
    connection_data: PlatformConnectionCreate,
    background_tasks: BackgroundTasks,
    current_user: str = Security(get_current_user, scopes=["integration:write"])
) -> PlatformConnectionResponse:
    """
    Create a new health platform integration with HIPAA-compliant security.
    
    Args:
        connection_data: Platform connection details and OAuth credentials
        background_tasks: FastAPI background tasks handler
        current_user: Authenticated user ID
        
    Returns:
        Created platform connection details
    """
    try:
        logger.info(
            f"Initiating platform connection for user {current_user}",
            extra={"platform_type": connection_data.platform_type}
        )
        
        # Initialize integration service
        integration_service = IntegrationService(current_user)
        
        # Create platform connection
        integration = await integration_service.connect_platform(
            platform_type=connection_data.platform_type,
            oauth_tokens=connection_data.oauth_tokens,
            platform_config=connection_data.platform_config
        )
        
        # Schedule connection health check
        background_tasks.add_task(
            integration_service.validate_connection_health,
            integration.id
        )
        
        logger.info(
            f"Platform connection successful for user {current_user}",
            extra={"integration_id": integration.id}
        )
        
        return PlatformConnectionResponse(
            id=integration.id,
            platform_type=integration.platform_type,
            status="connected",
            connected_at=datetime.now(timezone.utc),
            metadata=integration.metadata
        )
        
    except Exception as e:
        logger.error(
            f"Platform connection failed: {str(e)}",
            extra={"error": str(e), "user_id": current_user},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to establish platform connection"
        )

@router.post(
    "/platforms/{integration_id}/sync",
    response_model=SyncResponse,
    description="Synchronize data from connected health platform"
)
async def sync_platform_data(
    integration_id: str,
    sync_request: SyncRequest,
    background_tasks: BackgroundTasks,
    current_user: str = Security(get_current_user, scopes=["integration:write"])
) -> SyncResponse:
    """
    Synchronize health data from connected platform with HIPAA compliance.
    
    Args:
        integration_id: ID of the platform integration
        sync_request: Synchronization options and filters
        background_tasks: FastAPI background tasks handler
        current_user: Authenticated user ID
        
    Returns:
        Synchronization operation results
    """
    try:
        logger.info(
            f"Initiating platform sync for integration {integration_id}",
            extra={"user_id": current_user}
        )
        
        # Initialize integration service
        integration_service = IntegrationService(current_user)
        
        # Perform sync operation
        success, sync_results = await integration_service.sync_platform_data(
            integration_id=integration_id,
            sync_options=sync_request.sync_options
        )
        
        logger.info(
            f"Platform sync completed for integration {integration_id}",
            extra={"success": success, "records_synced": sync_results.get("record_count", 0)}
        )
        
        return SyncResponse(
            success=success,
            records_synced=sync_results.get("record_count", 0),
            sync_timestamp=datetime.now(timezone.utc),
            details=sync_results
        )
        
    except Exception as e:
        logger.error(
            f"Platform sync failed: {str(e)}",
            extra={"error": str(e), "integration_id": integration_id},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to synchronize platform data"
        )

@router.get(
    "/platforms",
    response_model=List[PlatformConnectionResponse],
    description="List connected health platforms"
)
async def list_platform_connections(
    current_user: str = Security(get_current_user, scopes=["integration:read"])
) -> List[PlatformConnectionResponse]:
    """
    Retrieve list of connected health platforms for the user.
    
    Args:
        current_user: Authenticated user ID
        
    Returns:
        List of platform connection details
    """
    try:
        # Initialize integration service
        integration_service = IntegrationService(current_user)
        
        # Get user's platform connections
        connections = await integration_service.list_connections()
        
        return [
            PlatformConnectionResponse(
                id=conn.id,
                platform_type=conn.platform_type,
                status=conn.status,
                connected_at=conn.connected_at,
                metadata=conn.metadata
            )
            for conn in connections
        ]
        
    except Exception as e:
        logger.error(
            f"Failed to list platform connections: {str(e)}",
            extra={"error": str(e), "user_id": current_user},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve platform connections"
        )

# Export router
__all__ = ["router"]