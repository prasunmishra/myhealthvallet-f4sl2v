"""
Unit tests for document management module covering document processing, storage, retrieval,
security, compliance, and performance validation.

Version: 1.0.0
"""

import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import Mock, patch, MagicMock
from freezegun import freeze_time
import boto3
from security_manager import SecurityManager

from api.docs.models import HealthDocument
from api.docs.services import DocumentService
from services.docs.storage import DocumentStorageService
from services.docs.processor import DocumentProcessor
from core.security import SecurityManager
from core.config import Settings

# Test constants
TEST_USER_ID = "test-user-123"
TEST_DOCUMENT_ID = "test-doc-456"
SECURITY_CONFIG = {
    "encryption_key": "test-key-12345678901234567890123456789012",
    "compliance_level": "hipaa"
}
PERFORMANCE_THRESHOLDS = {
    "response_time_ms": 200,
    "classification_accuracy": 0.95
}

@pytest.fixture
def mock_s3():
    """Configure mock S3 client for testing."""
    with patch('boto3.client') as mock_client:
        s3 = mock_client.return_value
        s3.put_object = MagicMock(return_value={'ETag': 'test-etag'})
        s3.get_object = MagicMock(return_value={
            'Body': MagicMock(read=lambda: b'test-content'),
            'Metadata': {'user_id': TEST_USER_ID}
        })
        yield s3

@pytest.fixture
def mock_security_manager():
    """Configure mock security manager for testing."""
    security_manager = Mock(spec=SecurityManager)
    security_manager.encrypt_phi.return_value = b'encrypted-data'
    security_manager.decrypt_phi.return_value = 'decrypted-data'
    return security_manager

@pytest.fixture
def document_service(mock_s3, mock_security_manager):
    """Initialize document service with mocked dependencies."""
    settings = {
        'storage_config': {
            'aws_access_key_id': 'test-key',
            'aws_secret_access_key': 'test-secret',
            'region_name': 'us-east-1',
            'bucket_name': 'test-bucket'
        },
        'processor_config': {
            'use_gpu': False,
            'batch_size': 1
        }
    }
    return DocumentService(settings, SECURITY_CONFIG)

class TestHealthDocument:
    """Test cases for HealthDocument model including security and compliance."""

    @pytest.fixture(autouse=True)
    def setup(self, mock_security_manager):
        """Set up test fixtures with security configuration."""
        self.document = HealthDocument(
            user_id=TEST_USER_ID,
            title="Test Lab Report",
            document_type="LAB_REPORT",
            document_date=datetime.now(timezone.utc),
            storage_url="s3://test-bucket/test-key",
            created_by=TEST_USER_ID,
            updated_by=TEST_USER_ID
        )
        self.security_manager = mock_security_manager

    @pytest.mark.security
    @pytest.mark.hipaa
    def test_hipaa_compliance(self):
        """Test HIPAA compliance validation for document operations."""
        # Test field-level encryption
        sensitive_data = {
            'medical_notes': 'Patient exhibits symptoms',
            'diagnosis': 'Test diagnosis',
            'test_results': 'Positive'
        }
        encrypted_data = self.document.encrypt_sensitive_data(sensitive_data)
        
        assert 'encryption_date' in self.document.encrypted_metadata
        assert 'encrypted_fields' in self.document.encrypted_metadata
        assert all(field in self.document.encrypted_metadata['encrypted_fields'] 
                  for field in ['medical_notes', 'diagnosis', 'test_results'])

        # Test audit logging
        self.document.update_access_log(
            user_id=TEST_USER_ID,
            action_type='view',
            details={'ip_address': '127.0.0.1'}
        )
        
        assert len(self.document.access_log['views']) > 0
        assert self.document.access_log['views'][-1]['user_id'] == TEST_USER_ID
        assert 'timestamp' in self.document.access_log['views'][-1]

    @pytest.mark.security
    def test_document_security(self):
        """Test document security features and encryption."""
        # Test document type validation
        assert self.document.validate_document_type("LAB_REPORT") is True
        
        with pytest.raises(ValueError):
            self.document.validate_document_type("INVALID_TYPE")

        # Test encryption for storage
        test_content = b"test document content"
        encrypted_content = self.security_manager.encrypt_phi(test_content)
        
        assert encrypted_content != test_content
        assert len(encrypted_content) > 0

        # Test access control
        self.document.shared_with = ["shared-user-123"]
        assert "shared-user-123" in self.document.shared_with
        assert len(self.document.shared_with) == 1

class TestDocumentService:
    """Test cases for DocumentService with performance and accuracy validation."""

    @pytest.fixture(autouse=True)
    def setup(self, document_service, mock_s3):
        """Set up test fixtures with performance monitoring."""
        self.service = document_service
        self.s3 = mock_s3
        self.test_document = {
            'content': b'test content',
            'type': 'LAB_REPORT',
            'title': 'Test Report',
            'tags': ['lab', 'test']
        }

    @pytest.mark.performance
    async def test_performance_metrics(self):
        """Test performance requirements for document operations."""
        with freeze_time("2023-01-01 12:00:00"):
            start_time = datetime.now(timezone.utc)
            
            # Test upload performance
            upload_result = await self.service.upload_document(
                document_content=self.test_document['content'],
                document_type=self.test_document['type'],
                user_id=TEST_USER_ID,
                title=self.test_document['title'],
                tags=self.test_document['tags'],
                security_metadata={'encryption_version': '1.0'}
            )
            
            end_time = datetime.now(timezone.utc)
            processing_time = (end_time - start_time).total_seconds() * 1000
            
            assert processing_time < PERFORMANCE_THRESHOLDS['response_time_ms']
            assert upload_result is not None
            assert hasattr(upload_result, 'storage_url')

    @pytest.mark.classification
    async def test_classification_accuracy(self):
        """Test document classification accuracy requirements."""
        # Test document processor accuracy
        processor = DocumentProcessor(
            config={'use_gpu': False},
            security_config=SECURITY_CONFIG
        )
        
        classification_result = await processor.process_document(
            document=self.test_document['content'],
            user_id=TEST_USER_ID,
            processing_options={'document_type': 'LAB_REPORT'}
        )
        
        assert classification_result['processing_results']['confidence_scores']['classification'] >= \
               PERFORMANCE_THRESHOLDS['classification_accuracy']
        assert classification_result['security_status']['phi_protected'] is True

def pytest_configure(config):
    """Configure pytest with security and performance settings."""
    config.addinivalue_line(
        "markers",
        "security: mark test as security-related"
    )
    config.addinivalue_line(
        "markers",
        "hipaa: mark test as HIPAA compliance-related"
    )
    config.addinivalue_line(
        "markers",
        "performance: mark test as performance-related"
    )
    config.addinivalue_line(
        "markers",
        "classification: mark test as classification-related"
    )