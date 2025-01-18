# Stage 1: Builder stage for compiling dependencies
FROM python:3.11-slim AS builder

# Set build arguments and environment variables
ARG DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Create and set working directory
WORKDIR /build

# Copy requirements file
COPY src/backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Final production image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    WORKERS=4 \
    LOG_LEVEL=info \
    TZ=UTC

# Create non-root user
RUN groupadd -r phrsat -g 1000 && \
    useradd -r -g phrsat -u 1000 -s /sbin/nologin phrsat && \
    mkdir -p /app /app/data /app/logs && \
    chown -R phrsat:phrsat /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy application code
COPY --chown=phrsat:phrsat src/backend /app/
COPY --chown=phrsat:phrsat --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Configure security settings
RUN chmod -R 550 /app && \
    chmod -R 770 /app/data /app/logs

# Switch to non-root user
USER phrsat

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Set resource limits
ENV MEMORY_LIMIT=4G \
    CPU_LIMIT=2

# Labels
LABEL maintainer="PHRSAT Development Team <dev@phrsat.com>" \
      version="1.0.0" \
      description="PHRSAT API Service Container" \
      security.hipaa.compliant="true" \
      monitoring.health.endpoint="/health"

# Expose API port
EXPOSE 8000

# Set entrypoint
ENTRYPOINT ["python", "-m", "uvicorn", "api.main:app"]

# Default command with production settings
CMD ["--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--log-level", "info", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*", \
     "--no-access-log"]