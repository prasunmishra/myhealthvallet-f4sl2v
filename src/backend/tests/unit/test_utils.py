"""
Unit test suite for PHRSAT backend utility functions.
Tests cryptographic operations, data validation, and HIPAA compliance.

Version: 1.0.0
"""

import pytest
import uuid
from datetime import datetime, timezone
from freezegun import freeze_time  # freezegun v1.2+
from typing import Dict, Any

from api.utils.crypto import encrypt_field, decrypt_field
from api.utils.validators import validate_health_data
from core.exceptions import ValidationException
from core.security import SecurityManager
from core.config import settings

# Test data constants
TEST_PHI_DATA = {
    "patient_id": str(uuid.uuid4()),
    "record_type": "vital_signs",
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "vital_signs": {
        "heart_rate": {"value": 75, "unit": "bpm"},
        "blood_pressure_systolic": {"value": 120, "unit": "mmHg"},
        "blood_pressure_diastolic": {"value": 80, "unit": "mmHg"}
    },
    "notes": "Test patient vital signs"
}

SECURITY_CONFIG = {
    "key_rotation_interval": 3600,
    "min_key_length": 256,
    "encryption_algorithm": "AES-GCM"
}

def pytest_configure(config):
    """Configure pytest with security settings and test environment."""
    # Mark security and HIPAA compliance tests
    config.addinivalue_line("markers", "security: mark test as security-related")
    config.addinivalue_line("markers", "hipaa: mark test as HIPAA compliance-related")
    
    # Configure test environment
    settings.ENV_STATE = "test"
    settings.DEBUG = True
    settings.LOG_LEVEL = "DEBUG"

@pytest.fixture
def security_manager():
    """Fixture for SecurityManager instance with test configuration."""
    return SecurityManager(settings)

@pytest.fixture
def test_health_data():
    """Fixture for sample health data."""
    return TEST_PHI_DATA.copy()

@pytest.mark.security
class TestCryptoUtils:
    """Test suite for cryptographic utility functions."""

    def test_encrypt_decrypt_basic(self, security_manager):
        """Test basic encryption and decryption functionality."""
        test_data = "sensitive test data"
        encrypted = encrypt_field(test_data, is_phi=False)
        decrypted = decrypt_field(encrypted, is_phi=False)
        
        assert encrypted != test_data
        assert decrypted == test_data
        assert ":" in encrypted  # Version separator check

    def test_phi_encryption(self, security_manager):
        """Test PHI-specific encryption with enhanced security."""
        phi_data = "PHI-TEST-123"
        encrypted = encrypt_field(phi_data, is_phi=True)
        decrypted = decrypt_field(encrypted, is_phi=True)
        
        assert encrypted != phi_data
        assert decrypted == phi_data
        assert len(encrypted.split(":")) == 2  # Version and data parts

    @pytest.mark.asyncio
    async def test_parallel_encryption(self, security_manager):
        """Test concurrent encryption operations."""
        test_data = ["data1", "data2", "data3", "data4"]
        import asyncio
        
        async def encrypt_async(data):
            return encrypt_field(data, is_phi=False)
        
        # Execute encryptions in parallel
        tasks = [encrypt_async(data) for data in test_data]
        encrypted_results = await asyncio.gather(*tasks)
        
        assert len(encrypted_results) == len(test_data)
        assert all(result != data for result, data in zip(encrypted_results, test_data))

    def test_encrypt_decrypt_with_rotation(self, security_manager):
        """Test encryption and decryption with key rotation."""
        original_data = "test data for rotation"
        
        # Encrypt with current key
        encrypted = encrypt_field(original_data, is_phi=False)
        
        # Simulate key rotation
        security_manager.rotate_keys()
        
        # Decrypt with new key configuration
        decrypted = decrypt_field(encrypted, is_phi=False)
        
        assert decrypted == original_data

    def test_encryption_failure_handling(self):
        """Test encryption error handling and logging."""
        with pytest.raises(RuntimeError) as exc_info:
            encrypt_field(None, is_phi=True)
        assert "encryption failed" in str(exc_info.value).lower()

@pytest.mark.hipaa
class TestHealthDataValidation:
    """Test suite for health data validation with HIPAA compliance."""

    def test_valid_health_data(self, test_health_data):
        """Test validation of valid health data."""
        validated = validate_health_data(test_health_data)
        assert validated["patient_id"] == test_health_data["patient_id"]
        assert validated["record_type"] == test_health_data["record_type"]
        assert "vital_signs" in validated

    def test_phi_validation(self, test_health_data):
        """Test validation of Protected Health Information."""
        # Add PHI fields
        test_health_data.update({
            "ssn": "123-45-6789",
            "mrn": "AB123456",
            "dob": "1990-01-01"
        })
        
        with pytest.raises(ValidationException) as exc_info:
            validate_health_data(test_health_data)
        assert "validation failed" in str(exc_info.value).lower()

    def test_invalid_vital_signs(self, test_health_data):
        """Test validation of invalid vital signs data."""
        test_health_data["vital_signs"]["heart_rate"]["value"] = 500  # Invalid value
        
        with pytest.raises(ValidationException) as exc_info:
            validate_health_data(test_health_data)
        assert "invalid heart_rate value" in str(exc_info.value).lower()

    @freeze_time("2023-01-01")
    def test_timestamp_validation(self, test_health_data):
        """Test validation of health data timestamps."""
        # Test future timestamp
        test_health_data["timestamp"] = "2024-01-01T00:00:00Z"
        
        with pytest.raises(ValidationException) as exc_info:
            validate_health_data(test_health_data)
        assert "future timestamp" in str(exc_info.value).lower()

    def test_sanitized_notes(self, test_health_data):
        """Test sanitization of notes field."""
        test_health_data["notes"] = "<script>alert('test')</script>Patient notes"
        validated = validate_health_data(test_health_data)
        
        assert "<script>" not in validated["notes"]
        assert "Patient notes" in validated["notes"]

class TestSecurityBoundaries:
    """Test suite for security boundaries and edge cases."""

    def test_empty_data_handling(self):
        """Test handling of empty data in security functions."""
        assert encrypt_field("", is_phi=False) == ""
        assert decrypt_field("", is_phi=False) == ""

    def test_large_data_encryption(self, security_manager):
        """Test encryption of large data blocks."""
        large_data = "x" * 1000000  # 1MB of data
        encrypted = encrypt_field(large_data, is_phi=False)
        decrypted = decrypt_field(encrypted, is_phi=False)
        
        assert decrypted == large_data

    def test_invalid_key_version(self):
        """Test handling of invalid encryption key versions."""
        encrypted = encrypt_field("test data", is_phi=False)
        invalid_version = "999" + encrypted[encrypted.index(":"):]
        
        with pytest.raises(RuntimeError) as exc_info:
            decrypt_field(invalid_version, is_phi=False)
        assert "decryption failed" in str(exc_info.value).lower()

    @pytest.mark.parametrize("invalid_input", [
        None,
        123,
        {},
        [],
        True
    ])
    def test_invalid_input_types(self, invalid_input):
        """Test handling of invalid input types."""
        with pytest.raises((ValidationException, RuntimeError)):
            if isinstance(invalid_input, (dict, list)):
                validate_health_data(invalid_input)
            else:
                encrypt_field(invalid_input, is_phi=False)