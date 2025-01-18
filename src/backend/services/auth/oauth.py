"""
Enhanced OAuth 2.0 + OIDC implementation for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides secure third-party authentication with advanced security features, device fingerprinting,
and comprehensive audit logging.

Version: 1.0.0
"""

import base64
import hashlib
import json
import logging
import secrets
import time
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple

import jwt  # PyJWT v2.7+
import requests  # requests v2.31+
from google.oauth2 import id_token  # google-auth v2.22+
from google_auth_oauthlib import flow  # google-auth-oauthlib v1.0+
import redis  # redis v4.5+

from core.config import Settings, OAUTH_SETTINGS
from services.auth.jwt import JWTManager
from api.auth.models import User
from core.security import SecurityManager

# Configure logging
logger = logging.getLogger(__name__)

# OAuth configuration constants
GOOGLE_OAUTH_SCOPES = ["openid", "email", "profile"]
APPLE_OAUTH_SCOPES = ["name", "email"]
TOKEN_EXPIRY_SECONDS = 3600
MAX_TOKEN_ATTEMPTS = 5
STATE_TIMEOUT_SECONDS = 600

class OAuthManager:
    """Enhanced OAuth authentication manager with advanced security features."""

    def __init__(self, settings: Settings, redis_client: redis.Redis, security_auditor: SecurityManager):
        """Initialize OAuth manager with security configurations."""
        self._settings = settings
        self._redis_client = redis_client
        self._security_auditor = security_auditor
        
        # OAuth provider credentials
        self._google_client_id = settings.OAUTH_SETTINGS['google']['client_id']
        self._google_client_secret = settings.OAUTH_SETTINGS['google']['client_secret']
        self._apple_client_id = settings.OAUTH_SETTINGS['apple']['client_id']
        self._apple_key_id = settings.OAUTH_SETTINGS['apple']['key_id']
        self._apple_private_key = settings.OAUTH_SETTINGS['apple']['private_key']
        
        # Initialize HTTP session with connection pooling
        self._session = requests.Session()
        self._session.mount('https://', requests.adapters.HTTPAdapter(
            max_retries=3,
            pool_connections=10,
            pool_maxsize=10
        ))
        
        # Initialize token blacklist prefix
        self._blacklist_prefix = "oauth_blacklist:"
        
        logger.info("OAuthManager initialized with secure configuration")

    def verify_google_token(self, token: str, device_info: Dict) -> Dict:
        """Verify Google OAuth token with enhanced security checks."""
        try:
            # Check token blacklist
            if self._is_token_blacklisted(token):
                raise ValueError("Token has been revoked")

            # Verify rate limits
            if not self._check_rate_limit(f"google:{device_info.get('device_id', 'unknown')}"):
                raise ValueError("Rate limit exceeded")

            # Verify token with Google
            idinfo = id_token.verify_oauth2_token(
                token,
                requests.Request(),
                self._google_client_id
            )

            # Additional security validations
            if idinfo['aud'] != self._google_client_id:
                raise ValueError("Invalid audience")
            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                raise ValueError("Invalid issuer")
            if time.time() > idinfo['exp']:
                raise ValueError("Token expired")

            # Log verification
            self._security_auditor.log_auth_event({
                'event_type': 'google_token_verification',
                'success': True,
                'device_info': device_info,
                'user_email': idinfo.get('email')
            })

            return idinfo

        except Exception as e:
            logger.error(f"Google token verification failed: {str(e)}")
            self._security_auditor.log_auth_event({
                'event_type': 'google_token_verification',
                'success': False,
                'error': str(e),
                'device_info': device_info
            })
            raise

    def verify_apple_token(self, token: str, device_info: Dict) -> Dict:
        """Verify Apple ID token with enhanced security checks."""
        try:
            # Check token blacklist
            if self._is_token_blacklisted(token):
                raise ValueError("Token has been revoked")

            # Verify rate limits
            if not self._check_rate_limit(f"apple:{device_info.get('device_id', 'unknown')}"):
                raise ValueError("Rate limit exceeded")

            # Fetch Apple public keys
            apple_keys = self._get_apple_public_keys()

            # Decode token header
            header = jwt.get_unverified_header(token)
            key_id = header.get('kid')

            if not key_id or key_id not in apple_keys:
                raise ValueError("Invalid key ID")

            # Verify token
            claims = jwt.decode(
                token,
                apple_keys[key_id],
                algorithms=['RS256'],
                audience=self._apple_client_id,
                issuer='https://appleid.apple.com'
            )

            # Additional security validations
            if time.time() > claims['exp']:
                raise ValueError("Token expired")

            # Log verification
            self._security_auditor.log_auth_event({
                'event_type': 'apple_token_verification',
                'success': True,
                'device_info': device_info,
                'user_email': claims.get('email')
            })

            return claims

        except Exception as e:
            logger.error(f"Apple token verification failed: {str(e)}")
            self._security_auditor.log_auth_event({
                'event_type': 'apple_token_verification',
                'success': False,
                'error': str(e),
                'device_info': device_info
            })
            raise

    def create_or_update_oauth_user(self, claims: Dict, provider: str, device_info: Dict) -> User:
        """Create or update user from OAuth claims with enhanced security."""
        try:
            email = claims.get('email')
            if not email:
                raise ValueError("Email not provided in OAuth claims")

            # Find or create user
            user = User.objects(email=email).first()
            if not user:
                user = User(
                    email=email,
                    auth_provider=provider,
                    is_verified=True
                )

            # Update user information
            user.first_name = claims.get('given_name', '')
            user.last_name = claims.get('family_name', '')
            user.auth_provider = provider
            
            # Update device information
            device_id = device_info.get('device_id')
            if device_id:
                user.device_fingerprints[device_id] = {
                    'last_used': datetime.utcnow(),
                    'user_agent': device_info.get('user_agent'),
                    'ip_address': device_info.get('ip_address')
                }

            # Log user update
            self._security_auditor.log_auth_event({
                'event_type': 'oauth_user_update',
                'success': True,
                'provider': provider,
                'user_email': email,
                'device_info': device_info
            })

            user.save()
            return user

        except Exception as e:
            logger.error(f"Error creating/updating OAuth user: {str(e)}")
            self._security_auditor.log_auth_event({
                'event_type': 'oauth_user_update',
                'success': False,
                'error': str(e),
                'provider': provider,
                'device_info': device_info
            })
            raise

    def handle_oauth_callback(self, token: str, provider: str, device_info: Dict, state: str) -> Dict:
        """Process OAuth callback with comprehensive security checks."""
        try:
            # Verify state parameter
            if not self._verify_oauth_state(state, device_info):
                raise ValueError("Invalid OAuth state")

            # Verify provider token
            claims = (
                self.verify_google_token(token, device_info)
                if provider == 'google'
                else self.verify_apple_token(token, device_info)
            )

            # Create or update user
            user = self.create_or_update_oauth_user(claims, provider, device_info)

            # Generate JWT tokens
            jwt_manager = JWTManager(self._settings, self._redis_client, self._security_auditor)
            access_token = jwt_manager.create_access_token(
                data={'sub': str(user.id)},
                device_id=device_info.get('device_id')
            )

            # Log successful authentication
            self._security_auditor.log_auth_event({
                'event_type': 'oauth_authentication',
                'success': True,
                'provider': provider,
                'user_id': str(user.id),
                'device_info': device_info
            })

            return {
                'access_token': access_token,
                'token_type': 'bearer',
                'expires_in': TOKEN_EXPIRY_SECONDS,
                'user_id': str(user.id)
            }

        except Exception as e:
            logger.error(f"OAuth callback processing failed: {str(e)}")
            self._security_auditor.log_auth_event({
                'event_type': 'oauth_authentication',
                'success': False,
                'error': str(e),
                'provider': provider,
                'device_info': device_info
            })
            raise

    def _is_token_blacklisted(self, token: str) -> bool:
        """Check if token is blacklisted."""
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        return bool(self._redis_client.exists(f"{self._blacklist_prefix}{token_hash}"))

    def _check_rate_limit(self, key: str) -> bool:
        """Check rate limiting for token verification."""
        current = self._redis_client.incr(f"rate_limit:{key}")
        if current == 1:
            self._redis_client.expire(f"rate_limit:{key}", 300)  # 5 minutes
        return current <= MAX_TOKEN_ATTEMPTS

    def _get_apple_public_keys(self) -> Dict:
        """Fetch and cache Apple public keys."""
        cache_key = "apple_public_keys"
        cached_keys = self._redis_client.get(cache_key)
        
        if cached_keys:
            return json.loads(cached_keys)

        response = self._session.get('https://appleid.apple.com/auth/keys')
        response.raise_for_status()
        keys = {key['kid']: key['n'] for key in response.json()['keys']}
        
        self._redis_client.setex(cache_key, 3600, json.dumps(keys))  # Cache for 1 hour
        return keys

    def _verify_oauth_state(self, state: str, device_info: Dict) -> bool:
        """Verify OAuth state parameter with device binding."""
        stored_state = self._redis_client.get(f"oauth_state:{state}")
        if not stored_state:
            return False

        stored_device_info = json.loads(stored_state)
        return stored_device_info.get('device_id') == device_info.get('device_id')

def generate_oauth_state(device_info: Dict) -> str:
    """Generate secure state parameter for OAuth flow with device binding."""
    # Generate random state
    state = secrets.token_urlsafe(32)
    
    # Store state with device information
    redis_client = redis.Redis.from_url(Settings().REDIS_URL)
    redis_client.setex(
        f"oauth_state:{state}",
        STATE_TIMEOUT_SECONDS,
        json.dumps(device_info)
    )
    
    return state