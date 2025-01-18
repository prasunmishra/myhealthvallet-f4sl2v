"""
Pytest configuration module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides comprehensive test fixtures and environment setup for secure testing.

Version: 1.0.0
"""

import logging
import os
from typing import Dict, Generator
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient  # fastapi v0.100+
from mongoengine import connect, disconnect  # mongoengine v0.24+
from jose import jwt  # python-jose v3.3+

from core.db.session import get_db_session
from core.config import Settings
from api.main import app
from core.security import SecurityManager

# Configure test logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Test configuration constants
TEST_MONGODB_URL = "mongodb://localhost:27017/test_db"
TEST_JWT_SECRET = "test_secret_key_must_be_at_least_32_chars_long"
TEST_LOG_LEVEL = "DEBUG"
TEST_POOL_SIZE = 10
TEST_TIMEOUT = 30

def pytest_configure(config):
    """Configure test environment with security settings."""
    # Set test environment variables
    os.environ["ENV_STATE"] = "test"
    os.environ["LOG_LEVEL"] = TEST_LOG_LEVEL
    os.environ["JWT_SECRET"] = TEST_JWT_SECRET
    os.environ["MONGODB_URL"] = TEST_MONGODB_URL

    # Register custom markers
    config.addinivalue_line("markers", "integration: mark test as integration test")
    config.addinivalue_line("markers", "security: mark test as security-focused test")
    config.addinivalue_line("markers", "phi: mark test as containing PHI data")

@pytest.fixture(scope="session")
def test_app():
    """Provide test FastAPI application instance."""
    return app

@pytest.fixture(scope="function")
def test_client(test_app) -> Generator:
    """Provide test client with security headers."""
    with TestClient(test_app) as client:
        # Configure security headers
        client.headers.update({
            "X-Test-Client": "true",
            "X-Security-Context": "test"
        })
        yield client

@pytest.fixture(scope="function")
async def db_session():
    """Provide isolated database session for tests."""
    try:
        # Connect to test database
        connection = connect(
            host=TEST_MONGODB_URL,
            maxPoolSize=TEST_POOL_SIZE,
            serverSelectionTimeoutMS=TEST_TIMEOUT * 1000
        )

        # Clear all collections before test
        database = connection.get_database()
        for collection in database.list_collection_names():
            database[collection].delete_many({})

        async with get_db_session() as session:
            yield session

    finally:
        # Cleanup after test
        disconnect()

@pytest.fixture(scope="function")
def auth_headers(test_app) -> Dict[str, str]:
    """Provide authentication headers for protected endpoints."""
    # Create test security manager
    security_manager = SecurityManager(Settings())

    # Generate test JWT token
    token_data = {
        "sub": "test_user_id",
        "roles": ["user"],
        "permissions": ["health:read", "health:write"],
        "exp": datetime.utcnow() + timedelta(minutes=30)
    }

    token = jwt.encode(
        token_data,
        TEST_JWT_SECRET,
        algorithm="HS256"
    )

    return {
        "Authorization": f"Bearer {token}",
        "X-Client-ID": "test_client",
        "X-Device-ID": "test_device"
    }

@pytest.fixture(scope="function")
def test_user_data() -> Dict:
    """Provide test user data."""
    return {
        "id": "test_user_id",
        "email": "test@example.com",
        "first_name": "Test",
        "last_name": "User",
        "roles": ["user"],
        "is_active": True
    }

@pytest.fixture(scope="function")
def mock_security_context(test_user_data) -> Dict:
    """Provide mock security context for testing."""
    return {
        "user_id": test_user_data["id"],
        "roles": test_user_data["roles"],
        "client_id": "test_client",
        "device_id": "test_device",
        "ip_address": "127.0.0.1",
        "correlation_id": "test_correlation_id"
    }

@pytest.fixture(scope="function")
def test_document_data() -> Dict:
    """Provide test health document data."""
    return {
        "title": "Test Lab Report",
        "document_type": "lab_report",
        "content": "Test content",
        "metadata": {
            "facility": "Test Hospital",
            "provider": "Dr. Test"
        }
    }

@pytest.fixture(scope="function")
def test_health_metric() -> Dict:
    """Provide test health metric data."""
    return {
        "type": "blood_pressure",
        "value": "120/80",
        "unit": "mmHg",
        "recorded_at": datetime.utcnow().isoformat(),
        "device_id": "test_device"
    }

def pytest_collection_modifyitems(config, items):
    """Modify test collection with security markers."""
    for item in items:
        # Mark tests containing PHI data
        if "phi" in item.keywords:
            item.add_marker(pytest.mark.security)
        
        # Mark integration tests
        if "integration" in str(item.fspath):
            item.add_marker(pytest.mark.integration)

        # Add security marker to auth tests
        if "auth" in str(item.fspath):
            item.add_marker(pytest.mark.security)