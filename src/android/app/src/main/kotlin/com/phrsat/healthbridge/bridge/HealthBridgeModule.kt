package com.phrsat.healthbridge.bridge

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.phrsat.healthbridge.googlefit.GoogleFitManager
import com.phrsat.healthbridge.security.BiometricManager
import com.phrsat.healthbridge.storage.SecurePreferences
import com.phrsat.healthbridge.utils.SecurityConstants
import com.phrsat.healthbridge.models.HealthMetric
import timber.log.Timber // version: 5.0.1
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * React Native bridge module that provides secure access to Android health data and biometric authentication.
 * Implements HIPAA-compliant data handling with comprehensive security measures.
 */
class HealthBridgeModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.Default)
    private val googleFitManager: GoogleFitManager
    private val biometricManager: BiometricManager
    private val securePreferences: SecurePreferences
    private val rateLimiter = AtomicInteger(100) // 100 requests per hour
    private val dataCache = ConcurrentHashMap<String, Pair<Long, Any>>()

    companion object {
        private const val CACHE_DURATION = 900000L // 15 minutes
        private const val MODULE_NAME = "HealthBridge"
    }

    init {
        securePreferences = SecurePreferences(reactContext)
        googleFitManager = GoogleFitManager(
            reactContext,
            securePreferences,
            AuditLogger()
        )
        biometricManager = BiometricManager(
            getCurrentActivity() as FragmentActivity,
            securePreferences
        )
        setupRateLimitReset()
        Timber.i("HealthBridgeModule initialized")
    }

    override fun getName(): String = MODULE_NAME

    /**
     * Synchronizes health data with Google Fit using secure data handling.
     * @param promise Promise for async result handling
     */
    @ReactMethod
    fun syncHealthData(promise: Promise) {
        if (!checkRateLimit()) {
            promise.reject("RATE_LIMIT", "API rate limit exceeded")
            return
        }

        scope.launch {
            try {
                val metrics = googleFitManager.readHealthMetrics(
                    GoogleFitDataTypes.HEART_RATE_BPM,
                    System.currentTimeMillis() - 86400000, // Last 24 hours
                    System.currentTimeMillis()
                )
                
                val result = Arguments.createArray()
                metrics.forEach { metric ->
                    result.pushMap(convertMetricToWritableMap(metric))
                }
                
                promise.resolve(result)
                Timber.i("Health data sync completed successfully")
            } catch (e: Exception) {
                Timber.e(e, "Health data sync failed")
                promise.reject("SYNC_ERROR", e.message, e)
            }
        }
    }

    /**
     * Retrieves health metrics with secure caching and rate limiting.
     * @param metricType Type of health metric to retrieve
     * @param startTime Start time in milliseconds
     * @param endTime End time in milliseconds
     * @param promise Promise for async result handling
     */
    @ReactMethod
    fun getHealthMetrics(
        metricType: String,
        startTime: Double,
        endTime: Double,
        promise: Promise
    ) {
        if (!checkRateLimit()) {
            promise.reject("RATE_LIMIT", "API rate limit exceeded")
            return
        }

        scope.launch {
            try {
                val cacheKey = "$metricType:$startTime:$endTime"
                val cachedData = dataCache[cacheKey]
                
                if (cachedData != null && 
                    System.currentTimeMillis() - cachedData.first < CACHE_DURATION) {
                    promise.resolve(cachedData.second)
                    return@launch
                }

                val metrics = googleFitManager.readHealthMetrics(
                    GoogleFitDataTypes.valueOf(metricType.uppercase()),
                    startTime.toLong(),
                    endTime.toLong()
                )

                val result = Arguments.createArray()
                metrics.forEach { metric ->
                    result.pushMap(convertMetricToWritableMap(metric))
                }

                dataCache[cacheKey] = System.currentTimeMillis() to result
                promise.resolve(result)
                
                Timber.i("Health metrics retrieved successfully: $metricType")
            } catch (e: Exception) {
                Timber.e(e, "Failed to retrieve health metrics: $metricType")
                promise.reject("METRICS_ERROR", e.message, e)
            }
        }
    }

    /**
     * Initiates biometric authentication with enhanced security.
     * @param promise Promise for async result handling
     */
    @ReactMethod
    fun authenticateWithBiometrics(promise: Promise) {
        if (!biometricManager.isBiometricAvailable()) {
            promise.reject("BIOMETRIC_UNAVAILABLE", "Biometric authentication not available")
            return
        }

        biometricManager.authenticate(object : BiometricManager.BiometricCallback {
            override fun onSuccess() {
                promise.resolve(true)
                Timber.i("Biometric authentication successful")
            }

            override fun onError(message: String) {
                promise.reject("BIOMETRIC_ERROR", message)
                Timber.e("Biometric authentication failed: $message")
            }
        })
    }

    /**
     * Configures biometric authentication settings.
     * @param enabled Boolean to enable/disable biometric auth
     * @param promise Promise for async result handling
     */
    @ReactMethod
    fun setBiometricsEnabled(enabled: Boolean, promise: Promise) {
        try {
            biometricManager.setBiometricEnabled(enabled)
            promise.resolve(true)
            Timber.i("Biometric settings updated: enabled=$enabled")
        } catch (e: Exception) {
            Timber.e(e, "Failed to update biometric settings")
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    private fun convertMetricToWritableMap(metric: HealthMetric): WritableMap {
        return Arguments.createMap().apply {
            putString("id", metric.id)
            putString("type", metric.type)
            putDouble("value", metric.value)
            putString("unit", metric.unit)
            putDouble("timestamp", metric.timestamp.time.toDouble())
            metric.source?.let { putString("source", it) }
            metric.metadata?.let { metadata ->
                putMap("metadata", Arguments.makeNativeMap(metadata))
            }
        }
    }

    private fun checkRateLimit(): Boolean {
        return rateLimiter.decrementAndGet() >= 0
    }

    private fun setupRateLimitReset() {
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
            {
                rateLimiter.set(100)
                setupRateLimitReset()
            },
            3600000L // Reset every hour
        )
    }
}