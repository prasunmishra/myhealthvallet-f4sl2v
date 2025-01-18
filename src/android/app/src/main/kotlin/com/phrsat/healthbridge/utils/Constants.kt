import android.os.Build  // version: latest

/**
 * Global constants for the PHRSAT Android application.
 * Contains configurations for API, security, health metrics, and application preferences.
 * Implements HIPAA-compliant security parameters and health platform integration settings.
 */

/**
 * API configuration constants for network communication
 */
object ApiConstants {
    const val BASE_URL = "https://api.phrsat.com"
    const val API_VERSION = "v1"
    const val TIMEOUT_CONNECT = 30L // seconds
    const val TIMEOUT_READ = 30L // seconds
    const val RETRY_COUNT = 3
    const val BATCH_SIZE = 100 // items per batch request
}

/**
 * HIPAA-compliant security configuration constants
 */
object SecurityConstants {
    const val BIOMETRIC_TIMEOUT = 30L // seconds
    const val ENCRYPTION_ALGORITHM = "AES/GCM/NoPadding"
    const val KEY_SIZE = 256 // bits
    const val TOKEN_EXPIRY = 3600L // seconds (1 hour)
    const val HASH_ALGORITHM = "SHA-256"
    const val SALT_LENGTH = 32 // bytes
    const val IV_LENGTH = 12 // bytes for GCM mode
}

/**
 * Google Fit integration constants for health data synchronization
 */
object GoogleFitConstants {
    const val DATA_TYPE_HEART_RATE = "com.google.heart_rate.bpm"
    const val DATA_TYPE_STEPS = "com.google.step_count.delta"
    const val DATA_TYPE_BLOOD_PRESSURE = "com.google.blood_pressure"
    const val DATA_TYPE_BLOOD_GLUCOSE = "com.google.blood_glucose"
    const val DATA_TYPE_OXYGEN_SATURATION = "com.google.oxygen_saturation"
    const val SYNC_INTERVAL = 900L // seconds (15 minutes)
    const val BATCH_SIZE = 1000 // data points per sync
}

/**
 * Standardized health metric types and measurement units
 */
object HealthMetricConstants {
    // Metric Types
    const val METRIC_TYPE_HEART_RATE = "heart_rate"
    const val METRIC_TYPE_BLOOD_PRESSURE = "blood_pressure"
    const val METRIC_TYPE_STEPS = "steps"
    const val METRIC_TYPE_BLOOD_GLUCOSE = "blood_glucose"

    // Measurement Units
    const val UNIT_BPM = "bpm"
    const val UNIT_MMHG = "mmHg"
    const val UNIT_STEPS = "steps"
    const val UNIT_MGDL = "mg/dL"
    const val UNIT_PERCENT = "%"
}

/**
 * Shared preference keys for application settings and user preferences
 */
object PreferenceConstants {
    private const val PREF_PREFIX = "com.phrsat.healthbridge.pref"
    
    const val PREF_BIOMETRIC_ENABLED = "$PREF_PREFIX.biometric_enabled"
    const val PREF_AUTH_TOKEN = "$PREF_PREFIX.auth_token"
    const val PREF_USER_ID = "$PREF_PREFIX.user_id"
    const val PREF_SYNC_ENABLED = "$PREF_PREFIX.sync_enabled"
    const val PREF_LAST_SYNC = "$PREF_PREFIX.last_sync"
    const val PREF_NOTIFICATION_ENABLED = "$PREF_PREFIX.notification_enabled"
    const val PREF_THEME_MODE = "$PREF_PREFIX.theme_mode"
}

/**
 * Platform-specific configuration based on Android SDK version
 */
object PlatformConstants {
    val IS_AT_LEAST_ANDROID_11 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    val IS_AT_LEAST_ANDROID_12 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    
    const val MIN_SUPPORTED_SDK = Build.VERSION_CODES.O // Android 8.0
    const val TARGET_SDK = Build.VERSION_CODES.TIRAMISU // Android 13
}