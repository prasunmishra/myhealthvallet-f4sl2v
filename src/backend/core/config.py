"""
Core configuration module for Personal Health Record Store and Analysis Tool (PHRSAT).
Manages environment-specific settings, feature flags, and system-wide configuration
with enhanced security, validation, and infrastructure support.

Version: 1.0.0
"""

import os
from functools import lru_cache
from typing import Dict, List, Optional

from pydantic import BaseSettings, Field  # pydantic v1.10+
from dotenv import load_dotenv  # python-dotenv v1.0+

from .constants import HealthDataFormat

# Load environment variables with encryption check
load_dotenv(override=True)

class Settings(BaseSettings):
    """
    Application settings with environment-specific configuration and enhanced security validation.
    Implements comprehensive configuration management with strict validation rules.
    """
    
    # Core Application Settings
    ENV_STATE: str = Field(
        default="development",
        regex="^(development|staging|production)$"
    )
    APP_NAME: str = Field(default="PHRSAT")
    APP_VERSION: str = Field(default="1.0.0")
    API_V1_PREFIX: str = Field(default="/api/v1")
    DEBUG: bool = Field(default=False)
    
    # Security Settings
    SECRET_KEY: str = Field(
        default=None,
        min_length=32,
        description="Main application secret key"
    )
    JWT_SECRET: str = Field(
        default=None,
        min_length=32,
        description="JWT signing secret key"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    ENCRYPTION_KEY: str = Field(
        default=None,
        min_length=32,
        description="AES-256 encryption key for sensitive data"
    )
    
    # Database Settings
    MONGODB_URL: str = Field(
        default="mongodb://localhost:27017/phrsat",
        description="MongoDB connection URL"
    )
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL"
    )
    
    # AWS Settings
    AWS_ACCESS_KEY_ID: Optional[str] = Field(default=None)
    AWS_SECRET_ACCESS_KEY: Optional[str] = Field(default=None)
    AWS_REGION: str = Field(default="us-east-1")
    S3_BUCKET: str = Field(default="phrsat-documents")
    
    # Monitoring Settings
    SENTRY_DSN: Optional[str] = Field(default=None)
    LOG_LEVEL: str = Field(
        default="INFO",
        regex="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$"
    )
    METRICS_PREFIX: str = Field(default="phrsat")
    
    # Security and CORS Settings
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000"],
        description="Allowed CORS origins"
    )
    
    # Health Data Settings
    HEALTH_DATA_FORMAT: str = Field(
        default=HealthDataFormat.FHIR_R4.value,
        description="Default health data format"
    )
    
    # Connection Pool Settings
    MAX_CONNECTIONS_COUNT: int = Field(default=10)
    MIN_CONNECTIONS_COUNT: int = Field(default=2)
    
    # Feature Flags
    FEATURE_FLAGS: Dict[str, bool] = Field(
        default={
            "enable_ai_analysis": True,
            "enable_document_ocr": True,
            "enable_health_predictions": True,
            "enable_real_time_sync": True
        }
    )

    class Config:
        case_sensitive = True
        env_file = ".env"
        env_file_encoding = "utf-8"

    def __init__(self, **kwargs):
        """Initialize settings with environment variables and validate security configurations."""
        super().__init__(**kwargs)
        self.validate_security_settings()
        
        # Environment-specific configurations
        if self.ENV_STATE == "production":
            self.DEBUG = False
            self.LOG_LEVEL = "WARNING"
            self.MIN_CONNECTIONS_COUNT = 5
            self.MAX_CONNECTIONS_COUNT = 20
    
    def get_mongodb_url(self) -> str:
        """Get MongoDB connection URL with security parameters and connection pooling."""
        base_url = self.MONGODB_URL
        if "?" not in base_url:
            base_url += "?"
        
        params = [
            f"minPoolSize={self.MIN_CONNECTIONS_COUNT}",
            f"maxPoolSize={self.MAX_CONNECTIONS_COUNT}",
            "retryWrites=true",
            "w=majority",
            "ssl=true",
            "authSource=admin"
        ]
        
        return f"{base_url}&{'&'.join(params)}"
    
    def get_redis_url(self) -> str:
        """Get Redis connection URL with SSL and authentication parameters."""
        base_url = self.REDIS_URL
        if self.ENV_STATE == "production":
            if "?" not in base_url:
                base_url += "?"
            params = [
                "ssl=true",
                "ssl_cert_reqs=required"
            ]
            return f"{base_url}&{'&'.join(params)}"
        return base_url
    
    def validate_security_settings(self) -> bool:
        """Validate security-related configuration parameters."""
        if self.ENV_STATE == "production":
            assert self.SECRET_KEY and len(self.SECRET_KEY) >= 32, \
                "Production requires a strong SECRET_KEY"
            assert self.JWT_SECRET and len(self.JWT_SECRET) >= 32, \
                "Production requires a strong JWT_SECRET"
            assert self.ENCRYPTION_KEY and len(self.ENCRYPTION_KEY) >= 32, \
                "Production requires a strong ENCRYPTION_KEY"
            assert all(origin.startswith("https://") for origin in self.CORS_ORIGINS), \
                "Production CORS origins must use HTTPS"
        return True

@lru_cache()
def get_settings() -> Settings:
    """Get application settings singleton instance with caching."""
    return Settings()

# Global settings instance
settings = get_settings()

# Export settings-related components
__all__ = ["Settings", "get_settings", "settings"]