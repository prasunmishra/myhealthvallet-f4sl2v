"""
Root initialization module for the PHRSAT backend test suite.
Configures test environment, registers plugins, provides shared test utilities,
and implements comprehensive security testing infrastructure.

Version: 1.0.0
"""

import os
import pytest
import pytest_asyncio  # pytest-asyncio v0.21+
import pytest_cov  # pytest-cov v4.1+
import pytest_mock  # pytest-mock v3.11+

from core.config import Settings
from core.logging import setup_logging

# Register pytest plugins for comprehensive test coverage
pytest_plugins = [
    "tests.conftest",  # Core test configuration and fixtures
    "tests.fixtures.security",  # Security testing fixtures
    "tests.fixtures.database",  # Database testing fixtures
    "tests.fixtures.mocks"  # Mock service fixtures
]

# Test environment constants
TEST_ENV = "test"
DEFAULT_TIMEOUT = 60  # Default test timeout in seconds

# Test markers
MARKER_INTEGRATION = "integration"
MARKER_UNIT = "unit"
MARKER_SECURITY = "security"
MARKER_PERFORMANCE = "performance"

# Test data path
TEST_DATA_PATH = "tests/data"

def pytest_configure(config: pytest.Config) -> None:
    """
    Configure pytest environment with comprehensive setup including security testing,
    monitoring, and infrastructure configuration.
    
    Args:
        config: pytest configuration object
    """
    # Set test environment
    os.environ["ENV_STATE"] = TEST_ENV
    os.environ["TEST_DATABASE_URL"] = Settings.TEST_DATABASE_URL
    
    # Register custom markers
    config.addinivalue_line("markers", 
        f"{MARKER_UNIT}: mark test as unit test")
    config.addinivalue_line("markers", 
        f"{MARKER_INTEGRATION}: mark test as integration test")
    config.addinivalue_line("markers", 
        f"{MARKER_SECURITY}: mark test as security test")
    config.addinivalue_line("markers", 
        f"{MARKER_PERFORMANCE}: mark test as performance test")
    
    # Configure test timeouts
    config.addinivalue_line("timeout", str(DEFAULT_TIMEOUT))
    
    # Set up enhanced logging with security audit
    setup_logging(
        log_level="DEBUG",
        json_output=True,
        security_context={
            "environment": TEST_ENV,
            "test_run_id": os.getenv("TEST_RUN_ID", ""),
            "security_scan": True
        }
    )
    
    # Configure test coverage settings
    config.option.cov_config = ".coveragerc"
    config.option.cov_branch = True
    config.option.cov_report = {
        "term-missing": True,
        "html": "coverage_html",
        "xml": "coverage.xml"
    }
    
    # Security testing configuration
    config.option.security = {
        "sast_enabled": True,
        "vulnerability_scan": True,
        "security_audit": True,
        "compliance_check": True
    }
    
    # Performance monitoring configuration
    config.option.performance = {
        "capture_metrics": True,
        "profiling_enabled": True,
        "trace_calls": True
    }

def pytest_sessionstart(session: pytest.Session) -> None:
    """
    Initialize test session with comprehensive resource setup and security configurations.
    
    Args:
        session: pytest session object
    """
    # Set up secure test environment
    os.makedirs(TEST_DATA_PATH, exist_ok=True)
    
    # Initialize test database with security controls
    if not os.getenv("SKIP_DB_INIT"):
        from tests.fixtures.database import init_test_db
        init_test_db()
    
    # Set up mock services with security context
    if not os.getenv("SKIP_MOCK_INIT"):
        from tests.fixtures.mocks import init_mock_services
        init_mock_services()
    
    # Initialize security testing framework
    if session.config.option.security["sast_enabled"]:
        from tests.security.sast import init_security_scanning
        init_security_scanning()
    
    # Set up test data versioning
    if os.path.exists(TEST_DATA_PATH):
        from tests.utils.data import init_test_data_versioning
        init_test_data_versioning()
    
    # Configure cleanup handlers
    def cleanup_test_resources():
        """Clean up test resources and temporary files."""
        import shutil
        if os.path.exists(TEST_DATA_PATH):
            shutil.rmtree(TEST_DATA_PATH)
    
    # Register cleanup handler
    session.config.add_cleanup(cleanup_test_resources)