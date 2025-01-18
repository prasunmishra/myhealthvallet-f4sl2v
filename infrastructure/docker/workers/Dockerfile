# Stage 1: Builder stage for dependencies and security setup
FROM python:3.11-slim AS builder

# Build arguments
ARG PYTHON_VERSION=3.11
ARG WORKERS_PER_CORE=2
ARG MAX_WORKERS=8
ARG CUDA_VERSION=11.8
ARG SECURITY_SCAN=enabled
ARG HIPAA_MODE=enabled

# Set build-time environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system build dependencies with security patches
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    libpq-dev \
    pkg-config \
    tesseract-ocr \
    nvidia-cuda-toolkit=${CUDA_VERSION}* \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create secure working directory
WORKDIR /build

# Copy and verify requirements file
COPY src/backend/requirements.txt .
RUN pip install --no-cache-dir pip-audit && \
    pip-audit requirements.txt

# Install Python dependencies with security checks
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Final production image
FROM python:3.11-slim

# Set production environment variables
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    WORKERS_PER_CORE=2 \
    MAX_WORKERS=8 \
    CUDA_VISIBLE_DEVICES=0,1 \
    SSL_CERT_DIR=/etc/ssl/certs \
    HIPAA_COMPLIANCE_MODE=strict \
    LOG_LEVEL=INFO

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    nvidia-cuda-toolkit-11-8 \
    ca-certificates \
    openssl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

# Create non-root user for security
RUN useradd -m -s /bin/bash celery_worker \
    && mkdir -p /app /app/logs /app/tmp \
    && chown -R celery_worker:celery_worker /app

# Set working directory
WORKDIR /app

# Copy verified dependencies from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY src/backend /app/

# Set up HIPAA compliance measures
RUN chmod 700 /app/logs /app/tmp \
    && touch /app/logs/celery.log \
    && chown celery_worker:celery_worker /app/logs/celery.log \
    && chmod 600 /app/logs/celery.log

# Configure secure volumes
VOLUME ["/app/tmp", "/app/logs"]

# Switch to non-root user
USER celery_worker

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD celery -A workers.celery inspect ping || exit 1

# Set secure entrypoint
ENTRYPOINT ["celery", "-A", "workers.celery", "worker"]

# Default command with optimized settings
CMD ["--loglevel=INFO", \
     "--pool=prefork", \
     "--concurrency=${WORKERS_PER_CORE}", \
     "--max-tasks-per-child=1000", \
     "--max-memory-per-child=400000", \
     "--events", \
     "--time-limit=3600", \
     "--soft-time-limit=3300", \
     "--queues=document-ocr,health-sync,health-analysis"]