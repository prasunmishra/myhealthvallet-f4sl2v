"""
Unit test initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Configures unit test environment with enhanced security context, performance optimizations,
and comprehensive test isolation.

Version: 1.0.0
"""

import os
import pytest  # pytest v7.4+
import pytest_asyncio  # pytest-asyncio v0.21+

# Import shared test configuration
pytest_plugins = ["tests.conftest"]

# Unit test configuration constants
UNIT_TEST_TIMEOUT = 10  # Default timeout for unit tests in seconds
MOCK_ENABLED = True  # Enable comprehensive mocking for unit tests

# Mock database configuration with proper isolation
MOCK_DB_CONFIG = {
    "host": "mock-db",
    "port": 5432,
    "isolation_level": "SERIALIZABLE",
    "pool_size": 5,
    "max_overflow": 10
}

# Security context for unit tests
SECURITY_CONTEXT = {
    "mock_auth": True,
    "mock_encryption": True,
    "secure_fixtures": True,
    "test_isolation": True,
    "audit_enabled": True
}

def pytest_configure_unit(config: pytest.Config) -> None:
    """
    Configure pytest specifically for unit tests with enhanced security and performance settings.
    
    Args:
        config: pytest configuration object
    """
    # Register unit test specific markers
    config.addinivalue_line(
        "markers",
        "unit: mark test as unit test with security context"
    )
    config.addinivalue_line(
        "markers",
        "secure: mark test requiring enhanced security context"
    )
    config.addinivalue_line(
        "markers",
        "performance: mark test for performance monitoring"
    )
    
    # Configure mock database settings
    os.environ["TEST_DB_CONFIG"] = str(MOCK_DB_CONFIG)
    os.environ["TEST_DB_ISOLATION"] = "SERIALIZABLE"
    
    # Set up unit test timeouts
    config.addinivalue_line("timeout", str(UNIT_TEST_TIMEOUT))
    
    # Initialize mock services with security context
    os.environ["MOCK_ENABLED"] = str(MOCK_ENABLED)
    os.environ["SECURITY_CONTEXT"] = str(SECURITY_CONTEXT)
    
    # Configure unit test logging
    os.environ["LOG_LEVEL"] = "DEBUG"
    os.environ["SECURE_LOGGING"] = "True"
    
    # Set up test isolation
    config.option.isolated_tests = True
    
    # Initialize secure test fixtures
    config.option.secure_fixtures = True
    
    # Configure performance monitoring
    config.option.performance_profile = {
        "enabled": True,
        "statsd_host": "localhost",
        "statsd_port": 8125,
        "sample_rate": 1.0
    }
    
    # Set up mock cleanup handlers
    def cleanup_mocks():
        """Clean up mock objects and reset security context."""
        import shutil
        test_data_path = os.path.join(os.getcwd(), "tests/data/unit")
        if os.path.exists(test_data_path):
            shutil.rmtree(test_data_path)
    
    config.add_cleanup(cleanup_mocks)
    
    # Initialize security context
    config.option.security = {
        "mock_auth": True,
        "mock_encryption": True,
        "secure_fixtures": True,
        "test_isolation": True,
        "audit_enabled": True,
        "vulnerability_scan": True
    }

# Export required components
__all__ = [
    "pytest_plugins",
    "UNIT_TEST_TIMEOUT",
    "MOCK_ENABLED",
    "MOCK_DB_CONFIG",
    "SECURITY_CONTEXT",
    "pytest_configure_unit"
]