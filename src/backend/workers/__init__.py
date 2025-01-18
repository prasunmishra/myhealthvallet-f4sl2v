"""
Initialization module for the Personal Health Record Store and Analysis Tool (PHRSAT) worker system.
Configures and exports the Celery application instance and task functions for asynchronous processing
with HIPAA compliance and comprehensive monitoring.

Version: 1.0.0
"""

import structlog  # v23.1+
from prometheus_client import Counter  # v0.17+
from opentelemetry import trace  # v1.19+

from workers.celery import celery_app
from workers.tasks.docs import process_document_ocr
from workers.tasks.health import sync_health_platform_data, analyze_health_metrics
from workers.tasks.notifications import send_notification, send_batch_notifications

# Configure structured logging with HIPAA compliance
logger = structlog.get_logger(__name__).bind(component='worker_init')

# Configure metrics prefix for worker monitoring
METRICS_PREFIX = "phrsat_worker"

# Initialize task performance metrics
task_counter = Counter(
    'phrsat_worker_tasks_total',
    'Total tasks processed',
    ['task_name', 'status']
)

# Initialize distributed tracing
tracer = trace.get_tracer(__name__)

# Export Celery application instance and task functions
__all__ = [
    "celery_app",
    "process_document_ocr",
    "sync_health_platform_data", 
    "analyze_health_metrics",
    "send_notification",
    "send_batch_notifications"
]

# Log worker initialization
logger.info(
    "PHRSAT worker system initialized",
    exported_tasks=len(__all__) - 1,  # Subtract celery_app from count
    metrics_prefix=METRICS_PREFIX
)