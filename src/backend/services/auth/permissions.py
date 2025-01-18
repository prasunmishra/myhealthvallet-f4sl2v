"""
Permission management module implementing role-based access control (RBAC) and permission verification
for the PHRSAT system with enhanced security, caching, and audit capabilities.

Version: 1.0.0
"""

from functools import wraps
from typing import Dict, List, Optional, Set
import logging
from cachetools import TTLCache  # cachetools v5.3.0

from api.auth.models import User
from core.security import SecurityManager

# Configure logging
logger = logging.getLogger(__name__)

# Global role permission definitions
ROLE_PERMISSIONS = {
    'admin': ['*'],  # Wildcard for full access
    'healthcare_provider': [
        'read:health_records',
        'write:health_records',
        'read:analytics',
        'write:prescriptions'
    ],
    'patient': [
        'read:own_records',
        'write:own_records',
        'read:own_analytics'
    ],
    'family_caregiver': [
        'read:delegated_records',
        'write:appointments',
        'read:basic_analytics'
    ]
}

# Permission inheritance hierarchy
PERMISSION_HIERARCHY = {
    'write:health_records': ['read:health_records'],
    'write:own_records': ['read:own_records'],
    'write:prescriptions': ['read:prescriptions'],
    'write:appointments': ['read:appointments'],
    'read:analytics': ['read:basic_analytics']
}

# Cache configuration
CACHE_CONFIG = {
    'default_ttl': 300,  # 5 minutes
    'max_size': 10000,
    'cleanup_interval': 3600  # 1 hour
}

class PermissionManager:
    """Enhanced manager class for handling RBAC permissions and access control with caching and audit support."""

    def __init__(self, cache_ttl: int = CACHE_CONFIG['default_ttl'], enable_audit: bool = True):
        """Initialize permission manager with role definitions and caching."""
        self._role_permissions = ROLE_PERMISSIONS.copy()
        self._permission_hierarchy = PERMISSION_HIERARCHY.copy()
        self._permission_cache = TTLCache(
            maxsize=CACHE_CONFIG['max_size'],
            ttl=cache_ttl
        )
        self._cache_ttl = cache_ttl
        
        # Configure audit logging
        self._enable_audit = enable_audit
        if enable_audit:
            self._audit_logger = logging.getLogger('permission_audit')
            self._audit_logger.setLevel(logging.INFO)

    def has_permission(self, user: User, permission: str, bypass_cache: bool = False) -> bool:
        """Check if user has required permission with caching."""
        if not user or not permission:
            return False

        # Check cache first if not bypassed
        cache_key = f"{user.id}:{permission}"
        if not bypass_cache and cache_key in self._permission_cache:
            return self._permission_cache[cache_key]

        try:
            # Check for admin wildcard access
            if '*' in self._get_role_permissions(user.roles):
                result = True
            else:
                # Get all permissions including inherited ones
                user_permissions = self._get_effective_permissions(user.roles)
                result = permission in user_permissions

            # Cache the result
            if not bypass_cache:
                self._permission_cache[cache_key] = result

            # Audit logging
            if self._enable_audit:
                self._audit_logger.info(
                    f"Permission check: user={user.id}, permission={permission}, "
                    f"result={result}, roles={user.roles}"
                )

            return result

        except Exception as e:
            logger.error(f"Permission check failed: {str(e)}")
            return False

    def validate_permission_syntax(self, permission: str) -> bool:
        """Validate permission string syntax."""
        if not permission or not isinstance(permission, str):
            return False

        try:
            # Check permission format (action:resource)
            parts = permission.split(':')
            if len(parts) != 2:
                return False

            action, resource = parts
            
            # Validate action
            valid_actions = {'read', 'write', 'delete', 'admin'}
            if action not in valid_actions and action != '*':
                return False

            # Validate resource name
            if not resource or not resource.isalnum() and '_' not in resource:
                return False

            return True

        except Exception as e:
            logger.error(f"Permission syntax validation failed: {str(e)}")
            return False

    def check_permission_conflicts(self, role: str, permissions: List[str]) -> List[str]:
        """Check for conflicts in permission assignments."""
        conflicts = []
        existing_permissions = self._role_permissions.get(role, [])

        try:
            for permission in permissions:
                # Check for direct conflicts
                if permission in existing_permissions:
                    conflicts.append(f"Duplicate permission: {permission}")

                # Check hierarchy conflicts
                if permission in self._permission_hierarchy:
                    inherited = self._permission_hierarchy[permission]
                    for inherit_perm in inherited:
                        if inherit_perm in permissions:
                            conflicts.append(
                                f"Hierarchy conflict: {permission} already includes {inherit_perm}"
                            )

            return conflicts

        except Exception as e:
            logger.error(f"Permission conflict check failed: {str(e)}")
            return [str(e)]

    def _get_role_permissions(self, roles: List[str]) -> Set[str]:
        """Get all permissions for given roles."""
        permissions = set()
        for role in roles:
            if role in self._role_permissions:
                permissions.update(self._role_permissions[role])
        return permissions

    def _get_effective_permissions(self, roles: List[str]) -> Set[str]:
        """Get effective permissions including inherited ones."""
        direct_permissions = self._get_role_permissions(roles)
        effective_permissions = direct_permissions.copy()

        # Add inherited permissions
        for permission in direct_permissions:
            if permission in self._permission_hierarchy:
                effective_permissions.update(self._permission_hierarchy[permission])

        return effective_permissions

def require_permission(permission: str, bypass_cache: bool = False, audit_check: bool = True):
    """Enhanced decorator to enforce permission requirement with caching and audit."""
    def decorator(handler):
        @wraps(handler)
        def wrapper(*args, **kwargs):
            from flask import request, abort
            
            try:
                # Get current user from request context
                current_user = getattr(request, 'user', None)
                if not current_user:
                    abort(401)

                # Initialize permission manager
                permission_manager = PermissionManager(enable_audit=audit_check)

                # Validate permission syntax
                if not permission_manager.validate_permission_syntax(permission):
                    logger.error(f"Invalid permission syntax: {permission}")
                    abort(400)

                # Check permission
                if not permission_manager.has_permission(
                    current_user,
                    permission,
                    bypass_cache=bypass_cache
                ):
                    logger.warning(
                        f"Permission denied: user={current_user.id}, "
                        f"permission={permission}"
                    )
                    abort(403)

                return handler(*args, **kwargs)

            except Exception as e:
                logger.error(f"Permission check failed in decorator: {str(e)}")
                abort(500)

        return wrapper
    return decorator