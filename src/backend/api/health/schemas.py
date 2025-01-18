"""
Pydantic schemas for health-related data validation with FHIR R4 compliance.
Implements comprehensive validation for health metrics, records, and platform synchronization.

Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, List, Optional, Union
from pydantic import BaseModel, Field, validator  # pydantic v2.0+

from api.health.models import (
    ALLOWED_METRIC_TYPES,
    ALLOWED_RECORD_TYPES,
    SUPPORTED_PLATFORMS
)

# Global constants
SCHEMA_VERSION = "1.0.0"
FHIR_VALIDATION_ENABLED = True

class HealthMetricBase(BaseModel):
    """Base schema for health metric data with FHIR R4 compliance."""
    
    metric_type: str = Field(
        ...,
        description="Type of health metric being recorded",
        example="heart_rate"
    )
    value: float = Field(
        ...,
        description="Numeric value of the health metric",
        example=75.0
    )
    unit: str = Field(
        ...,
        description="Unit of measurement",
        example="bpm"
    )
    recorded_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp when the metric was recorded"
    )
    source: str = Field(
        default="manual",
        description="Source of the health metric data",
        example="apple_health"
    )
    raw_data: Optional[Dict] = Field(
        default=None,
        description="Raw data from the source platform"
    )
    tags: Optional[List[str]] = Field(
        default_factory=list,
        description="Custom tags for categorization"
    )
    fhir_mapping: Dict = Field(
        default_factory=dict,
        description="FHIR R4 resource mapping"
    )
    schema_version: str = Field(
        default=SCHEMA_VERSION,
        description="Schema version for compatibility"
    )
    metadata: Optional[Dict] = Field(
        default_factory=dict,
        description="Additional metadata"
    )

    @validator("metric_type")
    def validate_metric_type(cls, value: str) -> str:
        """Validate metric type against allowed types with FHIR compliance."""
        if value not in ALLOWED_METRIC_TYPES:
            raise ValueError(f"Invalid metric type. Must be one of: {ALLOWED_METRIC_TYPES}")
        return value

    @validator("value")
    def validate_value(cls, value: float) -> float:
        """Validate metric value for reasonable ranges."""
        if value < 0:
            raise ValueError("Metric value cannot be negative")
        return value

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class HealthRecordBase(BaseModel):
    """Base schema for health record data with FHIR R4 compliance."""
    
    record_type: str = Field(
        ...,
        description="Type of health record",
        example="lab_report"
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Title of the health record"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Optional description of the record"
    )
    record_date: datetime = Field(
        ...,
        description="Date when the record was created"
    )
    storage_url: str = Field(
        ...,
        description="URL where the record document is stored"
    )
    tags: Optional[List[str]] = Field(
        default_factory=list,
        description="Custom tags for categorization"
    )
    fhir_document_reference: Dict = Field(
        default_factory=dict,
        description="FHIR DocumentReference resource mapping"
    )
    metadata: Optional[Dict] = Field(
        default_factory=dict,
        description="Additional metadata"
    )

    @validator("record_type")
    def validate_record_type(cls, value: str) -> str:
        """Validate record type against allowed types."""
        if value not in ALLOWED_RECORD_TYPES:
            raise ValueError(f"Invalid record type. Must be one of: {ALLOWED_RECORD_TYPES}")
        return value

class PlatformSyncBase(BaseModel):
    """Base schema for health platform synchronization."""
    
    platform: str = Field(
        ...,
        description="Health platform identifier",
        example="apple_health"
    )
    sync_type: str = Field(
        default="full",
        description="Type of synchronization",
        regex="^(full|incremental)$"
    )
    start_date: Optional[datetime] = Field(
        default=None,
        description="Start date for incremental sync"
    )
    end_date: Optional[datetime] = Field(
        default=None,
        description="End date for incremental sync"
    )
    data_types: Optional[List[str]] = Field(
        default_factory=list,
        description="Specific data types to sync"
    )

    @validator("platform")
    def validate_platform(cls, value: str) -> str:
        """Validate platform against supported platforms."""
        if value not in SUPPORTED_PLATFORMS:
            raise ValueError(f"Unsupported platform. Must be one of: {SUPPORTED_PLATFORMS}")
        return value

    @validator("start_date", "end_date")
    def validate_dates(cls, value: Optional[datetime], values: Dict) -> Optional[datetime]:
        """Validate date ranges for synchronization."""
        if value and values.get("sync_type") == "incremental":
            if value > datetime.utcnow():
                raise ValueError("Sync dates cannot be in the future")
        return value

class HealthAnalyticsBase(BaseModel):
    """Base schema for health analytics requests."""
    
    metric_types: List[str] = Field(
        ...,
        min_items=1,
        description="Types of metrics to analyze"
    )
    start_date: datetime = Field(
        ...,
        description="Start date for analysis period"
    )
    end_date: datetime = Field(
        ...,
        description="End date for analysis period"
    )
    aggregation: str = Field(
        default="daily",
        regex="^(hourly|daily|weekly|monthly)$",
        description="Aggregation period for analysis"
    )
    include_raw_data: bool = Field(
        default=False,
        description="Include raw data points in response"
    )

    @validator("metric_types")
    def validate_metric_types(cls, value: List[str]) -> List[str]:
        """Validate requested metric types."""
        invalid_types = [t for t in value if t not in ALLOWED_METRIC_TYPES]
        if invalid_types:
            raise ValueError(f"Invalid metric types: {invalid_types}")
        return value

    @validator("end_date")
    def validate_date_range(cls, value: datetime, values: Dict) -> datetime:
        """Validate analysis date range."""
        if "start_date" in values and value <= values["start_date"]:
            raise ValueError("End date must be after start date")
        if value > datetime.utcnow():
            raise ValueError("End date cannot be in the future")
        return value