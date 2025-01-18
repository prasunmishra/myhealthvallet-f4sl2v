package com.phrsat.healthbridge.utils

import android.app.Activity
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat // version 1.10.0
import androidx.core.app.ActivityCompat // version 1.10.0
import androidx.biometric.BiometricPrompt // version 1.2.0
import android.util.Log

/**
 * Utility class for handling Android runtime permissions with HIPAA compliance focus.
 * Manages health data access, storage, and biometric authentication permissions while
 * ensuring secure access control and proper audit logging.
 */
object PermissionUtils {

    private const val TAG = "PermissionUtils"
    
    // Permission request codes
    const val PERMISSION_REQUEST_CODE = 100
    const val STORAGE_PERMISSION_REQUEST_CODE = 101
    const val BIOMETRIC_PERMISSION_REQUEST_CODE = 102
    const val HEALTH_DATA_PERMISSION_REQUEST_CODE = 103
    
    // Security configuration
    private const val PERMISSION_DENIED_MAX_ATTEMPTS = 3
    private val deniedPermissionAttempts = mutableMapOf<String, Int>()
    private val permissionRequestTimestamps = mutableMapOf<String, Long>()
    private const val MIN_REQUEST_INTERVAL_MS = 1000 // Rate limiting interval

    /**
     * Securely checks if a specific permission is granted with audit logging.
     *
     * @param activity The activity context for permission checking
     * @param permission The permission to check
     * @return Boolean indicating if permission is granted and verified
     * @throws SecurityException if invalid parameters or security violation detected
     */
    @Throws(SecurityException::class)
    fun checkPermission(activity: Activity, permission: String): Boolean {
        try {
            // Validate input parameters
            requireNotNull(activity) { "Activity context cannot be null" }
            require(permission.isNotEmpty()) { "Permission string cannot be empty" }

            // Log permission check attempt for audit
            Log.i(TAG, "Permission check attempt: $permission")

            // Get permission status using ContextCompat
            val permissionStatus = ContextCompat.checkSelfPermission(activity, permission)
            val isGranted = permissionStatus == PackageManager.PERMISSION_GRANTED

            // Log result for audit trail
            Log.i(TAG, "Permission $permission status: ${if (isGranted) "GRANTED" else "DENIED"}")

            return isGranted
        } catch (e: Exception) {
            Log.e(TAG, "Security exception during permission check: ${e.message}")
            throw SecurityException("Permission check failed", e)
        }
    }

    /**
     * Securely requests a single permission with rate limiting and audit logging.
     *
     * @param activity The activity context for permission request
     * @param permission The permission to request
     * @param requestCode The request code for permission callback
     * @throws SecurityException if security violations or invalid parameters detected
     */
    @Throws(SecurityException::class)
    fun requestPermission(activity: Activity, permission: String, requestCode: Int) {
        try {
            // Validate input parameters
            requireNotNull(activity) { "Activity context cannot be null" }
            require(permission.isNotEmpty()) { "Permission string cannot be empty" }
            require(requestCode > 0) { "Request code must be positive" }

            // Check rate limiting
            val currentTime = System.currentTimeMillis()
            val lastRequestTime = permissionRequestTimestamps[permission] ?: 0L
            if (currentTime - lastRequestTime < MIN_REQUEST_INTERVAL_MS) {
                Log.w(TAG, "Permission request rate limit exceeded for: $permission")
                return
            }

            // Update request timestamp
            permissionRequestTimestamps[permission] = currentTime

            // Log permission request attempt
            Log.i(TAG, "Permission request initiated: $permission")

            // Check if permission is already granted
            if (checkPermission(activity, permission)) {
                Log.i(TAG, "Permission already granted: $permission")
                return
            }

            // Check maximum denial attempts
            val attempts = deniedPermissionAttempts[permission] ?: 0
            if (attempts >= PERMISSION_DENIED_MAX_ATTEMPTS) {
                Log.w(TAG, "Maximum permission request attempts exceeded for: $permission")
                throw SecurityException("Maximum permission request attempts exceeded")
            }

            // Request permission
            ActivityCompat.requestPermissions(activity, arrayOf(permission), requestCode)
            deniedPermissionAttempts[permission] = attempts + 1

            // Log completion
            Log.i(TAG, "Permission request completed for: $permission")
        } catch (e: Exception) {
            Log.e(TAG, "Security exception during permission request: ${e.message}")
            throw SecurityException("Permission request failed", e)
        }
    }

    /**
     * Securely requests multiple permissions with batch processing and audit logging.
     *
     * @param activity The activity context for permission requests
     * @param permissions Array of permissions to request
     * @param requestCode The request code for permission callback
     * @throws SecurityException if security violations or invalid parameters detected
     */
    @Throws(SecurityException::class)
    fun requestPermissions(activity: Activity, permissions: Array<String>, requestCode: Int) {
        try {
            // Validate input parameters
            requireNotNull(activity) { "Activity context cannot be null" }
            require(permissions.isNotEmpty()) { "Permissions array cannot be empty" }
            require(requestCode > 0) { "Request code must be positive" }

            // Log batch permission request
            Log.i(TAG, "Batch permission request initiated for ${permissions.size} permissions")

            // Filter out already granted permissions
            val permissionsToRequest = permissions.filter { permission ->
                !checkPermission(activity, permission)
            }.toTypedArray()

            if (permissionsToRequest.isEmpty()) {
                Log.i(TAG, "All permissions already granted")
                return
            }

            // Request remaining permissions
            ActivityCompat.requestPermissions(activity, permissionsToRequest, requestCode)

            // Log completion
            Log.i(TAG, "Batch permission request completed for ${permissionsToRequest.size} permissions")
        } catch (e: Exception) {
            Log.e(TAG, "Security exception during batch permission request: ${e.message}")
            throw SecurityException("Batch permission request failed", e)
        }
    }

    /**
     * Determines if permission explanation should be shown with user interaction tracking.
     *
     * @param activity The activity context for permission rationale check
     * @param permission The permission to check for rationale
     * @return Boolean indicating if rationale should be shown
     */
    fun shouldShowRequestPermissionRationale(activity: Activity, permission: String): Boolean {
        try {
            // Validate input parameters
            requireNotNull(activity) { "Activity context cannot be null" }
            require(permission.isNotEmpty()) { "Permission string cannot be empty" }

            val attempts = deniedPermissionAttempts[permission] ?: 0
            val shouldShow = ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)

            // Log rationale check result
            Log.i(TAG, "Permission rationale check for $permission: " +
                    "attempts=$attempts, shouldShow=$shouldShow")

            return shouldShow && attempts < PERMISSION_DENIED_MAX_ATTEMPTS
        } catch (e: Exception) {
            Log.e(TAG, "Error checking permission rationale: ${e.message}")
            return false
        }
    }

    /**
     * Resets the denial count for a specific permission.
     * Internal use only - not exported.
     */
    private fun resetPermissionDenialCount(permission: String) {
        deniedPermissionAttempts.remove(permission)
        permissionRequestTimestamps.remove(permission)
        Log.i(TAG, "Reset denial count for permission: $permission")
    }
}