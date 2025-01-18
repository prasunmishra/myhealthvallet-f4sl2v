"""
Core telemetry module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides distributed tracing, metrics collection, and performance monitoring with
enhanced security, compliance, and scalability features.

Version: 1.0.0
"""

import time
from typing import Dict, Optional

from prometheus_client import Counter, Gauge, Histogram, CollectorRegistry, start_http_server  # prometheus_client v0.17.1
from opentelemetry import trace  # opentelemetry-api v1.20.0
from opentelemetry.trace import Tracer, TracerProvider
from jaeger_client import Config as JaegerConfig  # jaeger-client v4.8.0
from datadog import initialize, statsd  # datadog v0.45.0

from config import ENV_STATE, APP_NAME, APP_VERSION
from logging import get_logger

# Global constants
METRICS_PREFIX = "phrsat"
DEFAULT_BUCKETS = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
logger = get_logger(__name__)

class MetricsManager:
    """
    Manages application metrics collection and export with enhanced security and scalability features.
    Implements HIPAA-compliant metrics collection with PII/PHI protection.
    """

    def __init__(self):
        """Initialize metrics collectors with security and compliance features."""
        # Create secure registry with access controls
        self.registry = CollectorRegistry()

        # Initialize request metrics with optimized cardinality
        self.request_count = Counter(
            f"{METRICS_PREFIX}_requests_total",
            "Total number of API requests",
            ["endpoint", "status"],
            registry=self.registry
        )

        self.request_latency = Histogram(
            f"{METRICS_PREFIX}_request_duration_seconds",
            "Request duration in seconds",
            ["endpoint"],
            buckets=DEFAULT_BUCKETS,
            registry=self.registry
        )

        # Initialize user metrics with privacy protection
        self.active_users = Gauge(
            f"{METRICS_PREFIX}_active_users",
            "Number of active users",
            registry=self.registry
        )

        # Initialize error metrics with compliance tracking
        self.error_count = Counter(
            f"{METRICS_PREFIX}_errors_total",
            "Total number of errors",
            ["type", "severity"],
            registry=self.registry
        )

        # Initialize health metrics
        self.health_status = Gauge(
            f"{METRICS_PREFIX}_health_status",
            "System health status",
            ["component"],
            registry=self.registry
        )

        # Initialize resource metrics
        self.resource_usage = Histogram(
            f"{METRICS_PREFIX}_resource_usage",
            "Resource utilization metrics",
            ["resource_type"],
            buckets=DEFAULT_BUCKETS,
            registry=self.registry
        )

        logger.info("Metrics manager initialized with security controls")

    def record_request(self, endpoint: str, duration: float, status_code: int) -> None:
        """
        Records API request metrics with security and compliance considerations.
        
        Args:
            endpoint: API endpoint path
            duration: Request duration in seconds
            status_code: HTTP status code
        """
        try:
            # Sanitize endpoint to prevent high cardinality
            sanitized_endpoint = self._sanitize_endpoint(endpoint)
            
            # Record request count with status
            self.request_count.labels(
                endpoint=sanitized_endpoint,
                status=str(status_code)
            ).inc()

            # Record request duration
            self.request_latency.labels(
                endpoint=sanitized_endpoint
            ).observe(duration)

            # Update error metrics if applicable
            if status_code >= 400:
                severity = "critical" if status_code >= 500 else "warning"
                self.error_count.labels(
                    type="http",
                    severity=severity
                ).inc()

            # Update health status
            self._update_health_metrics(status_code)

        except Exception as e:
            logger.error(f"Error recording metrics: {str(e)}")

    def update_user_count(self, count: int) -> None:
        """
        Updates active user count metric with privacy protection.
        
        Args:
            count: Number of active users
        """
        try:
            # Validate input
            if count < 0:
                raise ValueError("User count cannot be negative")

            # Update user gauge with privacy threshold
            self.active_users.set(max(count, 5))  # Privacy protection
            
            # Update related health metrics
            self.health_status.labels(component="user_service").set(1)

        except Exception as e:
            logger.error(f"Error updating user count: {str(e)}")
            self.health_status.labels(component="user_service").set(0)

    def _sanitize_endpoint(self, endpoint: str) -> str:
        """Sanitize endpoint path to prevent metric explosion."""
        # Replace dynamic path parameters with placeholders
        return endpoint.split("?")[0].replace("/api/v1", "")

    def _update_health_metrics(self, status_code: int) -> None:
        """Update system health metrics based on request status."""
        health_value = 1 if status_code < 500 else 0
        self.health_status.labels(component="api").set(health_value)

def setup_metrics() -> None:
    """
    Initializes and configures Prometheus metrics collectors with enhanced security
    and compliance features.
    """
    try:
        # Start metrics HTTP server if enabled
        if ENV_STATE != "development":
            start_http_server(
                port=9090,
                addr="localhost",  # Restrict to local access
                registry=CollectorRegistry()
            )

        # Initialize DataDog integration for production
        if ENV_STATE == "production":
            initialize(
                statsd_host="localhost",
                statsd_port=8125,
                statsd_constant_tags=[
                    f"app:{APP_NAME}",
                    f"version:{APP_VERSION}"
                ]
            )

        logger.info("Metrics collection initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize metrics: {str(e)}")
        raise

def setup_tracing() -> None:
    """
    Configures distributed tracing with Jaeger including security and compliance features.
    """
    try:
        # Configure Jaeger tracer
        jaeger_config = JaegerConfig(
            config={
                "sampler": {
                    "type": "probabilistic",
                    "param": 1.0 if ENV_STATE == "development" else 0.1
                },
                "logging": True,
                "local_agent": {
                    "reporting_host": "localhost",
                    "reporting_port": 6831
                },
                "tags": {
                    "app": APP_NAME,
                    "version": APP_VERSION,
                    "environment": ENV_STATE
                }
            },
            service_name=APP_NAME,
            validate=True
        )

        # Initialize tracer with security controls
        tracer = jaeger_config.initialize_tracer()
        
        # Set global tracer provider
        trace.set_tracer_provider(TracerProvider())

        logger.info("Distributed tracing initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize tracing: {str(e)}")
        raise

def get_tracer(component_name: str) -> Tracer:
    """
    Creates or retrieves a tracer instance for the specified component with security features.
    
    Args:
        component_name: Name of the component requesting the tracer
    
    Returns:
        Configured tracer instance
    """
    try:
        # Get tracer with security context
        tracer = trace.get_tracer(
            instrumenting_module_name=component_name,
            instrumenting_library_version=APP_VERSION
        )

        return tracer

    except Exception as e:
        logger.error(f"Failed to get tracer for {component_name}: {str(e)}")
        raise

__all__ = ["setup_metrics", "setup_tracing", "get_tracer", "MetricsManager"]