"""
Initialization module for Celery worker tasks in the PHRSAT system.
Exposes HIPAA-compliant task functions for document processing, health data operations,
and notifications with comprehensive logging and security features.

Version: 1.0.0
"""

import structlog  # v23.1+

# Import document processing tasks
from tasks.docs import (
    process_document_ocr,
    get_processing_status
)

# Import health data tasks
from tasks.health import (
    sync_health_platform_data,
    analyze_health_metrics,
    generate_health_report
)

# Import notification tasks
from tasks.notifications import (
    send_notification,
    send_batch_notifications
)

# Initialize structured logger with HIPAA compliance
logger = structlog.get_logger(__name__)

# Export task functions
__all__ = [
    # Document processing tasks
    "process_document_ocr",
    "get_processing_status",
    
    # Health data tasks
    "sync_health_platform_data",
    "analyze_health_metrics",
    "generate_health_report",
    
    # Notification tasks
    "send_notification",
    "send_batch_notifications"
]

# Log module initialization
logger.info(
    "Celery tasks initialized",
    module="tasks",
    tasks=__all__,
    security_level="HIPAA_COMPLIANT"
)