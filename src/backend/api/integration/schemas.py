"""
Pydantic schemas for health platform integration requests, responses, and data validation.
Implements comprehensive validation rules and error handling for platform integrations.

Version: 1.0.0
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, constr, validator  # pydantic v2.0+

from api.integration.models import SUPPORTED_PLATFORMS, SYNC_STATUS_TYPES

# Constants for validation
PLATFORM_TYPE_REGEX = r'^[A-Z_]+$'
MAX_METRIC_TYPES = 10
MAX_SYNC_INTERVAL_DAYS = 30

class PlatformConnectionBase(BaseModel):
    """Base schema for platform connection data with enhanced validation."""
    
    user_id: UUID = Field(..., description="Unique identifier of the user")
    platform_type: str = Field(
        ...,
        description="Type of health platform",
        regex=PLATFORM_TYPE_REGEX,
        min_length=3,
        max_length=50
    )
    is_active: bool = Field(
        default=True,
        description="Whether the platform connection is active"
    )
    platform_config: Dict = Field(
        default={},
        description="Platform-specific configuration settings"
    )
    sync_settings: Dict = Field(
        default={
            "frequency": "daily",
            "enabled_metrics": [],
            "last_sync": None
        },
        description="Synchronization configuration and preferences"
    )

    @validator("platform_type")
    def validate_platform_type(cls, value: str) -> str:
        """Validate platform type against supported platforms."""
        if value.upper() not in SUPPORTED_PLATFORMS:
            raise ValueError(
                f"Unsupported platform type. Must be one of: {', '.join(SUPPORTED_PLATFORMS)}"
            )
        return value.upper()

class PlatformConnectionCreate(PlatformConnectionBase):
    """Schema for creating new platform connections with scope validation."""
    
    auth_code: str = Field(
        ...,
        min_length=20,
        max_length=500,
        description="OAuth authorization code"
    )
    scope_permissions: Dict[str, bool] = Field(
        default={},
        description="Platform-specific scope permissions"
    )

    @validator("auth_code")
    def validate_auth_code(cls, value: str) -> str:
        """Validate OAuth authorization code format."""
        if not value or len(value.strip()) < 20:
            raise ValueError("Invalid authorization code format")
            
        # Check if code appears to be expired (basic format check)
        if "." in value:
            try:
                timestamp = float(value.split(".")[-1])
                expiry = datetime.fromtimestamp(timestamp, tz=timezone.utc)
                if expiry < datetime.now(timezone.utc):
                    raise ValueError("Authorization code appears to be expired")
            except (ValueError, IndexError):
                pass
                
        return value.strip()

class PlatformConnectionResponse(PlatformConnectionBase):
    """Schema for platform connection responses with status validation."""
    
    connection_id: UUID = Field(..., description="Unique identifier of the connection")
    connected_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Timestamp when the connection was established"
    )
    last_sync_at: Optional[datetime] = Field(
        None,
        description="Timestamp of the last successful synchronization"
    )
    status: str = Field(
        ...,
        description="Current status of the platform connection"
    )

    @validator("status")
    def validate_status(cls, value: str) -> str:
        """Validate connection status."""
        if value not in SYNC_STATUS_TYPES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(SYNC_STATUS_TYPES)}")
        return value

class SyncRequestSchema(BaseModel):
    """Schema for data synchronization requests with enhanced validation."""
    
    connection_id: UUID = Field(..., description="Platform connection identifier")
    metric_types: List[str] = Field(
        ...,
        max_items=MAX_METRIC_TYPES,
        description="List of health metric types to synchronize"
    )
    start_date: datetime = Field(..., description="Start date for sync interval")
    end_date: datetime = Field(..., description="End date for sync interval")

    @validator("metric_types")
    def validate_metric_types(cls, value: List[str]) -> List[str]:
        """Validate metric types list."""
        if not value:
            raise ValueError("At least one metric type must be specified")
            
        if len(value) > MAX_METRIC_TYPES:
            raise ValueError(f"Maximum of {MAX_METRIC_TYPES} metric types allowed")
            
        return [metric.lower() for metric in value]

    @validator("end_date")
    def validate_date_range(cls, end_date: datetime, values: Dict) -> datetime:
        """Validate sync date range constraints."""
        if "start_date" not in values:
            raise ValueError("start_date is required")
            
        start_date = values["start_date"]
        
        # Check if dates are in the future
        now = datetime.now(timezone.utc)
        if start_date > now or end_date > now:
            raise ValueError("Sync dates cannot be in the future")
            
        # Validate date range
        date_diff = (end_date - start_date).days
        if date_diff < 0:
            raise ValueError("end_date must be after start_date")
            
        if date_diff > MAX_SYNC_INTERVAL_DAYS:
            raise ValueError(f"Sync interval cannot exceed {MAX_SYNC_INTERVAL_DAYS} days")
            
        return end_date

class SyncHistoryResponse(BaseModel):
    """Schema for sync history responses with detailed error handling."""
    
    sync_id: UUID = Field(..., description="Unique identifier of the sync operation")
    status: str = Field(
        ...,
        description="Status of the sync operation"
    )
    started_at: datetime = Field(..., description="Sync start timestamp")
    completed_at: Optional[datetime] = Field(None, description="Sync completion timestamp")
    sync_stats: Dict = Field(
        default={
            "records_processed": 0,
            "records_failed": 0,
            "metrics_synced": {}
        },
        description="Synchronization statistics"
    )
    error_details: Optional[Dict] = Field(
        None,
        description="Detailed error information if sync failed"
    )

    @validator("status")
    def validate_sync_status(cls, value: str) -> str:
        """Validate sync operation status."""
        if value not in SYNC_STATUS_TYPES:
            raise ValueError(f"Invalid sync status. Must be one of: {', '.join(SYNC_STATUS_TYPES)}")
        return value

    @validator("completed_at")
    def validate_completion_time(cls, value: Optional[datetime], values: Dict) -> Optional[datetime]:
        """Validate sync completion timestamp."""
        if value and "started_at" in values:
            if value < values["started_at"]:
                raise ValueError("completed_at cannot be before started_at")
        return value