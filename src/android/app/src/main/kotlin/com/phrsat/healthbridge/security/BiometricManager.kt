package com.phrsat.healthbridge.security

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import com.phrsat.healthbridge.storage.SecurePreferences
import com.phrsat.healthbridge.utils.SecurityConstants
import timber.log.Timber // version: 5.0.1
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Manages HIPAA-compliant biometric authentication for secure access to the PHRSAT application.
 * Implements enhanced security features including attempt limiting, cooldown periods,
 * and comprehensive audit logging.
 */
class BiometricManager(
    private val activity: FragmentActivity,
    private val securePreferences: SecurePreferences
) {
    private val executor: Executor = Executors.newSingleThreadExecutor()
    private var attemptCount: Int = 0
    private var lastAttemptTime: Long = 0
    private val biometricStrength: Int

    private val biometricPrompt: BiometricPrompt

    companion object {
        private const val PREF_ATTEMPT_COUNT = "biometric_attempt_count"
        private const val PREF_LAST_ATTEMPT = "biometric_last_attempt"
        private const val PREF_BIOMETRIC_ENABLED = "biometric_enabled"
        private const val MAX_ATTEMPTS = 5
        private const val COOLDOWN_PERIOD = 300000L // 5 minutes in milliseconds
    }

    init {
        // Initialize biometric strength check
        val biometricManager = BiometricManager.from(activity)
        biometricStrength = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )

        // Load stored attempt data
        attemptCount = securePreferences.getString(PREF_ATTEMPT_COUNT, "0").toInt()
        lastAttemptTime = securePreferences.getString(PREF_LAST_ATTEMPT, "0").toLong()

        // Initialize BiometricPrompt with enhanced security callbacks
        biometricPrompt = BiometricPrompt(activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationError(
                    errorCode: Int,
                    errString: CharSequence
                ) {
                    super.onAuthenticationError(errorCode, errString)
                    handleAuthenticationError(errorCode, errString)
                }

                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    super.onAuthenticationSucceeded(result)
                    handleAuthenticationSuccess(result)
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    handleAuthenticationFailure()
                }
            })

        Timber.i("BiometricManager initialized with strength level: $biometricStrength")
    }

    /**
     * Checks if HIPAA-compliant biometric authentication is available.
     * @return Boolean indicating if biometric authentication can be used
     */
    fun isBiometricAvailable(): Boolean {
        val canAuthenticate = biometricStrength == BiometricManager.BIOMETRIC_SUCCESS
        val isEnabled = securePreferences.getString(PREF_BIOMETRIC_ENABLED, "false").toBoolean()
        val isNotLocked = !isInCooldownPeriod()

        Timber.d("Biometric availability check - Can authenticate: $canAuthenticate, " +
                "Enabled: $isEnabled, Not locked: $isNotLocked")

        return canAuthenticate && isEnabled && isNotLocked
    }

    /**
     * Initiates HIPAA-compliant biometric authentication flow.
     * @param callback BiometricCallback for authentication result handling
     */
    fun authenticate(callback: BiometricCallback) {
        if (!verifySecurityState()) {
            Timber.e("Security state verification failed")
            callback.onError("Security verification failed")
            return
        }

        if (isInCooldownPeriod()) {
            val remainingTime = (COOLDOWN_PERIOD - (System.currentTimeMillis() - lastAttemptTime)) / 1000
            Timber.w("Authentication in cooldown period. Remaining time: $remainingTime seconds")
            callback.onError("Too many attempts. Please try again in $remainingTime seconds")
            return
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate Access")
            .setSubtitle("Verify your identity to access health records")
            .setNegativeButtonText("Cancel")
            .setConfirmationRequired(true)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        try {
            biometricPrompt.authenticate(promptInfo)
            updateAttemptMetrics()
            Timber.i("Biometric authentication initiated")
        } catch (e: Exception) {
            Timber.e(e, "Failed to initiate biometric authentication")
            callback.onError("Authentication initialization failed")
        }
    }

    /**
     * Securely enables or disables biometric authentication.
     * @param enabled Boolean indicating if biometric auth should be enabled
     */
    fun setBiometricEnabled(enabled: Boolean) {
        if (!verifySecurityState()) {
            Timber.e("Security state verification failed during biometric configuration")
            return
        }

        try {
            securePreferences.putString(PREF_BIOMETRIC_ENABLED, enabled.toString())
            resetAttemptMetrics()
            Timber.i("Biometric authentication ${if (enabled) "enabled" else "disabled"}")
        } catch (e: Exception) {
            Timber.e(e, "Failed to update biometric configuration")
        }
    }

    private fun verifySecurityState(): Boolean {
        return try {
            // Verify system integrity
            val biometricManager = BiometricManager.from(activity)
            val canAuthenticate = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )
            
            if (canAuthenticate != BiometricManager.BIOMETRIC_SUCCESS) {
                Timber.w("Biometric security state verification failed: $canAuthenticate")
                return false
            }

            Timber.d("Security state verification successful")
            true
        } catch (e: Exception) {
            Timber.e(e, "Security state verification failed with exception")
            false
        }
    }

    private fun handleAuthenticationError(errorCode: Int, errString: CharSequence) {
        Timber.w("Authentication error [$errorCode]: $errString")
        updateAttemptMetrics()
    }

    private fun handleAuthenticationSuccess(result: BiometricPrompt.AuthenticationResult) {
        Timber.i("Authentication succeeded")
        resetAttemptMetrics()
    }

    private fun handleAuthenticationFailure() {
        Timber.w("Authentication failed")
        updateAttemptMetrics()
    }

    private fun updateAttemptMetrics() {
        attemptCount++
        lastAttemptTime = System.currentTimeMillis()
        securePreferences.putString(PREF_ATTEMPT_COUNT, attemptCount.toString())
        securePreferences.putString(PREF_LAST_ATTEMPT, lastAttemptTime.toString())

        if (attemptCount >= MAX_ATTEMPTS) {
            Timber.w("Maximum authentication attempts reached")
        }
    }

    private fun resetAttemptMetrics() {
        attemptCount = 0
        lastAttemptTime = 0
        securePreferences.putString(PREF_ATTEMPT_COUNT, "0")
        securePreferences.putString(PREF_LAST_ATTEMPT, "0")
        Timber.d("Authentication attempt metrics reset")
    }

    private fun isInCooldownPeriod(): Boolean {
        return attemptCount >= MAX_ATTEMPTS &&
                (System.currentTimeMillis() - lastAttemptTime) < COOLDOWN_PERIOD
    }

    /**
     * Callback interface for biometric authentication results
     */
    interface BiometricCallback {
        fun onSuccess()
        fun onError(message: String)
    }
}