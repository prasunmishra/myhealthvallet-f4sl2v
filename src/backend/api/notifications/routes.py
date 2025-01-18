"""
FastAPI router implementation for secure, HIPAA-compliant notification endpoints
with real-time WebSocket support in the PHRSAT system.

Version: 1.0.0
"""

from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Security, WebSocket, WebSocketDisconnect, status
from fastapi_limiter import RateLimiter  # v0.1.5+
from fastapi_websockets import WebSocketManager  # v0.1.0+
import structlog  # v22.1+

from api.notifications.handlers import NotificationHandler
from core.config import Settings
from core.security import SecurityManager

# Configure structured logger
logger = structlog.get_logger(__name__)

# Constants
NOTIFICATION_ROUTER_PREFIX = "/notifications"
NOTIFICATION_ROUTER_TAGS = ["notifications"]
RATE_LIMIT_DEFAULT = 100
RATE_LIMIT_PERIOD = 3600  # 1 hour
WEBSOCKET_HEARTBEAT_INTERVAL = 30  # seconds

# Initialize WebSocket manager
websocket_manager = WebSocketManager()

def create_notification_router(
    auth_middleware,
    rate_limiter: RateLimiter
) -> APIRouter:
    """Create and configure the notification router with security middleware."""
    
    router = APIRouter(
        prefix=NOTIFICATION_ROUTER_PREFIX,
        tags=NOTIFICATION_ROUTER_TAGS
    )
    
    settings = Settings()
    security_manager = SecurityManager(settings)
    
    @router.post("/", 
                response_model=Dict,
                status_code=status.HTTP_201_CREATED)
    @rate_limiter.limit(f"{RATE_LIMIT_DEFAULT}/hour")
    async def create_notification(
        notification_data: Dict,
        user_id: UUID = Security(auth_middleware),
        handler: NotificationHandler = Depends()
    ) -> Dict:
        """Create a new HIPAA-compliant notification."""
        try:
            security_context = {
                "user_id": str(user_id),
                "encryption_key": settings.ENCRYPTION_KEY,
                "phi_authorized": True
            }
            
            result = await handler.create_notification(
                notification_data=notification_data,
                security_context=security_context,
                user_id=user_id
            )
            
            # Notify connected WebSocket clients
            await websocket_manager.broadcast(
                {"type": "notification.created", "data": result}
            )
            
            return result
            
        except Exception as e:
            logger.error(
                "Notification creation failed",
                error=str(e),
                user_id=str(user_id)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create notification"
            )

    @router.get("/", response_model=List[Dict])
    @rate_limiter.limit(f"{RATE_LIMIT_DEFAULT}/hour")
    async def get_notifications(
        user_id: UUID = Security(auth_middleware),
        handler: NotificationHandler = Depends(),
        page: int = 1,
        limit: int = 50,
        type: Optional[str] = None
    ) -> List[Dict]:
        """Get user notifications with pagination and filtering."""
        try:
            return await handler.get_notifications(
                user_id=user_id,
                page=page,
                limit=limit,
                type=type
            )
        except Exception as e:
            logger.error(
                "Failed to retrieve notifications",
                error=str(e),
                user_id=str(user_id)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve notifications"
            )

    @router.get("/{notification_id}", response_model=Dict)
    async def get_notification(
        notification_id: UUID,
        user_id: UUID = Security(auth_middleware),
        handler: NotificationHandler = Depends()
    ) -> Dict:
        """Get specific notification by ID with security validation."""
        try:
            notification = await handler.get_notification(
                notification_id=notification_id,
                user_id=user_id
            )
            if not notification:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Notification not found"
                )
            return notification
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Failed to retrieve notification",
                error=str(e),
                notification_id=str(notification_id)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve notification"
            )

    @router.put("/{notification_id}", response_model=Dict)
    async def update_notification(
        notification_id: UUID,
        update_data: Dict,
        user_id: UUID = Security(auth_middleware),
        handler: NotificationHandler = Depends()
    ) -> Dict:
        """Update notification with security validation."""
        try:
            updated = await handler.update_notification(
                notification_id=notification_id,
                user_id=user_id,
                update_data=update_data
            )
            if not updated:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Notification not found"
                )
            return updated
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Failed to update notification",
                error=str(e),
                notification_id=str(notification_id)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update notification"
            )

    @router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_notification(
        notification_id: UUID,
        user_id: UUID = Security(auth_middleware),
        handler: NotificationHandler = Depends()
    ):
        """Delete notification with security validation."""
        try:
            deleted = await handler.delete_notification(
                notification_id=notification_id,
                user_id=user_id
            )
            if not deleted:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Notification not found"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Failed to delete notification",
                error=str(e),
                notification_id=str(notification_id)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete notification"
            )

    @router.websocket("/ws")
    async def notifications_websocket(
        websocket: WebSocket,
        user_id: UUID = Security(auth_middleware)
    ):
        """WebSocket endpoint for real-time notifications."""
        try:
            await websocket_manager.connect(websocket, str(user_id))
            
            # Subscribe to user's notifications
            handler = NotificationHandler()
            await handler.subscribe_to_notifications(user_id, websocket)
            
            while True:
                try:
                    # Handle WebSocket messages
                    data = await websocket.receive_json()
                    
                    # Process message based on type
                    if data.get("type") == "heartbeat":
                        await websocket.send_json({"type": "heartbeat_ack"})
                    
                except WebSocketDisconnect:
                    await websocket_manager.disconnect(str(user_id))
                    break
                    
        except Exception as e:
            logger.error(
                "WebSocket connection error",
                error=str(e),
                user_id=str(user_id)
            )
            await websocket_manager.disconnect(str(user_id))

    return router

# Create router instance
notification_router = create_notification_router(
    auth_middleware=None,  # To be injected by application
    rate_limiter=RateLimiter()
)