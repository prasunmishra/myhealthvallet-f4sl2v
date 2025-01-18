# PHRSAT Backend Makefile
# Requires: Python 3.11+, Docker 24.0+, safety 2.3+, bandit 1.7+, trivy 0.45+

# Core variables
PYTHON := python3.11
DOCKER_COMPOSE := docker-compose
DOCKER_IMAGE := phrsat-backend
COVERAGE_THRESHOLD := 90

# Security scan settings
SECURITY_SCAN_ARGS := --recursive --aggregate --exit-code 1
DOCKER_SCAN_ARGS := --severity HIGH,CRITICAL --exit-code 1

# Test settings
PYTEST_ARGS := --cov=api --cov=ml --cov=services --cov=workers --cov-report=xml --cov-report=html

# Audit logging
AUDIT_LOG := make_audit.log

# PHONY targets declaration
.PHONY: install security-scan test docker-build docker-scan clean all

# Default target
all: clean install security-scan test docker-build docker-scan

# Install dependencies with security checks
install:
	@echo "Installing dependencies with security verification..." | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m pip install --upgrade pip | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m pip install -r requirements.txt --require-hashes | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m pip install -r requirements-dev.txt --require-hashes | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m safety check | tee -a $(AUDIT_LOG)
	@echo "Dependencies installed and verified at $$(date)" >> $(AUDIT_LOG)

# Security scanning
security-scan:
	@echo "Running security scans..." | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m bandit $(SECURITY_SCAN_ARGS) -r api ml services workers | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m safety check -r requirements.txt | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m safety check -r requirements-dev.txt | tee -a $(AUDIT_LOG)
	@echo "HIPAA compliance verification..." | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m pytest tests/security/test_hipaa_compliance.py -v | tee -a $(AUDIT_LOG)
	@echo "Security scan completed at $$(date)" >> $(AUDIT_LOG)

# Run tests with coverage
test:
	@echo "Running test suite with coverage analysis..." | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m pytest $(PYTEST_ARGS) | tee -a $(AUDIT_LOG)
	@$(PYTHON) -m coverage report --fail-under=$(COVERAGE_THRESHOLD) | tee -a $(AUDIT_LOG)
	@echo "Test suite completed at $$(date)" >> $(AUDIT_LOG)

# Build Docker images
docker-build:
	@echo "Building Docker images..." | tee -a $(AUDIT_LOG)
	@$(DOCKER_COMPOSE) build --no-cache api | tee -a $(AUDIT_LOG)
	@$(DOCKER_COMPOSE) build --no-cache worker | tee -a $(AUDIT_LOG)
	@echo "Docker builds completed at $$(date)" >> $(AUDIT_LOG)

# Scan Docker images
docker-scan:
	@echo "Scanning Docker images for vulnerabilities..." | tee -a $(AUDIT_LOG)
	@trivy image $(DOCKER_SCAN_ARGS) phrsat/api:latest | tee -a $(AUDIT_LOG)
	@trivy image $(DOCKER_SCAN_ARGS) phrsat/worker:latest | tee -a $(AUDIT_LOG)
	@trivy fs $(DOCKER_SCAN_ARGS) . | tee -a $(AUDIT_LOG)
	@echo "Docker security scan completed at $$(date)" >> $(AUDIT_LOG)

# Clean build artifacts and temporary files
clean:
	@echo "Cleaning build artifacts..." | tee -a $(AUDIT_LOG)
	@find . -type d -name "__pycache__" -exec rm -rf {} +
	@find . -type d -name ".pytest_cache" -exec rm -rf {} +
	@find . -type d -name ".coverage" -exec rm -rf {} +
	@find . -type f -name "*.pyc" -delete
	@find . -type f -name "*.pyo" -delete
	@find . -type f -name "*.pyd" -delete
	@find . -type f -name ".coverage" -delete
	@find . -type f -name "coverage.xml" -delete
	@find . -type d -name "htmlcov" -exec rm -rf {} +
	@find . -type f -name "*.log" -not -name "make_audit.log" -delete
	@echo "Cleanup completed at $$(date)" >> $(AUDIT_LOG)