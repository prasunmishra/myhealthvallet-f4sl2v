package com.phrsat.healthbridge

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.phrsat.healthbridge.googlefit.GoogleFitManager
import com.phrsat.healthbridge.security.BiometricManager
import com.phrsat.healthbridge.storage.SecurePreferences
import com.phrsat.healthbridge.monitoring.PerformanceMonitor
import com.phrsat.healthbridge.security.IntegrityManager
import com.squareup.leakcanary.LeakCanary // version: 2.12
import timber.log.Timber // version: 5.0.1
import java.util.concurrent.TimeUnit

/**
 * Main application class for PHRSAT that initializes core components and manages application lifecycle.
 * Implements HIPAA-compliant security measures, health data synchronization, and comprehensive monitoring.
 */
class PHRSATApplication : Application() {

    companion object {
        private const val SYNC_INTERVAL_HOURS = 4L
        private const val WORK_NAME_SYNC = "health_data_sync"
        private const val KEY_ROTATION_DAYS = 30L
        private const val MAX_RETRY_ATTEMPTS = 3
    }

    // Core managers
    lateinit var googleFitManager: GoogleFitManager
        private set
    lateinit var biometricManager: BiometricManager
        private set
    lateinit var securePreferences: SecurePreferences
        private set
    lateinit var integrityManager: IntegrityManager
        private set
    lateinit var performanceMonitor: PerformanceMonitor
        private set

    override fun onCreate() {
        super.onCreate()

        // Initialize logging for debug builds
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
            initializeLeakDetection()
        }

        try {
            // Initialize core security components
            setupSecurity()

            // Initialize health data integration
            googleFitManager = GoogleFitManager(
                context = this,
                securityManager = integrityManager.securityManager,
                auditLogger = integrityManager.auditLogger
            )

            // Setup performance monitoring
            performanceMonitor = PerformanceMonitor(
                context = this,
                securePreferences = securePreferences
            )

            // Schedule periodic health data synchronization
            setupHealthDataSync()

            Timber.i("PHRSATApplication initialized successfully")
        } catch (e: Exception) {
            Timber.e(e, "Failed to initialize PHRSATApplication")
            performanceMonitor.trackFatalError("initialization_failed", e)
            throw RuntimeException("Application initialization failed", e)
        }
    }

    /**
     * Initializes security components with enhanced integrity checks and monitoring.
     */
    private fun setupSecurity() {
        // Initialize secure preferences with encryption
        securePreferences = SecurePreferences(this)

        // Initialize integrity manager for security validation
        integrityManager = IntegrityManager(this, securePreferences)

        // Verify secure boot state and system integrity
        if (!integrityManager.validateSecureBoot()) {
            Timber.e("Secure boot validation failed")
            throw SecurityException("System integrity check failed")
        }

        // Initialize biometric authentication
        biometricManager = BiometricManager(
            activity = null, // Will be set by MainActivity
            securePreferences = securePreferences
        )

        // Schedule periodic key rotation
        scheduleKeyRotation()

        Timber.d("Security components initialized successfully")
    }

    /**
     * Configures periodic health data synchronization with retry policies and monitoring.
     */
    private fun setupHealthDataSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val syncWorkRequest = PeriodicWorkRequestBuilder<HealthDataSyncWorker>(
            SYNC_INTERVAL_HOURS, TimeUnit.HOURS
        ).apply {
            setConstraints(constraints)
            setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            addTag("health_sync")
        }.build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            WORK_NAME_SYNC,
            ExistingPeriodicWorkPolicy.KEEP,
            syncWorkRequest
        )

        Timber.d("Health data sync scheduled with ${SYNC_INTERVAL_HOURS}h interval")
    }

    /**
     * Schedules periodic encryption key rotation for enhanced security.
     */
    private fun scheduleKeyRotation() {
        val keyRotationWork = PeriodicWorkRequestBuilder<KeyRotationWorker>(
            KEY_ROTATION_DAYS, TimeUnit.DAYS
        ).apply {
            setConstraints(Constraints.Builder()
                .setRequiresBatteryNotLow(true)
                .build()
            )
            addTag("security")
        }.build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "key_rotation",
            ExistingPeriodicWorkPolicy.KEEP,
            keyRotationWork
        )

        Timber.d("Key rotation scheduled with ${KEY_ROTATION_DAYS}d interval")
    }

    /**
     * Initializes memory leak detection for debug builds.
     */
    private fun initializeLeakDetection() {
        if (!LeakCanary.isInAnalyzerProcess(this)) {
            LeakCanary.install(this)
        }
    }

    /**
     * Performs cleanup and ensures secure shutdown.
     */
    override fun onTerminate() {
        try {
            performanceMonitor.flush()
            integrityManager.performSecureCleanup()
        } catch (e: Exception) {
            Timber.e(e, "Error during application termination")
        } finally {
            super.onTerminate()
        }
    }
}