"""
API package initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Configures and exports a HIPAA-compliant FastAPI application instance with comprehensive
security middleware, authentication, monitoring, and audit logging capabilities.

Version: 1.0.0
"""

from fastapi import FastAPI  # fastapi v0.100+
from fastapi.middleware.cors import CORSMiddleware  # fastapi v0.100+
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware  # fastapi v0.100+
from prometheus_fastapi_instrumentator import PrometheusMiddleware  # prometheus-fastapi-instrumentator v5.9.1+

from api.main import create_application
from api.settings import APISettings
from api.middleware.security import SecurityMiddleware

# Version information
VERSION = "1.0.0"
__version__ = VERSION

# Initialize API settings
settings = APISettings()

# Create FastAPI application instance
app = create_application()

# Initialize security middleware
security_middleware = SecurityMiddleware()

def initialize_security(app: FastAPI, settings: APISettings) -> None:
    """Configure security middleware and HIPAA compliance settings."""
    # Add HTTPS redirect in production
    if settings.ENV_STATE == "production":
        app.add_middleware(HTTPSRedirectMiddleware)

    # Configure CORS with strict security policies
    app.add_middleware(
        CORSMiddleware,
        **settings.get_cors_config()
    )

    # Configure security middleware with HIPAA compliance
    security_middleware.configure(
        app,
        security_config=settings.get_security_config()
    )

def initialize_monitoring(app: FastAPI) -> None:
    """Setup monitoring, metrics, and health checks."""
    # Add Prometheus metrics middleware
    app.add_middleware(PrometheusMiddleware)

    # Initialize metrics instrumentation
    instrumentator = PrometheusMiddleware(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        should_respect_env_var=True,
        should_instrument_requests_inprogress=True,
        excluded_handlers=[".*admin.*", "/metrics"],
        env_var_name="ENABLE_METRICS",
        inprogress_name="http_requests_inprogress",
        inprogress_labels=True
    )
    instrumentator.instrument(app)

# Initialize application components
initialize_security(app, settings)
initialize_monitoring(app)

# Export application instance
__all__ = ["app", "__version__"]