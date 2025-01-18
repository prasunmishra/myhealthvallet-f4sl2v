"""
Root initialization module for Personal Health Record Store and Analysis Tool (PHRSAT) backend services.
Provides unified interface for service initialization, health monitoring, and secure logging functionality.

Version: 1.0.0
"""

import logging
from typing import Dict, Optional

from prometheus_client import Counter, Histogram, Gauge
from circuitbreaker import circuit

from services.auth import JWTManager
from services.docs import DocumentProcessor, DocumentStorageService
from services.health import HealthKitService, GoogleFitClient
from core.config import Settings
from core.exceptions import ValidationError, HealthDataException
from core.logging import setup_logging

# Version tracking
VERSION = "1.0.0"

# Service status constants
SERVICE_STATUS = {
    "healthy": "healthy",
    "degraded": "degraded",
    "down": "down"
}

# Configure logging
LOGGER = setup_logging()

# Prometheus metrics
service_initialization = Counter(
    'phrsat_service_initialization_total',
    'Total service initialization attempts',
    ['service', 'status']
)

service_health = Gauge(
    'phrsat_service_health',
    'Service health status',
    ['service']
)

service_latency = Histogram(
    'phrsat_service_latency_seconds',
    'Service operation latency',
    ['service', 'operation']
)

@circuit(failure_threshold=5, recovery_timeout=60)
def initialize_services(config: Dict, security_context: Dict) -> Dict:
    """
    Initialize all required services with HIPAA compliance validation and monitoring.

    Args:
        config: Service configuration dictionary
        security_context: Security configuration and context

    Returns:
        Dict containing initialized service instances and their health status
    """
    try:
        services = {}
        
        # Initialize authentication service
        try:
            jwt_manager = JWTManager(
                settings=Settings(),
                redis_client=config.get('redis_client'),
                audit_logger=LOGGER
            )
            services['auth'] = {
                'instance': jwt_manager,
                'status': SERVICE_STATUS['healthy']
            }
            service_initialization.labels(service='auth', status='success').inc()
        except Exception as e:
            LOGGER.error(f"Auth service initialization failed: {str(e)}")
            services['auth'] = {
                'status': SERVICE_STATUS['down'],
                'error': str(e)
            }
            service_initialization.labels(service='auth', status='failure').inc()

        # Initialize document services
        try:
            doc_processor = DocumentProcessor(
                config=config.get('doc_config'),
                security_config=security_context
            )
            doc_storage = DocumentStorageService(
                config=config.get('storage_config'),
                security_manager=security_context.get('security_manager')
            )
            services['documents'] = {
                'processor': doc_processor,
                'storage': doc_storage,
                'status': SERVICE_STATUS['healthy']
            }
            service_initialization.labels(service='documents', status='success').inc()
        except Exception as e:
            LOGGER.error(f"Document services initialization failed: {str(e)}")
            services['documents'] = {
                'status': SERVICE_STATUS['down'],
                'error': str(e)
            }
            service_initialization.labels(service='documents', status='failure').inc()

        # Initialize health platform services
        try:
            health_services = {
                'apple': HealthKitService(config.get('apple_health_config', {})),
                'google': GoogleFitClient(config.get('google_fit_config', {}))
            }
            services['health_platforms'] = {
                'instances': health_services,
                'status': SERVICE_STATUS['healthy']
            }
            service_initialization.labels(service='health_platforms', status='success').inc()
        except Exception as e:
            LOGGER.error(f"Health platform services initialization failed: {str(e)}")
            services['health_platforms'] = {
                'status': SERVICE_STATUS['down'],
                'error': str(e)
            }
            service_initialization.labels(service='health_platforms', status='failure').inc()

        # Update service health metrics
        for service_name, service_info in services.items():
            service_health.labels(service=service_name).set(
                1 if service_info['status'] == SERVICE_STATUS['healthy'] else 0
            )

        return services

    except Exception as e:
        LOGGER.error(f"Service initialization failed: {str(e)}")
        raise ValidationError(
            message="Failed to initialize services",
            error_details={'error': str(e)}
        )

def get_service_health() -> Dict:
    """
    Get comprehensive health status of all services with detailed metrics.

    Returns:
        Dict containing detailed health status and metrics for each service
    """
    try:
        health_status = {
            'overall_status': SERVICE_STATUS['healthy'],
            'services': {},
            'metrics': {
                'total_services': 0,
                'healthy_services': 0,
                'degraded_services': 0,
                'down_services': 0
            }
        }

        # Check authentication service health
        auth_health = service_health.labels(service='auth').get()
        health_status['services']['auth'] = {
            'status': SERVICE_STATUS['healthy'] if auth_health == 1 else SERVICE_STATUS['down'],
            'metrics': {
                'latency': service_latency.labels(service='auth', operation='verify').get()
            }
        }

        # Check document services health
        doc_health = service_health.labels(service='documents').get()
        health_status['services']['documents'] = {
            'status': SERVICE_STATUS['healthy'] if doc_health == 1 else SERVICE_STATUS['down'],
            'metrics': {
                'processing_latency': service_latency.labels(
                    service='documents',
                    operation='process'
                ).get(),
                'storage_latency': service_latency.labels(
                    service='documents',
                    operation='store'
                ).get()
            }
        }

        # Check health platform services
        platform_health = service_health.labels(service='health_platforms').get()
        health_status['services']['health_platforms'] = {
            'status': SERVICE_STATUS['healthy'] if platform_health == 1 else SERVICE_STATUS['down'],
            'metrics': {
                'sync_latency': service_latency.labels(
                    service='health_platforms',
                    operation='sync'
                ).get()
            }
        }

        # Calculate overall metrics
        for service_info in health_status['services'].values():
            health_status['metrics']['total_services'] += 1
            if service_info['status'] == SERVICE_STATUS['healthy']:
                health_status['metrics']['healthy_services'] += 1
            elif service_info['status'] == SERVICE_STATUS['degraded']:
                health_status['metrics']['degraded_services'] += 1
            else:
                health_status['metrics']['down_services'] += 1

        # Determine overall status
        if health_status['metrics']['down_services'] > 0:
            health_status['overall_status'] = SERVICE_STATUS['down']
        elif health_status['metrics']['degraded_services'] > 0:
            health_status['overall_status'] = SERVICE_STATUS['degraded']

        return health_status

    except Exception as e:
        LOGGER.error(f"Health check failed: {str(e)}")
        raise HealthDataException(
            message="Failed to get service health status",
            error_details={'error': str(e)}
        )

# Export public interface
__all__ = [
    'VERSION',
    'SERVICE_STATUS',
    'initialize_services',
    'get_service_health',
    'JWTManager',
    'DocumentProcessor',
    'DocumentStorageService',
    'HealthKitService',
    'GoogleFitClient'
]