"""
Unit tests for health module components including FHIR compliance, security validation,
and platform synchronization capabilities.

Version: 1.0.0
"""

import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List

import pytest  # pytest v7.4+
from unittest.mock import Mock, patch, AsyncMock
from freezegun import freeze_time  # freezegun v1.2+
from fhirclient.models.observation import Observation  # fhirclient v4.0+

from api.health.models import HealthMetric
from api.health.services import (
    HealthDataService,
    create_health_data_service,
    SYNC_BATCH_SIZE,
    MAX_SYNC_ATTEMPTS
)
from core.constants import HealthMetricType, DocumentStatus

# Test constants
TEST_USER_ID = "test_user_123"
TEST_SECURITY_CONFIG = {
    "encryption_key": "test_key_123",
    "audit_enabled": True,
    "security_level": "high"
}
TEST_MONITORING_CONFIG = {
    "enabled": True,
    "metrics_prefix": "test_health",
    "log_level": "DEBUG"
}

VALID_FHIR_METRIC = {
    "resourceType": "Observation",
    "status": "final",
    "code": {
        "coding": [{
            "system": "http://loinc.org",
            "code": "8867-4",
            "display": "Heart rate"
        }]
    },
    "valueQuantity": {
        "value": 75,
        "unit": "beats/min",
        "system": "http://unitsofmeasure.org"
    }
}

@pytest.fixture
def health_service():
    """Fixture for creating a test HealthDataService instance."""
    return create_health_data_service(
        user_id=TEST_USER_ID,
        security_config=TEST_SECURITY_CONFIG,
        monitoring_config=TEST_MONITORING_CONFIG
    )

@pytest.fixture
def mock_platform_client():
    """Fixture for mocking health platform client."""
    client = Mock()
    client.get_metrics = AsyncMock()
    return client

class TestHealthMetric:
    """Test cases for HealthMetric model validation and FHIR compliance."""

    @pytest.mark.parametrize("metric_type", [
        "heart_rate", "blood_pressure", "blood_glucose", 
        "weight", "steps", "oxygen_saturation"
    ])
    async def test_validate_metric_type_valid(self, metric_type):
        """Test validation of valid metric types."""
        metric = HealthMetric(
            user_id=TEST_USER_ID,
            metric_type=metric_type,
            value=75.0,
            unit="beats/min",
            recorded_at=datetime.now(timezone.utc)
        )
        assert await metric.validate_metric_type(metric_type) is True

    @pytest.mark.parametrize("invalid_type", [
        "invalid_type", "", None, "123"
    ])
    async def test_validate_metric_type_invalid(self, invalid_type):
        """Test validation of invalid metric types."""
        metric = HealthMetric(
            user_id=TEST_USER_ID,
            metric_type="heart_rate",
            value=75.0,
            unit="beats/min"
        )
        assert await metric.validate_metric_type(invalid_type) is False

    async def test_fhir_compliance_valid(self):
        """Test FHIR compliance validation for valid metric."""
        metric = HealthMetric(
            user_id=TEST_USER_ID,
            metric_type="heart_rate",
            value=75.0,
            unit="beats/min",
            recorded_at=datetime.now(timezone.utc),
            coding_system="http://loinc.org",
            coding_code="8867-4",
            value_quantity={
                "value": 75.0,
                "unit": "beats/min",
                "system": "http://unitsofmeasure.org"
            }
        )
        fhir_data = await metric.to_fhir()
        observation = Observation(fhir_data)
        assert observation.is_valid()

    @pytest.mark.security
    async def test_encryption_fields(self):
        """Test encryption of sensitive metric fields."""
        metric = HealthMetric(
            user_id=TEST_USER_ID,
            metric_type="blood_pressure",
            value=120.0,
            unit="mmHg",
            recorded_at=datetime.now(timezone.utc),
            raw_data={"systolic": 120, "diastolic": 80}
        )
        assert "value" in metric.encrypted_fields
        assert "raw_data" in metric.encrypted_fields

class TestHealthDataService:
    """Test cases for HealthDataService operations and security."""

    @pytest.mark.asyncio
    async def test_sync_platform_data_success(self, health_service, mock_platform_client):
        """Test successful platform data synchronization."""
        start_date = datetime.now(timezone.utc) - timedelta(days=1)
        end_date = datetime.now(timezone.utc)
        metric_types = ["heart_rate"]
        
        mock_metrics = [{
            "metric_type": "heart_rate",
            "value": 75.0,
            "unit": "beats/min",
            "recorded_at": datetime.now(timezone.utc)
        }]
        
        mock_platform_client.get_metrics.return_value = mock_metrics
        health_service.platform_clients["apple_health"] = mock_platform_client

        result = await health_service.sync_platform_data(
            platform="apple_health",
            start_date=start_date,
            end_date=end_date,
            metric_types=metric_types
        )

        assert result["status"] == DocumentStatus.COMPLETED.value
        assert result["metrics_processed"] == len(mock_metrics)
        mock_platform_client.get_metrics.assert_called_once()

    @pytest.mark.asyncio
    async def test_sync_platform_data_error(self, health_service, mock_platform_client):
        """Test platform sync error handling."""
        mock_platform_client.get_metrics.side_effect = Exception("API Error")
        health_service.platform_clients["apple_health"] = mock_platform_client

        with pytest.raises(Exception):
            await health_service.sync_platform_data(
                platform="apple_health",
                start_date=datetime.now(timezone.utc) - timedelta(days=1),
                end_date=datetime.now(timezone.utc),
                metric_types=["heart_rate"]
            )

    @pytest.mark.security
    async def test_store_health_metric_secure(self, health_service):
        """Test secure storage of health metric data."""
        metric_data = {
            "metric_type": "heart_rate",
            "value": 75.0,
            "unit": "beats/min",
            "recorded_at": datetime.now(timezone.utc)
        }

        stored_metrics = await health_service._store_metrics_batch([metric_data])
        assert len(stored_metrics) == 1
        assert stored_metrics[0].user_id == TEST_USER_ID
        assert stored_metrics[0].metric_type == metric_data["metric_type"]

    @pytest.mark.parametrize("batch_size", [1, 10, SYNC_BATCH_SIZE])
    async def test_batch_processing(self, health_service, mock_platform_client, batch_size):
        """Test batch processing of health metrics."""
        mock_metrics = [
            {
                "metric_type": "heart_rate",
                "value": 75.0 + i,
                "unit": "beats/min",
                "recorded_at": datetime.now(timezone.utc)
            }
            for i in range(batch_size)
        ]
        
        validated_metrics = health_service._validate_metrics_batch(mock_metrics)
        assert len(validated_metrics) == batch_size
        
        stored_metrics = await health_service._store_metrics_batch(validated_metrics)
        assert len(stored_metrics) == batch_size

def test_health_data_service_creation():
    """Test HealthDataService factory function."""
    service = create_health_data_service(
        user_id=TEST_USER_ID,
        security_config=TEST_SECURITY_CONFIG,
        monitoring_config=TEST_MONITORING_CONFIG
    )
    assert isinstance(service, HealthDataService)
    assert service.user_id == TEST_USER_ID

@pytest.mark.parametrize("invalid_config", [
    None,
    {},
    {"invalid": "config"}
])
def test_health_data_service_creation_invalid_config(invalid_config):
    """Test HealthDataService creation with invalid configurations."""
    with pytest.raises(ValueError):
        create_health_data_service(
            user_id=TEST_USER_ID,
            security_config=invalid_config,
            monitoring_config=TEST_MONITORING_CONFIG
        )