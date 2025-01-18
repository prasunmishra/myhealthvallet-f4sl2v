"""
Initialization module for backend integration tests implementing HIPAA-compliant test environment,
fixtures configuration, and test isolation mechanisms.

Version: 1.0.0
"""

import logging
import pytest
from typing import Dict, Optional

from tests.conftest import db_fixture, async_client
from core.config import Settings
from core.security import SecurityManager
from core.logging import setup_logging

# Configure logging
logger = setup_logging()

# Global test configuration constants
INTEGRATION_TEST_MARKER = "integration"
INTEGRATION_TEST_TIMEOUT = 300  # 5 minutes
TEST_DATABASE_NAME = "test_phrsat_integration"

def configure_integration_tests() -> None:
    """Configure pytest settings specific to integration tests including test isolation,
    database setup, and security contexts."""
    
    # Register integration test marker
    config = pytest.Config.fromdictargs(
        {},
        {"markexpr": INTEGRATION_TEST_MARKER}
    )
    config.addinivalue_line(
        "markers",
        f"{INTEGRATION_TEST_MARKER}: mark test as integration test"
    )
    
    # Configure test timeouts
    config.option.timeout = INTEGRATION_TEST_TIMEOUT
    
    # Configure test database
    config.option.test_db_name = TEST_DATABASE_NAME
    
    # Configure async test settings
    pytest.register_assert_rewrite("pytest_asyncio")
    
    # Initialize security context for tests
    settings = Settings()
    security_manager = SecurityManager(settings)
    
    # Configure test data cleanup procedures
    config.option.cleanup = True
    
    logger.info("Integration test environment configured successfully")

class IntegrationTestBase:
    """Base class for all integration tests providing common utilities,
    fixtures, and isolation mechanisms."""
    
    test_db_name: str = TEST_DATABASE_NAME
    timeout: int = INTEGRATION_TEST_TIMEOUT
    security_context: Dict = {
        "test_user_id": "test_user",
        "test_roles": ["user"],
        "test_permissions": ["health:read", "health:write"]
    }
    cleanup_tasks: list = []

    @classmethod
    def setup_class(cls) -> None:
        """Class-level setup for integration tests with proper isolation."""
        try:
            # Create isolated test database instance
            db_fixture.setup(
                db_name=cls.test_db_name,
                timeout=cls.timeout
            )
            
            # Initialize test security context
            settings = Settings()
            security_manager = SecurityManager(settings)
            
            # Configure test client with security headers
            async_client.headers.update({
                "X-Test-Client": "true",
                "X-Security-Context": "test",
                "Authorization": f"Bearer {security_manager.create_test_token(cls.security_context)}"
            })
            
            # Initialize test monitoring
            logger.info(f"Setting up integration test class: {cls.__name__}")
            
        except Exception as e:
            logger.error(f"Test class setup failed: {str(e)}")
            raise

    @classmethod
    def teardown_class(cls) -> None:
        """Class-level teardown for integration tests ensuring proper cleanup."""
        try:
            # Execute cleanup tasks
            for task in cls.cleanup_tasks:
                try:
                    task()
                except Exception as e:
                    logger.error(f"Cleanup task failed: {str(e)}")
            
            # Drop test database
            db_fixture.teardown(cls.test_db_name)
            
            # Reset test client
            async_client.headers.clear()
            
            # Clear test security context
            cls.security_context.clear()
            
            logger.info(f"Completed teardown for test class: {cls.__name__}")
            
        except Exception as e:
            logger.error(f"Test class teardown failed: {str(e)}")
            raise

# Configure integration test environment
configure_integration_tests()

# Export test components
__all__ = ["IntegrationTestBase", "configure_integration_tests"]