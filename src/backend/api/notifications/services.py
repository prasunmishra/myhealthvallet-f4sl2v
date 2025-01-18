"""
Core notification service orchestrator for PHRSAT system.
Manages secure notification delivery across multiple channels with HIPAA compliance.

Version: 1.0.0
"""

import asyncio
from typing import Dict, List, Optional
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.2+
import structlog  # structlog v23.1+
from prometheus_client import Counter, Histogram  # prometheus_client v0.17+
from cryptography.fernet import Fernet  # cryptography v41.0+

from api.notifications.models import Notification

# Performance metrics
NOTIFICATION_COUNTER = Counter(
    'notification_delivery_total',
    'Total number of notifications processed',
    ['channel', 'status']
)

DELIVERY_LATENCY = Histogram(
    'notification_delivery_latency_seconds',
    'Notification delivery latency in seconds',
    ['channel']
)

# Constants
DELIVERY_CHANNELS = ["email", "push", "sms"]
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 4
RATE_LIMIT_WINDOW = 3600
MAX_BATCH_SIZE = 100
ENCRYPTION_ALGORITHM = 'AES-256-GCM'
AUDIT_LOG_RETENTION_DAYS = 365

# Configure structured logger
logger = structlog.get_logger(__name__)

class NotificationService:
    """HIPAA-compliant notification service for secure multi-channel delivery."""

    def __init__(
        self,
        email_service,
        push_service,
        sms_service,
        rate_limit_config: Dict[str, int]
    ):
        """Initialize notification service with channel services and security configs."""
        self._email_service = email_service
        self._push_service = push_service
        self._sms_service = sms_service
        self._logger = structlog.get_logger(__name__)
        
        # Initialize rate limiters for each channel
        self._channel_rate_limiters = {
            channel: {
                'limit': rate_limit_config.get(channel, 100),
                'window': RATE_LIMIT_WINDOW,
                'current': 0,
                'reset_time': asyncio.get_event_loop().time() + RATE_LIMIT_WINDOW
            }
            for channel in DELIVERY_CHANNELS
        }
        
        # Initialize delivery metrics
        self._delivery_metrics = {
            channel: {
                'success': 0,
                'failure': 0,
                'latency': []
            }
            for channel in DELIVERY_CHANNELS
        }
        
        self._logger.info("NotificationService initialized", 
                         channels=DELIVERY_CHANNELS,
                         rate_limits=rate_limit_config)

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY_SECONDS)
    )
    async def send_notification(
        self,
        notification: Notification,
        channels: List[str],
        delivery_info: Dict,
        security_context: Dict
    ) -> Dict:
        """Send notification through specified channels with security validation."""
        delivery_results = {}
        start_time = asyncio.get_event_loop().time()

        try:
            # Validate notification content and security context
            self._validate_notification(notification, security_context)
            
            # Check rate limits for requested channels
            self._check_rate_limits(channels)
            
            # Encrypt sensitive content if needed
            encrypted_content = self._encrypt_sensitive_content(
                notification.content,
                security_context
            )
            
            # Create delivery tasks for each channel
            delivery_tasks = []
            for channel in channels:
                delivery_tasks.append(
                    self._deliver_to_channel(
                        channel,
                        notification,
                        encrypted_content,
                        delivery_info.get(channel, {}),
                        security_context
                    )
                )
            
            # Execute deliveries concurrently
            channel_results = await asyncio.gather(
                *delivery_tasks,
                return_exceptions=True
            )
            
            # Process results and update metrics
            for channel, result in zip(channels, channel_results):
                if isinstance(result, Exception):
                    delivery_results[channel] = {
                        'status': 'failed',
                        'error': str(result)
                    }
                    NOTIFICATION_COUNTER.labels(
                        channel=channel,
                        status='failed'
                    ).inc()
                else:
                    delivery_results[channel] = {
                        'status': 'delivered',
                        'delivery_id': result
                    }
                    NOTIFICATION_COUNTER.labels(
                        channel=channel,
                        status='success'
                    ).inc()
                
                # Record latency
                latency = asyncio.get_event_loop().time() - start_time
                DELIVERY_LATENCY.labels(channel=channel).observe(latency)
            
            # Update notification status
            await notification.mark_as_sent()
            
            # Log delivery completion
            self._logger.info(
                "Notification delivered",
                notification_id=str(notification.id),
                channels=channels,
                results=delivery_results
            )
            
            return delivery_results

        except Exception as e:
            self._logger.error(
                "Notification delivery failed",
                notification_id=str(notification.id),
                error=str(e)
            )
            raise

    async def _deliver_to_channel(
        self,
        channel: str,
        notification: Notification,
        encrypted_content: Dict,
        channel_config: Dict,
        security_context: Dict
    ) -> str:
        """Deliver notification through specific channel with security measures."""
        try:
            service = self._get_channel_service(channel)
            
            # Apply channel-specific transformations
            formatted_content = self._format_for_channel(
                channel,
                encrypted_content,
                channel_config
            )
            
            # Send through channel service
            delivery_id = await service.send(
                notification.user_id,
                formatted_content,
                channel_config,
                security_context
            )
            
            # Update channel metrics
            self._update_channel_metrics(channel, 'success')
            
            return delivery_id

        except Exception as e:
            self._update_channel_metrics(channel, 'failure')
            raise

    def _get_channel_service(self, channel: str):
        """Get appropriate service instance for channel."""
        services = {
            'email': self._email_service,
            'push': self._push_service,
            'sms': self._sms_service
        }
        return services.get(channel)

    def _validate_notification(
        self,
        notification: Notification,
        security_context: Dict
    ) -> None:
        """Validate notification content and security requirements."""
        if not notification.content:
            raise ValueError("Notification content cannot be empty")
            
        if not security_context.get('encryption_key'):
            raise ValueError("Encryption key required for secure delivery")
            
        # Additional HIPAA compliance checks
        if notification.type == 'health_alert':
            if not security_context.get('phi_authorized'):
                raise ValueError("PHI authorization required for health alerts")

    def _check_rate_limits(self, channels: List[str]) -> None:
        """Check rate limits for requested channels."""
        current_time = asyncio.get_event_loop().time()
        
        for channel in channels:
            limiter = self._channel_rate_limiters[channel]
            
            # Reset counter if window expired
            if current_time > limiter['reset_time']:
                limiter['current'] = 0
                limiter['reset_time'] = current_time + limiter['window']
            
            # Check limit
            if limiter['current'] >= limiter['limit']:
                raise ValueError(f"Rate limit exceeded for channel: {channel}")
            
            limiter['current'] += 1

    def _encrypt_sensitive_content(
        self,
        content: Dict,
        security_context: Dict
    ) -> Dict:
        """Encrypt sensitive notification content."""
        if not content.get('sensitive'):
            return content
            
        fernet = Fernet(security_context['encryption_key'])
        encrypted_content = {
            key: fernet.encrypt(str(value).encode()).decode()
            for key, value in content.items()
            if key != 'sensitive'
        }
        encrypted_content['sensitive'] = True
        
        return encrypted_content

    def _format_for_channel(
        self,
        channel: str,
        content: Dict,
        channel_config: Dict
    ) -> Dict:
        """Format notification content for specific channel."""
        formatters = {
            'email': self._format_email_content,
            'push': self._format_push_content,
            'sms': self._format_sms_content
        }
        return formatters[channel](content, channel_config)

    def _format_email_content(
        self,
        content: Dict,
        config: Dict
    ) -> Dict:
        """Format content for email delivery."""
        return {
            'subject': content.get('title', 'PHRSAT Notification'),
            'body': content.get('body', ''),
            'template': config.get('template', 'default'),
            'attachments': content.get('attachments', [])
        }

    def _format_push_content(
        self,
        content: Dict,
        config: Dict
    ) -> Dict:
        """Format content for push notification."""
        return {
            'title': content.get('title', 'PHRSAT'),
            'body': content.get('body', ''),
            'data': content.get('data', {}),
            'priority': config.get('priority', 'high')
        }

    def _format_sms_content(
        self,
        content: Dict,
        config: Dict
    ) -> Dict:
        """Format content for SMS delivery."""
        return {
            'message': f"{content.get('title', '')}: {content.get('body', '')}",
            'priority': config.get('priority', 'normal')
        }

    def _update_channel_metrics(
        self,
        channel: str,
        status: str
    ) -> None:
        """Update delivery metrics for channel."""
        metrics = self._delivery_metrics[channel]
        metrics[status] += 1

def create_notification_service(
    config: Dict,
    security_context: Dict
) -> NotificationService:
    """Factory function to create NotificationService instance."""
    # Validate configuration
    required_keys = ['email_service', 'push_service', 'sms_service']
    if not all(key in config for key in required_keys):
        raise ValueError("Missing required configuration keys")
        
    # Create service instance
    service = NotificationService(
        email_service=config['email_service'],
        push_service=config['push_service'],
        sms_service=config['sms_service'],
        rate_limit_config=config.get('rate_limits', {})
    )
    
    logger.info(
        "NotificationService created",
        config=config,
        security_context=security_context
    )
    
    return service