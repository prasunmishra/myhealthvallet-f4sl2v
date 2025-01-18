# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Set build arguments with defaults
ARG NODE_ENV=production
ARG API_URL=https://api.phrsat.com
ARG BUILD_VERSION=latest
ARG COMMIT_HASH=unknown

# Set environment variables
ENV NODE_ENV=$NODE_ENV \
    REACT_APP_API_URL=$API_URL \
    REACT_APP_VERSION=$BUILD_VERSION \
    REACT_APP_COMMIT_HASH=$COMMIT_HASH

# Install build dependencies and security tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    && npm install -g npm@latest

# Copy package files with integrity verification
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies with security audit
RUN npm ci --production=false \
    && npm audit fix \
    && npm cache clean --force

# Copy source code and config files
COPY . .

# Run security scan and linting
RUN npm run lint \
    && npm run typecheck \
    && npm audit > security-report.txt

# Build production bundle
RUN npm run build

# Clean up
RUN npm prune --production \
    && rm -rf src tests

# Production stage
FROM nginx:1.25-alpine

# Install security updates and tools
RUN apk update && apk upgrade \
    && apk add --no-cache \
    curl \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create nginx user/group with minimal privileges
RUN addgroup -g 101 -S nginx \
    && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/build /usr/share/nginx/html
COPY --from=builder /app/security-report.txt /security-report.txt

# Set correct permissions
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chmod -R 755 /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && chown -R nginx:nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid

# Create health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

# Configure security headers
RUN echo 'add_header X-Frame-Options "SAMEORIGIN";' >> /etc/nginx/conf.d/default.conf \
    && echo 'add_header X-XSS-Protection "1; mode=block";' >> /etc/nginx/conf.d/default.conf \
    && echo 'add_header X-Content-Type-Options "nosniff";' >> /etc/nginx/conf.d/default.conf \
    && echo 'add_header Content-Security-Policy "default-src '\''self'\''; script-src '\''self'\'' '\''unsafe-inline'\'' '\''unsafe-eval'\''; style-src '\''self'\'' '\''unsafe-inline'\''; img-src '\''self'\'' data: https:; font-src '\''self'\'' data:; connect-src '\''self'\'' https:;";' >> /etc/nginx/conf.d/default.conf

# Set resource limits
ENV NGINX_WORKER_PROCESSES="auto" \
    NGINX_WORKER_CONNECTIONS="1024" \
    NGINX_WORKER_RLIMIT_NOFILE="2048"

# Configure security options
RUN echo "security.limit_extensions .html .htm .css .js .png .jpg .jpeg .gif .svg .ico .woff .woff2 .ttf .eot;" >> /etc/nginx/conf.d/default.conf

# Set up volumes for logs
VOLUME ["/var/log/nginx"]

# Expose port
EXPOSE 80

# Set up healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

# Switch to non-root user
USER nginx

# Add metadata labels
LABEL maintainer="PHRSAT DevOps Team" \
    com.phrsat.version="${BUILD_VERSION}" \
    com.phrsat.commit="${COMMIT_HASH}" \
    com.phrsat.build-date="${BUILD_DATE}" \
    com.phrsat.security-scan="passed"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]