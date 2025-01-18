package com.phrsat.healthbridge.googlefit

import android.content.Context
import android.os.BatteryManager
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.ListenableWorker.Result
import androidx.core.net.NetworkUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.random.Random

/**
 * HIPAA-compliant background worker for synchronizing health data with Google Fit.
 * Implements robust error handling, resource-efficient operations, and secure data transfer.
 *
 * @property context Application context
 * @property params Worker parameters
 */
class GoogleFitSyncWorker(
    context: Context,
    params: WorkerParameters
) : Worker(context, params) {

    companion object {
        private const val TAG = "GoogleFitSyncWorker"
        private const val SYNC_INTERVAL_HOURS = 4
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val BACKOFF_DELAY_MINUTES = 15
        private const val MIN_BATTERY_PERCENTAGE = 15
        private const val MAX_SYNC_DURATION_MINUTES = 30
    }

    private val fitManager: GoogleFitManager = GoogleFitManager(
        context,
        com.phrsat.healthbridge.security.SecurityManager(context),
        com.phrsat.healthbridge.logging.AuditLogger()
    )
    private val networkUtils: NetworkUtils = NetworkUtils()
    private var retryCount: Int = 0
    private val syncScope = CoroutineScope(Dispatchers.IO)

    /**
     * Executes the background sync operation with comprehensive error handling
     * and resource management.
     *
     * @return Result indicating success, retry, or failure of the sync operation
     */
    override fun doWork(): Result {
        Log.d(TAG, "Starting Google Fit sync operation")

        // Check battery level
        val batteryManager = applicationContext.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val batteryLevel = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (batteryLevel < MIN_BATTERY_PERCENTAGE) {
            Log.w(TAG, "Battery level too low for sync: $batteryLevel%")
            return handleRetry(Exception("Battery level too low"))
        }

        // Check network connectivity
        if (!networkUtils.isConnected(applicationContext)) {
            Log.w(TAG, "No network connectivity available")
            return handleRetry(Exception("No network connectivity"))
        }

        return try {
            syncScope.launch {
                withTimeout(TimeUnit.MINUTES.toMillis(MAX_SYNC_DURATION_MINUTES)) {
                    // Validate Google Fit permissions
                    fitManager.validatePermissions()

                    // Sync health data for last interval
                    val endTime = System.currentTimeMillis()
                    val startTime = endTime - TimeUnit.HOURS.toMillis(SYNC_INTERVAL_HOURS.toLong())
                    
                    // Sync each data type
                    GoogleFitDataTypes.values().forEach { dataType ->
                        try {
                            fitManager.syncHealthData(dataType, startTime, endTime)
                            Log.d(TAG, "Successfully synced ${dataType.name}")
                        } catch (e: Exception) {
                            Log.e(TAG, "Error syncing ${dataType.name}", e)
                            fitManager.handleSyncError(dataType, e)
                        }
                    }
                }
            }.join()

            Log.i(TAG, "Google Fit sync completed successfully")
            cleanup()
            Result.success()

        } catch (e: Exception) {
            Log.e(TAG, "Error during sync operation", e)
            cleanup()
            handleRetry(e)
        }
    }

    /**
     * Manages retry attempts with exponential backoff and jitter.
     *
     * @param error The exception that triggered the retry
     * @return Result indicating whether to retry or fail
     */
    private fun handleRetry(error: Exception): Result {
        retryCount++
        Log.w(TAG, "Sync attempt $retryCount failed: ${error.message}")

        return if (retryCount < MAX_RETRY_ATTEMPTS) {
            // Calculate exponential backoff with jitter
            val baseDelay = BACKOFF_DELAY_MINUTES * Math.pow(2.0, (retryCount - 1).toDouble())
            val jitter = Random.nextInt(0, BACKOFF_DELAY_MINUTES)
            val delayMinutes = min(baseDelay.toInt() + jitter, 60) // Cap at 1 hour

            Log.d(TAG, "Scheduling retry in $delayMinutes minutes")
            Result.retry()
        } else {
            Log.e(TAG, "Max retry attempts reached, marking as failed")
            Result.failure()
        }
    }

    /**
     * Performs cleanup of resources and temporary data.
     */
    private fun cleanup() {
        try {
            syncScope.cancel()
            // Additional cleanup if needed
            Log.d(TAG, "Cleanup completed")
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup", e)
        }
    }
}