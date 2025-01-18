package com.phrsat.healthbridge.googlefit

import android.content.Context
import android.util.Log
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.fitness.Fitness // v21.1.0
import com.google.android.gms.fitness.FitnessOptions
import com.google.android.gms.fitness.data.DataPoint
import com.google.android.gms.fitness.data.DataSet
import com.google.android.gms.fitness.request.DataReadRequest
import com.google.android.gms.fitness.request.DataUpdateRequest
import com.google.android.gms.tasks.Tasks
import com.phrsat.healthbridge.googlefit.GoogleFitDataTypes
import com.phrsat.healthbridge.logging.AuditLogger // v1.0.0
import com.phrsat.healthbridge.models.HealthMetric
import com.phrsat.healthbridge.security.SecurityManager // v1.0.0
import java.util.concurrent.TimeUnit
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.Cipher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * HIPAA-compliant Google Fit integration manager handling secure health data synchronization.
 * Implements comprehensive audit logging and rate limiting for all operations.
 *
 * @property context Application context
 * @property securityManager Security manager for encryption/decryption
 * @property auditLogger HIPAA-compliant audit logger
 */
@HIPAACompliant
@Audited
class GoogleFitManager(
    private val context: Context,
    private val securityManager: SecurityManager,
    private val auditLogger: AuditLogger
) {
    companion object {
        private const val TAG = "GoogleFitManager"
        private const val SYNC_INTERVAL_MS = 900000L // 15 minutes
        private const val MAX_READ_LIMIT = 1000
        private const val API_RATE_LIMIT = 100
        private const val ENCRYPTION_ALGORITHM = "AES256"
    }

    private val apiRateLimiter = AtomicInteger(API_RATE_LIMIT)
    private val metricCache = ConcurrentHashMap<String, Pair<Long, List<HealthMetric>>>()
    private val mutex = Mutex()
    private val fitnessOptions = FitnessOptions.builder()
        .addDataType(GoogleFitDataTypes.HEART_RATE_BPM.getDataType(), FitnessOptions.ACCESS_READ_WRITE)
        .addDataType(GoogleFitDataTypes.STEPS_COUNT.getDataType(), FitnessOptions.ACCESS_READ_WRITE)
        .addDataType(GoogleFitDataTypes.BLOOD_PRESSURE_MMHG.getDataType(), FitnessOptions.ACCESS_READ_WRITE)
        .addDataType(GoogleFitDataTypes.WEIGHT_KG.getDataType(), FitnessOptions.ACCESS_READ_WRITE)
        .addDataType(GoogleFitDataTypes.HEIGHT_M.getDataType(), FitnessOptions.ACCESS_READ_WRITE)
        .addDataType(GoogleFitDataTypes.SLEEP_SEGMENT.getDataType(), FitnessOptions.ACCESS_READ_WRITE)
        .addDataType(GoogleFitDataTypes.OXYGEN_SATURATION.getDataType(), FitnessOptions.ACCESS_READ_WRITE)
        .addDataType(GoogleFitDataTypes.BLOOD_GLUCOSE.getDataType(), FitnessOptions.ACCESS_READ_WRITE)
        .build()

    init {
        verifyGooglePlayServices()
        setupSecureGoogleSignIn()
        scheduleRateLimitReset()
    }

    /**
     * Securely reads health metrics from Google Fit with HIPAA compliance.
     *
     * @param dataType Type of health data to read
     * @param startTime Start time in milliseconds
     * @param endTime End time in milliseconds
     * @return List of encrypted health metrics
     * @throws SecurityException if security requirements are not met
     */
    @Throws(SecurityException::class)
    @Audited
    @RateLimited
    suspend fun readHealthMetrics(
        dataType: GoogleFitDataTypes,
        startTime: Long,
        endTime: Long
    ): List<HealthMetric> = withContext(Dispatchers.IO) {
        mutex.withLock {
            try {
                verifyHipaaCompliance()
                checkRateLimit()
                validateTimeRange(startTime, endTime)

                // Check cache first
                val cacheKey = "${dataType.name}:$startTime:$endTime"
                metricCache[cacheKey]?.let { (timestamp, metrics) ->
                    if (System.currentTimeMillis() - timestamp < SYNC_INTERVAL_MS) {
                        auditLogger.log("Cache hit for $dataType", "READ")
                        return@withContext metrics
                    }
                }

                val request = DataReadRequest.Builder()
                    .read(dataType.getDataType())
                    .setTimeRange(startTime, endTime, TimeUnit.MILLISECONDS)
                    .setLimit(MAX_READ_LIMIT)
                    .build()

                val googleSignInAccount = GoogleSignIn.getLastSignedInAccount(context)
                    ?: throw SecurityException("User not authenticated")

                val response = Tasks.await(
                    Fitness.getHistoryClient(context, googleSignInAccount)
                        .readData(request)
                )

                val metrics = response.dataSets
                    .flatMap { processDataSet(it, dataType) }
                    .map { encryptMetric(it) }

                // Update cache
                metricCache[cacheKey] = System.currentTimeMillis() to metrics
                auditLogger.log("Successfully read ${metrics.size} metrics for $dataType", "READ")

                metrics
            } catch (e: Exception) {
                Log.e(TAG, "Error reading health metrics", e)
                auditLogger.logError("Failed to read metrics for $dataType", e)
                throw e
            }
        }
    }

    /**
     * Securely writes a health metric to Google Fit with HIPAA compliance.
     *
     * @param metric Health metric to write
     * @return Success status
     * @throws SecurityException if security requirements are not met
     */
    @Throws(SecurityException::class)
    @Audited
    @RateLimited
    suspend fun writeHealthMetric(metric: HealthMetric): Boolean = withContext(Dispatchers.IO) {
        mutex.withLock {
            try {
                verifyHipaaCompliance()
                checkRateLimit()
                validateMetric(metric)

                val dataType = GoogleFitDataTypes.valueOf(metric.type.uppercase())
                val dataPoint = DataPoint.builder(dataType.getDataType())
                    .setTimestamp(metric.timestamp.time, TimeUnit.MILLISECONDS)
                    .setField(dataType.getField(), metric.value)
                    .build()

                val dataSet = DataSet.builder(dataType.getDataType())
                    .add(dataPoint)
                    .build()

                val request = DataUpdateRequest.Builder()
                    .setDataSet(dataSet)
                    .setTimeInterval(metric.timestamp.time, metric.timestamp.time, TimeUnit.MILLISECONDS)
                    .build()

                val googleSignInAccount = GoogleSignIn.getLastSignedInAccount(context)
                    ?: throw SecurityException("User not authenticated")

                Tasks.await(
                    Fitness.getHistoryClient(context, googleSignInAccount)
                        .updateData(request)
                )

                // Invalidate cache for affected time range
                invalidateCache(metric)
                auditLogger.log("Successfully wrote metric: ${metric.type}", "WRITE")

                true
            } catch (e: Exception) {
                Log.e(TAG, "Error writing health metric", e)
                auditLogger.logError("Failed to write metric: ${metric.type}", e)
                throw e
            }
        }
    }

    private fun verifyHipaaCompliance() {
        if (!securityManager.isHipaaCompliant()) {
            throw SecurityException("HIPAA compliance requirements not met")
        }
    }

    private fun checkRateLimit() {
        if (apiRateLimiter.decrementAndGet() < 0) {
            throw SecurityException("API rate limit exceeded")
        }
    }

    private fun validateTimeRange(startTime: Long, endTime: Long) {
        require(startTime < endTime) { "Invalid time range" }
        require(endTime <= System.currentTimeMillis()) { "End time cannot be in future" }
    }

    private fun validateMetric(metric: HealthMetric) {
        require(metric.value >= 0) { "Invalid metric value" }
        require(metric.timestamp.time <= System.currentTimeMillis()) { "Timestamp cannot be in future" }
    }

    private fun processDataSet(dataSet: DataSet, dataType: GoogleFitDataTypes): List<HealthMetric> {
        return dataSet.dataPoints.map { point ->
            HealthMetric(
                id = java.util.UUID.randomUUID().toString(),
                type = dataType.toHealthMetricType(),
                value = point.getValue(dataType.getField()).asFloat().toDouble(),
                unit = dataType.toHealthMetricUnit(),
                timestamp = java.util.Date(point.getTimestamp(TimeUnit.MILLISECONDS)),
                source = "GoogleFit"
            )
        }
    }

    private fun encryptMetric(metric: HealthMetric): HealthMetric {
        val encryptedValue = securityManager.encrypt(
            metric.value.toString(),
            ENCRYPTION_ALGORITHM
        )
        return metric.copy(
            value = encryptedValue.toDouble(),
            metadata = mapOf("encrypted" to true)
        )
    }

    private fun invalidateCache(metric: HealthMetric) {
        metricCache.entries.removeIf { (key, _) ->
            key.startsWith(metric.type.uppercase())
        }
    }

    private fun verifyGooglePlayServices() {
        val availability = com.google.android.gms.common.GoogleApiAvailability.getInstance()
        val result = availability.isGooglePlayServicesAvailable(context)
        if (result != com.google.android.gms.common.ConnectionResult.SUCCESS) {
            throw IllegalStateException("Google Play Services not available")
        }
    }

    private fun setupSecureGoogleSignIn() {
        if (!GoogleSignIn.hasPermissions(
                GoogleSignIn.getLastSignedInAccount(context),
                fitnessOptions
            )
        ) {
            auditLogger.log("Google Fit permissions not granted", "SETUP")
        }
    }

    private fun scheduleRateLimitReset() {
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
            {
                apiRateLimiter.set(API_RATE_LIMIT)
                scheduleRateLimitReset()
            },
            TimeUnit.HOURS.toMillis(1)
        )
    }
}