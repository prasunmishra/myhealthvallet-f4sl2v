"""
Celery worker configuration module for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements HIPAA-compliant distributed task queue with advanced monitoring and security features.

Version: 1.0.0
"""

from celery import Celery  # celery v5.3+
import structlog  # structlog v23.1+
from kombu import Queue, Exchange  # kombu v5.3+
from prometheus_client import Counter, Histogram  # prometheus_client v0.17+
from opentelemetry import trace  # opentelemetry-api v1.19+

from core.config import settings
from workers.tasks.docs import process_document_ocr
from workers.tasks.health import sync_health_platform_data, analyze_health_metrics

# Configure structured logging with HIPAA compliance
logger = structlog.get_logger(__name__)

# Define queue names with priorities
QUEUE_NAMES = ["document-ocr", "health-sync", "health-analysis", "notifications"]
TASK_PRIORITIES = {"high": 9, "default": 5, "low": 1}

# Configure worker pools based on task types
WORKER_POOLS = {
    "document-ocr": "memory",  # Memory-optimized for document processing
    "health-analysis": "gpu",  # GPU-optimized for ML analysis
    "default": "prefork"
}

# Prometheus metrics
task_latency = Histogram(
    'celery_task_latency_seconds',
    'Task execution time in seconds',
    ['task_name', 'queue']
)
task_count = Counter(
    'celery_tasks_total',
    'Number of tasks processed',
    ['task_name', 'status']
)

def create_celery():
    """
    Factory function to create and configure a HIPAA-compliant Celery application
    with advanced monitoring and security features.
    """
    # Initialize Celery with secure broker and backend
    app = Celery('phrsat_workers')
    
    # Apply configuration
    app.config_from_object(CeleryConfig)
    
    # Register tasks
    app.tasks.register(process_document_ocr)
    app.tasks.register(sync_health_platform_data)
    app.tasks.register(analyze_health_metrics)
    
    # Configure task routing
    app.conf.task_routes = configure_task_routes()
    
    # Setup monitoring hooks
    app.conf.task_track_started = True
    app.conf.task_track_received = True
    app.conf.worker_send_task_events = True
    
    # Configure distributed tracing
    tracer = trace.get_tracer(__name__)
    
    @app.task_prerun.connect
    def task_prerun(task_id, task, *args, **kwargs):
        with tracer.start_as_current_span(task.name) as span:
            span.set_attribute("celery.task_id", task_id)
            task_count.labels(task_name=task.name, status="started").inc()

    @app.task_postrun.connect
    def task_postrun(task_id, task, *args, retval=None, state=None, **kwargs):
        task_count.labels(task_name=task.name, status=state).inc()
        
    return app

class CeleryConfig:
    """HIPAA-compliant Celery worker configuration with enhanced security and monitoring."""
    
    # Secure broker and backend configuration
    broker_url = settings.REDIS_URL
    result_backend = settings.REDIS_URL
    
    # Security settings
    security_key = settings.SECURITY_KEY
    task_serializer = 'json'
    result_serializer = 'json'
    accept_content = ['json']
    
    # Task execution settings
    task_acks_late = True
    task_reject_on_worker_lost = True
    task_track_started = True
    
    # Worker pool configuration
    worker_prefetch_multiplier = 1
    worker_max_tasks_per_child = 1000
    worker_max_memory_per_child = 400000  # 400MB
    
    # Queue high-availability settings
    task_queue_ha_policy = 'all'
    broker_transport_options = {
        'visibility_timeout': 3600,
        'max_retries': 3,
        'interval_start': 0,
        'interval_step': 0.2,
        'interval_max': 0.5,
    }
    
    # Task routing configuration
    task_default_queue = 'default'
    task_queues = (
        Queue('document-ocr', Exchange('document-ocr'), routing_key='document.#'),
        Queue('health-sync', Exchange('health-sync'), routing_key='health.sync.#'),
        Queue('health-analysis', Exchange('health-analysis'), routing_key='health.analysis.#'),
        Queue('notifications', Exchange('notifications'), routing_key='notification.#'),
    )
    
    # Monitoring configuration
    worker_send_task_events = True
    task_send_sent_event = True
    
    # Error handling
    task_soft_time_limit = 3600
    task_time_limit = 3600 * 2
    broker_connection_retry = True
    broker_connection_max_retries = 0
    
    # Task result settings
    result_expires = 3600 * 24 * 7  # 7 days
    result_compression = 'gzip'

def configure_task_routes():
    """Configure secure task routing with priority queues and load balancing."""
    return {
        # Document processing tasks
        'process_document_ocr': {
            'queue': 'document-ocr',
            'routing_key': 'document.ocr',
            'priority': TASK_PRIORITIES['high']
        },
        
        # Health data tasks
        'sync_health_platform_data': {
            'queue': 'health-sync',
            'routing_key': 'health.sync',
            'priority': TASK_PRIORITIES['default']
        },
        'analyze_health_metrics': {
            'queue': 'health-analysis',
            'routing_key': 'health.analysis',
            'priority': TASK_PRIORITIES['default']
        },
        
        # Default routing
        '*': {
            'queue': 'default',
            'routing_key': 'default',
            'priority': TASK_PRIORITIES['low']
        }
    }

# Create Celery application instance
celery_app = create_celery()