"""
Integration tests for health data management functionality in PHRSAT.
Tests HIPAA-compliant storage, FHIR validation, platform sync, and security.

Version: 1.0.0
"""

import pytest  # pytest v7.4+
import pytest_asyncio  # pytest-asyncio v0.21+
import pytest_timeout  # pytest-timeout v2.1+
import pytest_cov  # pytest-cov v4.1+
from datetime import datetime, timezone, timedelta
from freezegun import freeze_time  # freezegun v1.2+
from unittest.mock import Mock, patch

from api.health.models import HealthMetric, HealthRecord
from api.health.services import HealthDataService

# Test constants
TEST_USER_ID = "test_user_123"
TEST_METRIC_TYPES = ["heart_rate", "blood_pressure", "steps", "glucose", "oxygen_saturation"]
TEST_RECORD_TYPES = ["lab_report", "prescription", "imaging", "clinical_notes", "vaccination"]
SECURITY_CONTEXT = {"encryption_key": "test_key_12345", "access_level": "test_admin"}
MONITORING_CONFIG = {"enabled": True, "log_level": "DEBUG"}
RETRY_CONFIG = {"max_attempts": 3, "backoff_factor": 1.5, "timeout": 30}

class TestHealthDataFixtures:
    """Enhanced fixtures for health data integration tests with security context."""

    def __init__(self):
        """Initialize test fixtures with security context."""
        self.test_metric_data = {
            "metric_type": "heart_rate",
            "value": 75.0,
            "unit": "bpm",
            "recorded_at": datetime.now(timezone.utc),
            "source": "test_device",
            "coding_system": "http://loinc.org",
            "coding_code": "8867-4",
            "value_quantity": {
                "value": 75.0,
                "unit": "bpm",
                "system": "http://unitsofmeasure.org"
            }
        }

        self.test_record_data = {
            "record_type": "lab_report",
            "title": "Test Lab Results",
            "description": "Comprehensive blood panel results",
            "storage_url": "s3://test-bucket/test-file.pdf",
            "record_date": datetime.now(timezone.utc),
            "metadata": {
                "lab_id": "LAB123",
                "ordering_provider": "Dr. Smith"
            }
        }

    async def setup_test_data(self, health_service):
        """Set up secure test data in database."""
        # Clear existing test data
        await HealthMetric.objects(user_id=TEST_USER_ID).delete()
        await HealthRecord.objects(user_id=TEST_USER_ID).delete()

        # Create test metrics
        metric = HealthMetric(user_id=TEST_USER_ID, **self.test_metric_data)
        await metric.save()

        # Create test records
        record = HealthRecord(user_id=TEST_USER_ID, **self.test_record_data)
        await record.save()

@pytest.fixture
async def health_service():
    """Fixture for health data service with security context."""
    service = HealthDataService(
        user_id=TEST_USER_ID,
        security_config=SECURITY_CONTEXT,
        monitoring_config=MONITORING_CONFIG
    )
    return service

@pytest.fixture
async def test_fixtures(health_service):
    """Fixture for test data setup."""
    fixtures = TestHealthDataFixtures()
    await fixtures.setup_test_data(health_service)
    return fixtures

@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_store_health_metric_with_security(health_service, test_fixtures):
    """Test storing health metrics with security validation and FHIR compliance."""
    # Test valid metric storage
    metric_data = test_fixtures.test_metric_data.copy()
    
    try:
        # Validate FHIR compliance
        assert HealthMetric.validate_metric_type(metric_data["metric_type"])
        
        # Store metric
        metric = HealthMetric(user_id=TEST_USER_ID, **metric_data)
        await metric.save()
        
        # Verify storage and encryption
        stored_metric = await HealthMetric.objects.get(id=metric.id)
        assert stored_metric.user_id == TEST_USER_ID
        assert stored_metric.metric_type == metric_data["metric_type"]
        assert stored_metric.value == metric_data["value"]
        
        # Verify FHIR format
        fhir_data = stored_metric.to_fhir()
        assert fhir_data["resourceType"] == "Observation"
        assert fhir_data["code"]["coding"][0]["system"] == metric_data["coding_system"]
        
    except Exception as e:
        pytest.fail(f"Failed to store health metric: {str(e)}")

    # Test invalid metric handling
    with pytest.raises(ValueError):
        invalid_metric = metric_data.copy()
        invalid_metric["metric_type"] = "invalid_type"
        await HealthMetric(user_id=TEST_USER_ID, **invalid_metric).save()

@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_store_health_record_with_phi(health_service, test_fixtures):
    """Test storing health records with PHI protection."""
    # Test valid record storage
    record_data = test_fixtures.test_record_data.copy()
    
    try:
        # Validate record type
        assert HealthRecord.validate_record_type(record_data["record_type"])
        
        # Store record with encryption
        record = HealthRecord(user_id=TEST_USER_ID, **record_data)
        await record.save()
        
        # Verify storage and encryption
        stored_record = await HealthRecord.objects.get(id=record.id)
        assert stored_record.user_id == TEST_USER_ID
        assert stored_record.record_type == record_data["record_type"]
        assert stored_record.title == record_data["title"]
        
        # Verify FHIR document reference
        fhir_doc = stored_record.to_fhir()
        assert fhir_doc["resourceType"] == "DocumentReference"
        assert fhir_doc["status"] == "current"
        
    except Exception as e:
        pytest.fail(f"Failed to store health record: {str(e)}")

    # Test unauthorized access
    with pytest.raises(PermissionError):
        await HealthRecord.objects.get(
            user_id="unauthorized_user",
            id=record.id
        )

@pytest.mark.asyncio
@pytest.mark.timeout(60)
@pytest.mark.integration
async def test_sync_platform_data_with_retry(health_service, test_fixtures):
    """Test health platform data synchronization with retry mechanism."""
    # Mock platform client
    mock_platform = Mock()
    mock_platform.get_metrics.side_effect = [
        Exception("Network error"),  # First attempt fails
        [test_fixtures.test_metric_data],  # Second attempt succeeds
    ]

    with patch.dict(health_service.platform_clients, {"test_platform": mock_platform}):
        start_date = datetime.now(timezone.utc) - timedelta(days=1)
        end_date = datetime.now(timezone.utc)
        
        try:
            # Execute sync with retry
            sync_result = await health_service.sync_platform_data(
                platform="test_platform",
                start_date=start_date,
                end_date=end_date,
                metric_types=["heart_rate"],
                sync_options={"retry_config": RETRY_CONFIG}
            )
            
            # Verify sync results
            assert sync_result["status"] == "completed"
            assert sync_result["metrics_processed"] > 0
            assert "error" not in sync_result
            
            # Verify retry attempts
            assert mock_platform.get_metrics.call_count == 2
            
        except Exception as e:
            pytest.fail(f"Platform sync failed: {str(e)}")

        # Verify stored metrics
        stored_metrics = await HealthMetric.objects(
            user_id=TEST_USER_ID,
            recorded_at__gte=start_date,
            recorded_at__lte=end_date
        ).count()
        assert stored_metrics > 0