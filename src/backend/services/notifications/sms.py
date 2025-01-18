"""
Enhanced SMS notification service implementation providing secure, reliable, and HIPAA-compliant 
SMS message delivery using AWS SNS with comprehensive audit logging and encryption.

Version: 1.0.0
"""

import json
import re
from typing import Dict, Optional
from datetime import datetime

import boto3  # boto3 v1.28+
from botocore.exceptions import ClientError  # botocore v1.31+
from pydantic import BaseModel, Field, validator  # pydantic v1.10+
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.2+
from cryptography.fernet import Fernet  # cryptography v41.0+

from core.config import Settings
from core.logging import get_logger
from core.security import SecurityManager

# Initialize secure logger with PII context
logger = get_logger(__name__, security_context={"service": "sms_notifications"})

# Constants
DEFAULT_RETRY_ATTEMPTS = 3
MAX_MESSAGE_LENGTH = 160
SMS_ATTRIBUTES = {
    "DefaultSenderID": "PHRSAT",
    "DefaultSMSType": "Transactional",
    "SecurityProtocol": "TLS1.2"
}
ENCRYPTION_ALGORITHM = "AES-256-GCM"
AUDIT_LOG_RETENTION = 90
PII_PATTERNS = ["phone", "email", "name", "address"]

class SMSMessage(BaseModel):
    """Enhanced Pydantic model for SMS message validation with encryption support."""
    
    phone_number: str = Field(..., regex=r'^\+[1-9]\d{1,14}$')
    message: str = Field(..., max_length=MAX_MESSAGE_LENGTH)
    sender_id: str = Field(default="PHRSAT")
    template_id: Optional[str] = None
    template_data: Optional[Dict] = None
    correlation_id: Optional[str] = None
    contains_phi: bool = Field(default=False)
    encryption_key_id: Optional[str] = None

    @validator('phone_number')
    def validate_phone_number(cls, v):
        """Validate phone number format and sanitize."""
        v = re.sub(r'[^\+0-9]', '', v)
        if not re.match(r'^\+[1-9]\d{1,14}$', v):
            raise ValueError('Invalid phone number format')
        return v

    @validator('message')
    def validate_message(cls, v, values):
        """Validate message content and length."""
        if len(v) > MAX_MESSAGE_LENGTH:
            raise ValueError(f'Message exceeds maximum length of {MAX_MESSAGE_LENGTH}')
        if values.get('contains_phi', False) and not values.get('encryption_key_id'):
            raise ValueError('Encryption key required for messages containing PHI')
        return v

class SMSService:
    """Enhanced service class for secure SMS notifications via AWS SNS."""

    def __init__(self):
        """Initialize SMS service with enhanced security features."""
        self._sns_client = boto3.client(
            'sns',
            aws_access_key_id=Settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=Settings.AWS_SECRET_ACCESS_KEY,
            region_name=Settings.AWS_REGION,
            config=boto3.client.Config(
                retries={'max_attempts': DEFAULT_RETRY_ATTEMPTS},
                connect_timeout=5,
                read_timeout=5
            )
        )
        self._security_manager = SecurityManager(Settings)
        self._logger = logger
        self._setup_sns_attributes()

    def _setup_sns_attributes(self):
        """Configure SNS attributes with security settings."""
        try:
            self._sns_client.set_sms_attributes(attributes=SMS_ATTRIBUTES)
        except ClientError as e:
            self._logger.error(f"Failed to set SNS attributes: {str(e)}")
            raise RuntimeError("SMS service initialization failed")

    @retry(
        stop=stop_after_attempt(DEFAULT_RETRY_ATTEMPTS),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def send_sms(self, message: SMSMessage) -> Dict:
        """Send encrypted SMS with comprehensive audit logging."""
        try:
            # Generate audit context
            audit_context = {
                "correlation_id": message.correlation_id or f"sms_{datetime.utcnow().timestamp()}",
                "sender_id": message.sender_id,
                "timestamp": datetime.utcnow().isoformat()
            }

            # Encrypt message if contains PHI
            message_content = message.message
            if message.contains_phi:
                message_content = self._security_manager.encrypt_phi(
                    message.message,
                    validate_entropy=True
                ).decode()

            # Prepare SNS parameters
            sns_params = {
                "PhoneNumber": message.phone_number,
                "Message": message_content,
                "MessageAttributes": {
                    "AWS.SNS.SMS.SenderID": {
                        "DataType": "String",
                        "StringValue": message.sender_id
                    },
                    "AWS.SNS.SMS.SMSType": {
                        "DataType": "String",
                        "StringValue": "Transactional"
                    }
                }
            }

            # Send message via SNS
            response = self._sns_client.publish(**sns_params)
            
            # Log success with PII redaction
            self._logger.info(
                "SMS sent successfully",
                extra={
                    **audit_context,
                    "message_id": response.get("MessageId"),
                    "status": "delivered"
                }
            )

            return {
                "message_id": response.get("MessageId"),
                "status": "delivered",
                "correlation_id": audit_context["correlation_id"],
                "timestamp": audit_context["timestamp"]
            }

        except ClientError as e:
            self._logger.error(
                f"SMS delivery failed: {str(e)}",
                extra={
                    **audit_context,
                    "error_code": e.response["Error"]["Code"],
                    "status": "failed"
                }
            )
            raise

    def validate_phone_number(self, phone_number: str) -> bool:
        """Enhanced phone number validation with security checks."""
        try:
            # Sanitize input
            sanitized = re.sub(r'[^\+0-9]', '', phone_number)
            
            # Validate format
            if not re.match(r'^\+[1-9]\d{1,14}$', sanitized):
                return False

            # Additional security checks
            if len(sanitized) < 8:  # Minimum length check
                return False

            return True
        except Exception as e:
            self._logger.error(f"Phone number validation failed: {str(e)}")
            return False

def create_sms_service(config: Optional[Dict] = None) -> SMSService:
    """Enhanced factory function for secure SMS service creation."""
    try:
        service = SMSService()
        logger.info("SMS service created successfully")
        return service
    except Exception as e:
        logger.error(f"Failed to create SMS service: {str(e)}")
        raise RuntimeError("SMS service creation failed") from e