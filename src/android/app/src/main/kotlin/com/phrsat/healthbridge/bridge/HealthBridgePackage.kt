package com.phrsat.healthbridge.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import timber.log.Timber // version: 5.0.1
import java.util.concurrent.locks.ReentrantLock
import com.phrsat.healthbridge.utils.SecurityConstants

/**
 * React Native package implementation that registers the HealthBridge native module
 * with enhanced security features, HIPAA compliance checks, and thread-safe module instantiation.
 */
class HealthBridgePackage : ReactPackage {

    // Thread-safe module instance management
    @Volatile
    private var moduleInstance: HealthBridgeModule? = null
    private val moduleLock = ReentrantLock()

    init {
        try {
            // Initialize security parameters
            verifySecurityRequirements()
            // Set up audit logging
            Timber.plant(Timber.DebugTree())
            Timber.i("HealthBridgePackage initialized with enhanced security")
        } catch (e: Exception) {
            Timber.e(e, "Failed to initialize HealthBridgePackage")
            throw SecurityException("Package initialization failed: ${e.message}")
        }
    }

    /**
     * Creates and returns a list of native modules with enhanced security checks
     * and thread-safe instantiation.
     *
     * @param reactContext The React Native application context
     * @return List containing the thread-safe, security-validated HealthBridge native module
     */
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        try {
            // Validate React context
            validateReactContext(reactContext)

            // Thread-safe module instantiation
            moduleLock.lock()
            try {
                // Reuse existing module instance if available
                val existingModule = moduleInstance
                if (existingModule != null && existingModule.reactContext == reactContext) {
                    Timber.d("Reusing existing HealthBridgeModule instance")
                    return listOf(existingModule)
                }

                // Create new module instance with security initialization
                val newModule = HealthBridgeModule(reactContext)
                moduleInstance = newModule
                
                Timber.i("Created new HealthBridgeModule instance")
                return listOf(newModule)
            } finally {
                moduleLock.unlock()
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to create native modules")
            throw SecurityException("Module creation failed: ${e.message}")
        }
    }

    /**
     * Creates and returns a list of view managers (empty as this package doesn't include any custom views).
     *
     * @param reactContext The React Native application context
     * @return Empty list as no custom views are implemented
     */
    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> {
        return emptyList()
    }

    /**
     * Verifies security requirements for HIPAA compliance.
     *
     * @throws SecurityException if security requirements are not met
     */
    private fun verifySecurityRequirements() {
        // Verify encryption algorithm availability
        val availableAlgorithms = javax.crypto.Cipher.getMaxAllowedKeyLength(SecurityConstants.ENCRYPTION_ALGORITHM)
        require(availableAlgorithms >= SecurityConstants.KEY_SIZE) {
            "Required encryption strength not available"
        }

        // Verify Android KeyStore availability
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)

        // Verify secure random number generator
        val secureRandom = java.security.SecureRandom()
        val testBytes = ByteArray(16)
        secureRandom.nextBytes(testBytes)
    }

    /**
     * Validates React Native application context for security requirements.
     *
     * @param reactContext The React Native application context to validate
     * @throws IllegalStateException if context validation fails
     */
    private fun validateReactContext(reactContext: ReactApplicationContext) {
        require(reactContext.hasActiveReactInstance()) {
            "React context is not active"
        }

        require(reactContext.applicationContext != null) {
            "Application context is null"
        }

        // Verify context has necessary permissions
        val requiredPermissions = arrayOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.BODY_SENSORS
        )

        requiredPermissions.forEach { permission ->
            val granted = reactContext.checkSelfPermission(permission) == 
                android.content.pm.PackageManager.PERMISSION_GRANTED
            require(granted) {
                "Missing required permission: $permission"
            }
        }
    }
}