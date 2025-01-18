"""
Push notification service module for PHRSAT using Firebase Cloud Messaging (FCM).
Implements secure notification delivery with monitoring, compliance, and performance features.

Version: 1.0.0
"""

import json
import asyncio
from typing import Dict, List, Optional
from datetime import datetime

import firebase_admin  # firebase-admin v5.0+
from firebase_admin import credentials, messaging
import aiohttp  # aiohttp v3.8+
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.0+
from prometheus_client import Counter, Histogram, Gauge  # prometheus_client v0.16+

from api.notifications.models import Notification
from core.config import get_settings
from core.logging import get_logger
from core.security import TokenEncryption

# Global constants
BATCH_SIZE = 500
MAX_RETRIES = 3
DEFAULT_TTL = 86400  # 24 hours in seconds
MAX_PAYLOAD_SIZE = 4096  # bytes
TOKEN_ROTATION_INTERVAL = 604800  # 7 days in seconds
RATE_LIMIT_PER_DEVICE = 100  # notifications per hour
COMPRESSION_THRESHOLD = 1024  # bytes

class PushNotificationService:
    """Enhanced service for managing and sending push notifications with security and monitoring."""

    def __init__(self):
        """Initialize push notification service with security and monitoring features."""
        # Initialize logger
        self._logger = get_logger(__name__, {
            'service': 'push_notification',
            'version': '1.0.0'
        })

        # Load configuration
        self._config = get_settings()
        
        # Initialize Firebase Admin SDK
        cred = credentials.Certificate(self._config.FIREBASE_CREDENTIALS_PATH)
        self._fcm_app = firebase_admin.initialize_app(cred)
        
        # Initialize token encryption
        self._token_encryption = TokenEncryption(self._config.ENCRYPTION_KEY)
        
        # Initialize metrics
        self._notification_counter = Counter(
            'phrsat_push_notifications_total',
            'Total push notifications sent',
            ['status', 'type']
        )
        self._delivery_latency = Histogram(
            'phrsat_push_notification_latency_seconds',
            'Push notification delivery latency'
        )
        self._active_connections = Gauge(
            'phrsat_push_notification_active_connections',
            'Number of active FCM connections'
        )

    @retry(stop=stop_after_attempt(3), 
           wait=wait_exponential(multiplier=1, min=4, max=10))
    async def send_notification(self, notification: Notification, 
                              device_tokens: List[str]) -> Dict:
        """Send secure push notification to specified devices with monitoring."""
        start_time = datetime.utcnow()
        results = {
            'success': 0,
            'failure': 0,
            'invalid_tokens': [],
            'errors': []
        }

        try:
            # Validate and create payload
            payload = create_notification_payload(notification)
            
            # Decrypt device tokens
            decrypted_tokens = [
                self._token_encryption.decrypt_token(token)
                for token in device_tokens
            ]
            
            # Prepare FCM message
            message = messaging.MulticastMessage(
                tokens=decrypted_tokens,
                data=payload['data'],
                notification=messaging.Notification(
                    title=payload['notification']['title'],
                    body=payload['notification']['body']
                ),
                android=messaging.AndroidConfig(
                    ttl=DEFAULT_TTL,
                    priority='high',
                    notification=messaging.AndroidNotification(
                        icon='notification_icon',
                        color='#2196F3'
                    )
                ),
                apns=messaging.APNSConfig(
                    headers={'apns-priority': '10'},
                    payload=messaging.APNSPayload(
                        aps=messaging.Aps(
                            alert=messaging.ApsAlert(
                                title=payload['notification']['title'],
                                body=payload['notification']['body']
                            ),
                            sound='default'
                        )
                    )
                )
            )

            # Send notification batch
            batch_response = await messaging.send_multicast(message)
            
            # Process response
            results['success'] = batch_response.success_count
            results['failure'] = batch_response.failure_count
            
            for idx, response in enumerate(batch_response.responses):
                if not response.success:
                    error = {
                        'token': device_tokens[idx],
                        'error': str(response.exception)
                    }
                    results['errors'].append(error)
                    
                    if response.exception.code == 'invalid-argument':
                        results['invalid_tokens'].append(device_tokens[idx])

            # Update metrics
            self._notification_counter.labels(
                status='success',
                type=notification.type
            ).inc(results['success'])
            
            self._notification_counter.labels(
                status='failure',
                type=notification.type
            ).inc(results['failure'])
            
            # Record latency
            delivery_time = (datetime.utcnow() - start_time).total_seconds()
            self._delivery_latency.observe(delivery_time)
            
            # Mark notification as sent
            if results['success'] > 0:
                notification.mark_as_sent()

        except Exception as e:
            self._logger.error(f"Error sending push notification: {str(e)}")
            results['errors'].append({
                'error': str(e),
                'type': 'system_error'
            })
            raise

        return results

def create_notification_payload(notification: Notification) -> Dict:
    """Create secure FCM-compatible notification payload with validation."""
    try:
        # Get notification content
        content = notification.content.to_dict()
        
        # Create base payload
        payload = {
            'notification': {
                'title': content['title'],
                'body': content['body']
            },
            'data': {
                'type': notification.type,
                'id': str(notification.id),
                'created_at': notification.created_at.isoformat(),
                'metadata': json.dumps(notification.metadata)
            }
        }
        
        # Add priority based on notification type
        if notification.priority == 'critical':
            payload['priority'] = 'high'
        
        # Add additional data if available
        if content.get('data'):
            payload['data'].update(content['data'])
        
        # Validate payload size
        payload_size = len(json.dumps(payload).encode('utf-8'))
        if payload_size > MAX_PAYLOAD_SIZE:
            raise ValueError(f"Payload size {payload_size} exceeds maximum of {MAX_PAYLOAD_SIZE} bytes")
        
        return payload

    except Exception as e:
        raise ValueError(f"Error creating notification payload: {str(e)}")