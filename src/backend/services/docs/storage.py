"""
Service module for secure document storage operations implementing HIPAA-compliant storage 
and retrieval of health documents using AWS S3 with encryption and comprehensive audit logging.

Version: 1.0.0
"""

import logging
from typing import Dict, Optional, Tuple, Union
import uuid

import boto3  # boto3 v1.26+
from botocore.exceptions import BotoCoreError, ClientError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential  # tenacity v8.2+

from core.security import SecurityManager
from api.docs.models import HealthDocument

# Configure logging
logger = logging.getLogger(__name__)

# Constants
DEFAULT_URL_EXPIRATION = 3600  # 1 hour
MAX_DOCUMENT_SIZE_BYTES = 104857600  # 100MB
SUPPORTED_STORAGE_REGIONS = ["us-east-1", "us-west-2", "eu-west-1"]
MAX_RETRY_ATTEMPTS = 3
RETRY_BACKOFF_FACTOR = 2
DOCUMENT_TYPES = {
    "medical_record": ".pdf",
    "lab_result": ".pdf",
    "imaging": ".dcm"
}

class S3OperationalError(Exception):
    """Custom exception for S3 operational errors."""
    pass

def validate_storage_config(config: Dict) -> Tuple[bool, str]:
    """
    Validate AWS S3 storage configuration with enhanced security checks.
    
    Args:
        config: Dictionary containing AWS configuration parameters
        
    Returns:
        Tuple of (is_valid, message)
    """
    try:
        required_keys = [
            'aws_access_key_id', 
            'aws_secret_access_key',
            'region_name',
            'bucket_name'
        ]
        
        # Check required configuration
        for key in required_keys:
            if key not in config:
                return False, f"Missing required configuration: {key}"
                
        # Validate region
        if config['region_name'] not in SUPPORTED_STORAGE_REGIONS:
            return False, f"Unsupported region: {config['region_name']}"
            
        # Initialize S3 client for validation
        s3_client = boto3.client(
            's3',
            aws_access_key_id=config['aws_access_key_id'],
            aws_secret_access_key=config['aws_secret_access_key'],
            region_name=config['region_name']
        )
        
        # Verify bucket exists and is accessible
        try:
            s3_client.head_bucket(Bucket=config['bucket_name'])
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            if error_code == '404':
                return False, f"Bucket does not exist: {config['bucket_name']}"
            elif error_code == '403':
                return False, "Insufficient permissions to access bucket"
            else:
                return False, f"Error accessing bucket: {str(e)}"
                
        # Verify bucket encryption
        encryption = s3_client.get_bucket_encryption(Bucket=config['bucket_name'])
        if not encryption.get('ServerSideEncryptionConfiguration'):
            return False, "Bucket encryption not configured"
            
        return True, "Configuration validated successfully"
        
    except Exception as e:
        logger.error(f"Configuration validation failed: {str(e)}")
        return False, f"Validation error: {str(e)}"

class DocumentStorageService:
    """
    Service class for secure document storage operations with HIPAA compliance,
    multi-region support, and comprehensive audit logging.
    """
    
    def __init__(self, config: Dict, security_manager: SecurityManager):
        """
        Initialize document storage service with AWS credentials and security manager.
        
        Args:
            config: AWS configuration dictionary
            security_manager: Instance of SecurityManager for encryption
        """
        # Validate configuration
        is_valid, message = validate_storage_config(config)
        if not is_valid:
            raise ValueError(f"Invalid storage configuration: {message}")
            
        self.storage_config = config
        self.security_manager = security_manager
        
        # Initialize S3 client with session
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=config['aws_access_key_id'],
            aws_secret_access_key=config['aws_secret_access_key'],
            region_name=config['region_name']
        )
        
        # Configure retry settings
        self.retry_config = {
            'max_attempts': MAX_RETRY_ATTEMPTS,
            'backoff_factor': RETRY_BACKOFF_FACTOR
        }
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
        
    @retry(
        retry=retry_if_exception_type(S3OperationalError),
        stop=stop_after_attempt(MAX_RETRY_ATTEMPTS),
        wait=wait_exponential(multiplier=RETRY_BACKOFF_FACTOR)
    )
    async def upload_document(
        self,
        document_data: bytes,
        user_id: str,
        document_type: str,
        metadata: Dict
    ) -> Tuple[bool, str, str]:
        """
        Upload encrypted document to S3 with retry logic and audit logging.
        
        Args:
            document_data: Binary document data
            user_id: ID of the user uploading the document
            document_type: Type of health document
            metadata: Additional document metadata
            
        Returns:
            Tuple of (success, storage_url, document_key)
        """
        try:
            # Validate document size
            if len(document_data) > MAX_DOCUMENT_SIZE_BYTES:
                raise ValueError("Document exceeds maximum size limit")
                
            # Generate unique document key
            document_key = f"{user_id}/{str(uuid.uuid4())}{DOCUMENT_TYPES.get(document_type, '.pdf')}"
            
            # Encrypt document data
            encrypted_data = self.security_manager.encrypt_phi(document_data)
            
            # Prepare upload metadata
            upload_metadata = {
                'user_id': user_id,
                'document_type': document_type,
                'encryption_version': '1.0',
                **metadata
            }
            
            # Upload to S3 with server-side encryption
            self.s3_client.put_object(
                Bucket=self.storage_config['bucket_name'],
                Key=document_key,
                Body=encrypted_data,
                Metadata=upload_metadata,
                ServerSideEncryption='aws:kms',
                ContentType='application/octet-stream'
            )
            
            # Generate storage URL
            storage_url = f"s3://{self.storage_config['bucket_name']}/{document_key}"
            
            # Log successful upload
            self.logger.info(
                f"Document uploaded successfully: {document_key}",
                extra={
                    'user_id': user_id,
                    'document_type': document_type,
                    'storage_url': storage_url
                }
            )
            
            return True, storage_url, document_key
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            self.logger.error(
                f"S3 upload failed: {error_code}",
                extra={'error': str(e)}
            )
            raise S3OperationalError(f"S3 upload failed: {str(e)}")
            
        except Exception as e:
            self.logger.error(
                "Document upload failed",
                extra={'error': str(e)}
            )
            raise
            
    async def download_document(
        self,
        storage_url: str,
        user_id: str
    ) -> Tuple[bool, Optional[bytes]]:
        """
        Download and decrypt document from S3 with access logging.
        
        Args:
            storage_url: S3 storage URL of the document
            user_id: ID of the user requesting download
            
        Returns:
            Tuple of (success, decrypted_data)
        """
        try:
            # Extract bucket and key from storage URL
            bucket = storage_url.split('/')[2]
            key = '/'.join(storage_url.split('/')[3:])
            
            # Download encrypted data
            response = self.s3_client.get_object(
                Bucket=bucket,
                Key=key
            )
            
            encrypted_data = response['Body'].read()
            
            # Decrypt document data
            decrypted_data = self.security_manager.decrypt_phi(encrypted_data)
            
            # Log access
            self.logger.info(
                f"Document downloaded: {key}",
                extra={
                    'user_id': user_id,
                    'storage_url': storage_url
                }
            )
            
            return True, decrypted_data
            
        except Exception as e:
            self.logger.error(
                f"Document download failed: {str(e)}",
                extra={
                    'storage_url': storage_url,
                    'user_id': user_id
                }
            )
            return False, None
            
    async def delete_document(
        self,
        storage_url: str,
        user_id: str
    ) -> bool:
        """
        Delete document from S3 with audit logging.
        
        Args:
            storage_url: S3 storage URL of the document
            user_id: ID of the user requesting deletion
            
        Returns:
            Boolean indicating success
        """
        try:
            # Extract bucket and key
            bucket = storage_url.split('/')[2]
            key = '/'.join(storage_url.split('/')[3:])
            
            # Delete object
            self.s3_client.delete_object(
                Bucket=bucket,
                Key=key
            )
            
            # Log deletion
            self.logger.info(
                f"Document deleted: {key}",
                extra={
                    'user_id': user_id,
                    'storage_url': storage_url
                }
            )
            
            return True
            
        except Exception as e:
            self.logger.error(
                f"Document deletion failed: {str(e)}",
                extra={
                    'storage_url': storage_url,
                    'user_id': user_id
                }
            )
            return False
            
    def generate_presigned_url(
        self,
        storage_url: str,
        expiration: int = DEFAULT_URL_EXPIRATION
    ) -> Optional[str]:
        """
        Generate presigned URL for temporary document access.
        
        Args:
            storage_url: S3 storage URL of the document
            expiration: URL expiration time in seconds
            
        Returns:
            Presigned URL string or None if generation fails
        """
        try:
            bucket = storage_url.split('/')[2]
            key = '/'.join(storage_url.split('/')[3:])
            
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': bucket,
                    'Key': key
                },
                ExpiresIn=expiration
            )
            
            return url
            
        except Exception as e:
            self.logger.error(f"Presigned URL generation failed: {str(e)}")
            return None