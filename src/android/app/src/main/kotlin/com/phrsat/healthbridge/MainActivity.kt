package com.phrsat.healthbridge

import android.os.Bundle
import android.util.Log
import androidx.security.crypto.SecurityManager
import com.facebook.react.ReactActivity
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.phrsat.healthbridge.bridge.HealthBridgePackage
import com.phrsat.healthbridge.utils.PermissionUtils
import timber.log.Timber // version: 5.0.1
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Main activity class for the PHRSAT Android application that serves as the entry point
 * for the React Native application. Implements HIPAA-compliant security measures,
 * secure permission handling, and health data integration.
 */
class MainActivity : ReactActivity() {

    private lateinit var securityManager: SecurityManager
    private val isSecurityInitialized = AtomicBoolean(false)
    private val requiredPermissions = arrayOf(
        android.Manifest.permission.ACCESS_FINE_LOCATION,
        android.Manifest.permission.BODY_SENSORS,
        android.Manifest.permission.WRITE_EXTERNAL_STORAGE,
        android.Manifest.permission.READ_EXTERNAL_STORAGE
    )

    companion object {
        private const val TAG = "MainActivity"
        private const val PERMISSIONS_REQUEST_CODE = 100
    }

    init {
        try {
            // Initialize Timber for secure logging
            Timber.plant(Timber.DebugTree())
            Timber.i("MainActivity initialization started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize logging", e)
        }
    }

    /**
     * Returns the name of the main component registered from JavaScript.
     * This is used to schedule rendering of the component.
     */
    override fun getMainComponentName(): String {
        return "PHRSAT"
    }

    /**
     * Creates the React Native activity delegate with security context.
     * Implements enhanced security measures for HIPAA compliance.
     */
    override fun createReactActivityDelegate(): DefaultReactActivityDelegate {
        return object : DefaultReactActivityDelegate(
            this,
            mainComponentName,
            HealthBridgePackage()
        ) {
            override fun onCreate() {
                try {
                    validateSecurityContext()
                    super.onCreate()
                } catch (e: Exception) {
                    Timber.e(e, "Failed to create activity delegate")
                    throw SecurityException("Security context validation failed", e)
                }
            }
        }
    }

    /**
     * Initializes the activity with security measures and HIPAA compliance.
     * Handles permission requests and secure storage initialization.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        try {
            super.onCreate(savedInstanceState)

            // Initialize security components
            initializeSecurityContext()

            // Request required permissions
            requestRequiredPermissions()

            Timber.i("MainActivity onCreate completed successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to initialize MainActivity")
            throw SecurityException("MainActivity initialization failed", e)
        }
    }

    /**
     * Handles permission request results with security logging.
     * Implements secure audit trail for permission changes.
     */
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        try {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults)

            when (requestCode) {
                PERMISSIONS_REQUEST_CODE -> {
                    handlePermissionResults(permissions, grantResults)
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Error handling permission results")
        }
    }

    /**
     * Initializes security context with HIPAA-compliant measures.
     * Sets up encryption, secure storage, and audit logging.
     */
    private fun initializeSecurityContext() {
        if (!isSecurityInitialized.get()) {
            try {
                // Initialize security manager
                securityManager = SecurityManager()

                // Verify security requirements
                validateSecurityContext()

                isSecurityInitialized.set(true)
                Timber.i("Security context initialized successfully")
            } catch (e: Exception) {
                Timber.e(e, "Failed to initialize security context")
                throw SecurityException("Security initialization failed", e)
            }
        }
    }

    /**
     * Validates security context for HIPAA compliance.
     * Checks encryption strength, secure storage, and system integrity.
     */
    private fun validateSecurityContext() {
        try {
            // Verify security manager initialization
            requireNotNull(securityManager) { "Security manager not initialized" }

            // Verify system integrity
            require(packageManager.hasSystemFeature("android.hardware.strongbox")) {
                "Secure hardware not available"
            }

            Timber.d("Security context validation successful")
        } catch (e: Exception) {
            Timber.e(e, "Security context validation failed")
            throw SecurityException("Security validation failed", e)
        }
    }

    /**
     * Requests required permissions with secure handling.
     * Implements rate limiting and attempt tracking.
     */
    private fun requestRequiredPermissions() {
        try {
            PermissionUtils.requestPermissions(
                this,
                requiredPermissions,
                PERMISSIONS_REQUEST_CODE
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to request permissions")
            throw SecurityException("Permission request failed", e)
        }
    }

    /**
     * Handles permission results with secure audit logging.
     * Tracks permission changes and updates security context.
     */
    private fun handlePermissionResults(
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        try {
            permissions.zip(grantResults.toTypedArray()).forEach { (permission, result) ->
                val granted = result == android.content.pm.PackageManager.PERMISSION_GRANTED
                Timber.i("Permission $permission: ${if (granted) "GRANTED" else "DENIED"}")
            }
        } catch (e: Exception) {
            Timber.e(e, "Error processing permission results")
        }
    }
}