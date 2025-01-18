"""
Integration tests for document management service validating end-to-end operations
with HIPAA compliance, security, and classification accuracy.

Version: 1.0.0
"""

import os
import uuid
import pytest
import boto3
from datetime import datetime
from typing import Dict, Tuple

from api.docs.services import DocumentService
from core.security import SecurityManager
from core.logging import setup_logging

# Configure logging
logger = setup_logging()

# Test constants
TEST_DOCUMENT_CONTENT = b'Test document content with PHI: Patient John Doe (DOB: 01/01/1980)'
TEST_USER_ID = "test_user_123"
TEST_DOCUMENT_TYPES = ["lab_report", "prescription", "medical_record", "radiology_report"]
CLASSIFICATION_ACCURACY_THRESHOLD = 0.95
PHI_TEST_PATTERNS = ["SSN", "DOB", "Medical Record Number", "Patient Name"]
MULTI_REGION_BUCKETS = ["us-east-1", "us-west-2", "eu-west-1"]

class TestDocumentIntegration:
    """Integration test suite for document management with security and compliance validation."""

    @pytest.fixture(autouse=True)
    def setup(self, monkeypatch):
        """Set up test environment with security controls."""
        # Initialize security manager
        self.security_manager = SecurityManager({
            'encryption_key': os.environ.get('TEST_ENCRYPTION_KEY'),
            'security_level': 'hipaa_compliant'
        })

        # Initialize document service
        self.doc_service = DocumentService({
            'storage_config': {
                'aws_access_key_id': os.environ.get('TEST_AWS_ACCESS_KEY'),
                'aws_secret_access_key': os.environ.get('TEST_AWS_SECRET_KEY'),
                'region_name': 'us-east-1',
                'bucket_name': 'test-phrsat-documents'
            },
            'processor_config': {
                'use_gpu': True,
                'min_confidence': 0.90
            }
        }, self.security_manager)

        # Set up test document
        self.test_document = {
            'content': TEST_DOCUMENT_CONTENT,
            'type': 'lab_report',
            'title': 'Test Lab Report',
            'tags': ['test', 'integration']
        }

        # Mock AWS S3 for testing
        self.s3_mock = boto3.client('s3', region_name='us-east-1')
        monkeypatch.setattr('boto3.client', lambda *args, **kwargs: self.s3_mock)

    @pytest.mark.asyncio
    async def test_document_upload_with_phi_protection(self):
        """Test document upload with PHI detection and protection."""
        try:
            # Upload document
            upload_result = await self.doc_service.upload_document(
                document_content=self.test_document['content'],
                document_type=self.test_document['type'],
                user_id=TEST_USER_ID,
                title=self.test_document['title'],
                tags=self.test_document['tags'],
                security_metadata={'phi_detection': True}
            )

            assert upload_result is not None, "Upload failed"
            assert upload_result.storage_url is not None, "No storage URL returned"

            # Verify PHI protection
            stored_document = await self.doc_service.get_document(
                upload_result.id,
                TEST_USER_ID
            )
            
            # Check PHI detection and redaction
            for phi_pattern in PHI_TEST_PATTERNS:
                assert phi_pattern not in stored_document[1].decode(), f"Unprotected PHI found: {phi_pattern}"

            # Verify encryption
            assert stored_document[1] != TEST_DOCUMENT_CONTENT, "Document not encrypted"

        except Exception as e:
            logger.error(f"Document upload test failed: {str(e)}")
            raise

    @pytest.mark.asyncio
    async def test_document_classification_accuracy(self):
        """Test document classification accuracy across document types."""
        classification_results = []

        try:
            for doc_type in TEST_DOCUMENT_TYPES:
                # Prepare test document
                test_content = self._generate_test_document(doc_type)
                
                # Upload and classify document
                upload_result = await self.doc_service.upload_document(
                    document_content=test_content,
                    document_type=doc_type,
                    user_id=TEST_USER_ID,
                    title=f"Test {doc_type}",
                    tags=['test', 'classification'],
                    security_metadata={'classification_validation': True}
                )

                # Validate classification
                classification = upload_result.classification
                classification_results.append({
                    'expected': doc_type,
                    'predicted': classification['document_type'],
                    'confidence': classification['confidence']
                })

            # Calculate accuracy
            correct_classifications = sum(
                1 for result in classification_results 
                if result['expected'] == result['predicted']
            )
            accuracy = correct_classifications / len(classification_results)

            assert accuracy >= CLASSIFICATION_ACCURACY_THRESHOLD, \
                f"Classification accuracy {accuracy} below threshold {CLASSIFICATION_ACCURACY_THRESHOLD}"

            # Verify confidence scores
            low_confidence = [
                result for result in classification_results 
                if result['confidence'] < 0.90
            ]
            assert len(low_confidence) == 0, "Low confidence classifications detected"

        except Exception as e:
            logger.error(f"Classification accuracy test failed: {str(e)}")
            raise

    @pytest.mark.asyncio
    async def test_multi_region_replication(self):
        """Test document replication across multiple regions."""
        try:
            # Upload document
            upload_result = await self.doc_service.upload_document(
                document_content=self.test_document['content'],
                document_type=self.test_document['type'],
                user_id=TEST_USER_ID,
                title=self.test_document['title'],
                tags=self.test_document['tags'],
                security_metadata={'multi_region': True}
            )

            # Verify replication across regions
            for region in MULTI_REGION_BUCKETS:
                s3_client = boto3.client('s3', region_name=region)
                try:
                    response = s3_client.head_object(
                        Bucket=f'phrsat-documents-{region}',
                        Key=upload_result.storage_url.split('/')[-1]
                    )
                    assert response['ResponseMetadata']['HTTPStatusCode'] == 200, \
                        f"Document not replicated to region {region}"
                except Exception as e:
                    pytest.fail(f"Replication verification failed for region {region}: {str(e)}")

        except Exception as e:
            logger.error(f"Multi-region replication test failed: {str(e)}")
            raise

    @pytest.mark.asyncio
    async def test_document_access_control(self):
        """Test document access control and permissions."""
        try:
            # Upload document
            upload_result = await self.doc_service.upload_document(
                document_content=self.test_document['content'],
                document_type=self.test_document['type'],
                user_id=TEST_USER_ID,
                title=self.test_document['title'],
                tags=self.test_document['tags']
            )

            # Test unauthorized access
            unauthorized_user = "unauthorized_user_456"
            with pytest.raises(Exception) as exc_info:
                await self.doc_service.get_document(
                    upload_result.id,
                    unauthorized_user
                )
            assert "Access denied" in str(exc_info.value)

            # Test document sharing
            share_result = await self.doc_service.share_document(
                upload_result.id,
                TEST_USER_ID,
                ["shared_user_789"]
            )
            assert share_result is not None, "Document sharing failed"

            # Verify shared access
            shared_access = await self.doc_service.get_document(
                upload_result.id,
                "shared_user_789"
            )
            assert shared_access is not None, "Shared access failed"

        except Exception as e:
            logger.error(f"Access control test failed: {str(e)}")
            raise

    def _generate_test_document(self, doc_type: str) -> bytes:
        """Generate test document content for classification testing."""
        templates = {
            'lab_report': b'LABORATORY REPORT\nTest: Complete Blood Count\nResults: WBC: 7.5',
            'prescription': b'PRESCRIPTION\nMedication: Amoxicillin\nDosage: 500mg',
            'medical_record': b'MEDICAL RECORD\nChief Complaint: Fever\nAssessment: Upper respiratory infection',
            'radiology_report': b'RADIOLOGY REPORT\nProcedure: Chest X-ray\nFindings: Clear lung fields'
        }
        return templates.get(doc_type, b'Generic medical document content')