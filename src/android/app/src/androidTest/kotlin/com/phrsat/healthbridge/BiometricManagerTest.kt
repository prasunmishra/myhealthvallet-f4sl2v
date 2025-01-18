package com.phrsat.healthbridge

import android.content.Context
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.phrsat.healthbridge.security.BiometricManager
import com.phrsat.healthbridge.storage.SecurePreferences
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class BiometricManagerTest {

    private lateinit var context: Context
    private lateinit var activity: FragmentActivity
    private lateinit var securePreferences: SecurePreferences
    private lateinit var biometricManager: BiometricManager
    private lateinit var biometricPrompt: BiometricPrompt

    private companion object {
        private const val TEST_TIMEOUT = 5000L // 5 seconds timeout for async operations
        private const val MAX_AUTH_ATTEMPTS = 3
        private const val MIN_BIOMETRIC_STRENGTH = BiometricManager.BIOMETRIC_STRONG
    }

    @Before
    fun setUp() {
        // Initialize test environment
        context = ApplicationProvider.getApplicationContext()
        activity = FragmentActivity()
        securePreferences = SecurePreferences(context)
        biometricManager = BiometricManager(activity, securePreferences)

        // Clear any existing biometric state
        securePreferences.clear()
    }

    @After
    fun tearDown() {
        // Clean up test environment
        securePreferences.clear()
        activity.finish()
    }

    @Test
    fun testBiometricAvailability() {
        // Test biometric hardware availability
        val isAvailable = biometricManager.isBiometricAvailable()
        
        // Verify system state
        assertTrue("Device must support biometric authentication", isAvailable)
        assertTrue("Biometric strength must meet HIPAA requirements", 
            biometricManager.getBiometricStrength() >= MIN_BIOMETRIC_STRENGTH)
    }

    @Test
    fun testBiometricAuthentication() {
        val latch = CountDownLatch(1)
        var authSuccess = false
        var authError: String? = null

        // Enable biometric authentication
        biometricManager.setBiometricEnabled(true)

        // Attempt authentication
        biometricManager.authenticate(object : BiometricManager.BiometricCallback {
            override fun onSuccess() {
                authSuccess = true
                latch.countDown()
            }

            override fun onError(message: String) {
                authError = message
                latch.countDown()
            }
        })

        // Wait for authentication result
        latch.await(TEST_TIMEOUT, TimeUnit.MILLISECONDS)

        // Verify authentication outcome
        if (authError != null) {
            fail("Authentication failed with error: $authError")
        }
        assertTrue("Authentication should succeed", authSuccess)
    }

    @Test
    fun testMaxAuthenticationAttempts() {
        val latch = CountDownLatch(MAX_AUTH_ATTEMPTS)
        var attemptCount = 0
        var lastError: String? = null

        // Enable biometric authentication
        biometricManager.setBiometricEnabled(true)

        // Attempt authentication multiple times
        repeat(MAX_AUTH_ATTEMPTS + 1) {
            biometricManager.authenticate(object : BiometricManager.BiometricCallback {
                override fun onSuccess() {
                    attemptCount++
                    latch.countDown()
                }

                override fun onError(message: String) {
                    lastError = message
                    latch.countDown()
                }
            })
        }

        // Wait for attempts to complete
        latch.await(TEST_TIMEOUT, TimeUnit.MILLISECONDS)

        // Verify attempt limiting
        assertEquals("Should limit authentication attempts", MAX_AUTH_ATTEMPTS, attemptCount)
        assertNotNull("Should receive error for exceeding attempts", lastError)
        assertTrue("Should be in cooldown period", lastError!!.contains("Too many attempts"))
    }

    @Test
    fun testBiometricStateManagement() {
        // Test enabling biometric authentication
        biometricManager.setBiometricEnabled(true)
        assertTrue("Biometric should be enabled", biometricManager.isBiometricEnabled())

        // Test disabling biometric authentication
        biometricManager.setBiometricEnabled(false)
        assertFalse("Biometric should be disabled", biometricManager.isBiometricEnabled())

        // Verify secure storage
        val storedState = securePreferences.getBoolean("biometric_enabled", false)
        assertFalse("Biometric state should persist", storedState)
    }

    @Test
    fun testSecurityVerification() {
        // Test security state verification
        assertTrue("Security verification should pass", biometricManager.verifyIntegrity())

        // Test with tampered state
        securePreferences.clear()
        assertFalse("Security verification should fail with cleared state", 
            biometricManager.verifyIntegrity())
    }

    @Test
    fun testAuthenticationTimeout() {
        val latch = CountDownLatch(1)
        var timeoutError: String? = null

        // Enable biometric authentication
        biometricManager.setBiometricEnabled(true)

        // Attempt authentication with timeout
        biometricManager.authenticate(object : BiometricManager.BiometricCallback {
            override fun onSuccess() {
                latch.countDown()
            }

            override fun onError(message: String) {
                timeoutError = message
                latch.countDown()
            }
        })

        // Wait for timeout
        val timedOut = !latch.await(TEST_TIMEOUT, TimeUnit.MILLISECONDS)

        // Verify timeout behavior
        assertTrue("Authentication should timeout", timedOut)
        assertNull("Should not receive success callback", timeoutError)
    }

    @Test
    fun testBiometricStrength() {
        // Get biometric strength
        val strength = biometricManager.getBiometricStrength()

        // Verify HIPAA compliance
        assertTrue("Biometric strength must meet HIPAA requirements",
            strength >= MIN_BIOMETRIC_STRENGTH)
    }
}