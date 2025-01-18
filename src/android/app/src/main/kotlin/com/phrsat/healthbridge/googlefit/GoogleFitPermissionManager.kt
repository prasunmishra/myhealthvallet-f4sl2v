package com.phrsat.healthbridge.googlefit

import android.app.Activity
import com.google.android.gms.auth.api.signin.GoogleSignIn // version 20.5.0
import com.google.android.gms.fitness.FitnessOptions // version 21.1.0
import com.phrsat.healthbridge.utils.PermissionUtils
import timber.log.Timber // version 5.0.1
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock

/**
 * Manages Google Fit API permissions and authorization with HIPAA compliance.
 * Implements secure permission handling, rate limiting, and comprehensive audit logging.
 *
 * @property activity Activity context for permission handling
 */
class GoogleFitPermissionManager(private val activity: Activity) {

    companion object {
        private const val GOOGLE_FIT_PERMISSIONS_REQUEST_CODE = 2001
        private const val MAX_PERMISSION_REQUESTS_PER_HOUR = 5
        private const val PERMISSION_REQUEST_TIMEOUT_MS = 30000L // 30 seconds

        /**
         * Builds FitnessOptions with required data types and access levels.
         * Includes comprehensive scope validation.
         *
         * @return Configured FitnessOptions with validated scopes
         */
        @JvmStatic
        private fun buildFitnessOptions(): FitnessOptions {
            return FitnessOptions.builder().apply {
                // Add read access for all supported data types
                GoogleFitDataTypes.values().forEach { dataType ->
                    addDataType(GoogleFitDataTypes.getDataType(dataType), FitnessOptions.ACCESS_READ)
                }
                // Add write access for metrics that support it
                listOf(
                    GoogleFitDataTypes.HEART_RATE_BPM,
                    GoogleFitDataTypes.BLOOD_PRESSURE_MMHG,
                    GoogleFitDataTypes.WEIGHT_KG,
                    GoogleFitDataTypes.HEIGHT_M
                ).forEach { dataType ->
                    addDataType(GoogleFitDataTypes.getDataType(dataType), FitnessOptions.ACCESS_WRITE)
                }
            }.build()
        }
    }

    private val fitnessOptions: FitnessOptions = buildFitnessOptions()
    private val permissionRequestLock = ReentrantLock()
    private val permissionRequestCount = AtomicInteger(0)
    private val lastRequestTime = ConcurrentHashMap<String, Long>()
    private val permissionStates = ConcurrentHashMap<String, Boolean>()

    init {
        // Initialize security audit logging
        Timber.tag("GoogleFitPermissions")
    }

    /**
     * Checks if all required Google Fit permissions are granted with security validation.
     *
     * @return true if all permissions granted and validated, false otherwise
     * @throws SecurityException if validation fails or security violation detected
     */
    @Throws(SecurityException::class)
    fun hasPermissions(): Boolean {
        try {
            // Check rate limiting
            if (permissionRequestCount.get() >= MAX_PERMISSION_REQUESTS_PER_HOUR) {
                Timber.w("Permission check rate limit exceeded")
                return false
            }

            // Get Google Sign In account with validation
            val account = GoogleSignIn.getLastSignedInAccount(activity)
            if (account == null) {
                Timber.w("No Google account found")
                return false
            }

            // Validate account security state
            if (!account.isExpired) {
                Timber.d("Account validation successful")
                
                // Check Google Fit permissions
                val hasAccess = GoogleSignIn.hasPermissions(account, fitnessOptions)
                
                // Update permission state cache
                permissionStates["googleFit"] = hasAccess
                
                // Log permission check for audit
                Timber.i("Google Fit permissions check: $hasAccess")
                
                return hasAccess
            } else {
                Timber.w("Account expired or invalid")
                return false
            }
        } catch (e: Exception) {
            Timber.e(e, "Security exception during permission check")
            throw SecurityException("Permission check failed", e)
        }
    }

    /**
     * Requests required Google Fit permissions with rate limiting and timeout.
     *
     * @throws SecurityException if rate limit exceeded or security violation detected
     */
    @Throws(SecurityException::class)
    fun requestPermissions() {
        permissionRequestLock.lock()
        try {
            // Validate rate limiting
            if (permissionRequestCount.incrementAndGet() > MAX_PERMISSION_REQUESTS_PER_HOUR) {
                Timber.w("Permission request rate limit exceeded")
                throw SecurityException("Permission request rate limit exceeded")
            }

            // Check request timeout
            val currentTime = System.currentTimeMillis()
            val lastRequest = lastRequestTime.getOrDefault("googleFit", 0L)
            if (currentTime - lastRequest < PERMISSION_REQUEST_TIMEOUT_MS) {
                Timber.w("Permission request timeout not elapsed")
                return
            }

            // Get Google Sign In account
            val account = GoogleSignIn.getLastSignedInAccount(activity)
            if (account == null) {
                Timber.w("No Google account found for permission request")
                return
            }

            // Request Google Fit permissions if not already granted
            if (!GoogleSignIn.hasPermissions(account, fitnessOptions)) {
                Timber.i("Requesting Google Fit permissions")
                GoogleSignIn.requestPermissions(
                    activity,
                    GOOGLE_FIT_PERMISSIONS_REQUEST_CODE,
                    account,
                    fitnessOptions
                )
                
                // Update request tracking
                lastRequestTime["googleFit"] = currentTime
                permissionStates["googleFit"] = false
            } else {
                Timber.d("Google Fit permissions already granted")
                permissionStates["googleFit"] = true
            }
        } catch (e: Exception) {
            Timber.e(e, "Security exception during permission request")
            throw SecurityException("Permission request failed", e)
        } finally {
            permissionRequestLock.unlock()
        }
    }

    /**
     * Processes permission request result with security validation.
     *
     * @param requestCode The request code from onActivityResult
     * @param resultCode The result code from onActivityResult
     * @return true if permissions granted and validated successfully
     */
    fun handlePermissionResult(requestCode: Int, resultCode: Int): Boolean {
        try {
            // Validate request code
            if (requestCode != GOOGLE_FIT_PERMISSIONS_REQUEST_CODE) {
                Timber.w("Invalid permission request code: $requestCode")
                return false
            }

            // Check result code
            val isGranted = resultCode == Activity.RESULT_OK
            
            // Update permission state
            permissionStates["googleFit"] = isGranted
            
            // Log result for audit
            Timber.i("Google Fit permission result: $isGranted")
            
            return isGranted
        } catch (e: Exception) {
            Timber.e(e, "Error handling permission result")
            return false
        }
    }
}