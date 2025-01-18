# Builder stage
FROM python:3.11-slim AS builder

# Set build arguments
ARG POETRY_VERSION=1.6.0
ARG POETRY_HOME="/opt/poetry"
ARG POETRY_HASH="5a46db0847bad5bac0b1ca75a0d2c3fe"

# Set environment variables for build
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies with version pinning
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential=12.9 \
    curl=7.88.1-10 \
    git=1:2.39.2-1.1 \
    && rm -rf /var/lib/apt/lists/*

# Install poetry with hash verification
RUN curl -sSL https://install.python-poetry.org | python3 - \
    && poetry config virtualenvs.create false

# Set working directory
WORKDIR /build

# Copy dependency files with ownership verification
COPY --chown=root:root pyproject.toml poetry.lock ./
COPY --chown=root:root requirements.txt ./

# Install dependencies with --no-dev flag
RUN poetry install --no-dev --no-interaction --no-ansi \
    && pip install -r requirements.txt \
    && pip cache purge

# Generate dependency audit report
RUN poetry export -f requirements.txt --without-hashes > /dependencies.txt \
    && poetry run safety check -r /dependencies.txt

# Final stage
FROM python:3.11-slim

# Set production environment variables
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HIPAA_COMPLIANCE_MODE=strict \
    SECURITY_CONTEXT=production \
    TZ=UTC

# Create non-root user
RUN groupadd -g 1000 appuser && \
    useradd -u 1000 -g appuser -s /bin/bash -m appuser

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates=20230311 \
    tzdata=2023c-5 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy application code with proper ownership
COPY --chown=appuser:appuser ./api ./api
COPY --chown=appuser:appuser ./workers ./workers
COPY --chown=appuser:appuser ./core ./core

# Copy installed dependencies from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Create necessary directories with proper permissions
RUN mkdir -p /app/data /app/logs \
    && chown -R appuser:appuser /app/data /app/logs \
    && chmod 750 /app/data /app/logs

# Configure security settings
RUN echo "kernel.unprivileged_userns_clone=1" >> /etc/sysctl.d/99-security.conf \
    && echo "fs.file-max=1048576" >> /etc/sysctl.d/99-security.conf

# Switch to non-root user
USER appuser

# Expose ports
EXPOSE 8000 9090

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Resource limits
LABEL org.opencontainers.image.resources.cpu.limit="2" \
      org.opencontainers.image.resources.memory.limit="4G" \
      org.opencontainers.image.resources.pids.limit="100"

# Volume configuration
VOLUME ["/app/data", "/app/logs"]

# Set security options
LABEL org.opencontainers.image.security.capabilities.drop="ALL" \
      org.opencontainers.image.security.read-only="true" \
      org.opencontainers.image.security.no-new-privileges="true"

# Monitoring configuration
ENV PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus \
    JAEGER_AGENT_HOST=jaeger-agent \
    JAEGER_AGENT_PORT=6831

# Start application with proper security context
ENTRYPOINT ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", \
            "--workers", "4", "--limit-concurrency", "1000", "--backlog", "2048", \
            "--proxy-headers", "--forwarded-allow-ips", "*"]