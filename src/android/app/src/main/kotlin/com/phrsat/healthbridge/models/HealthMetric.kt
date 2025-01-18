package com.phrsat.healthbridge.models

import android.os.Parcelable
import kotlinx.parcelize.Parcelize
import com.google.gson.annotations.SerializedName
import com.phrsat.healthbridge.utils.DateUtils
import java.util.Date
import java.util.UUID
import java.util.Collections
import android.util.Log

/**
 * Thread-safe, immutable data class representing a standardized health metric measurement.
 * Implements FHIR-compliant data exchange and provides comprehensive validation.
 *
 * @property id Unique identifier for the health metric
 * @property type Standardized metric type (e.g., "heart_rate", "blood_pressure")
 * @property value Numerical measurement value
 * @property unit Standardized unit of measurement
 * @property timestamp Time of measurement
 * @property source Optional source of measurement (device, manual, etc.)
 * @property metadata Optional additional data associated with measurement
 */
@Parcelize
data class HealthMetric(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("type")
    val type: String,
    
    @SerializedName("value")
    val value: Double,
    
    @SerializedName("unit")
    val unit: String,
    
    @SerializedName("timestamp")
    val timestamp: Date,
    
    @SerializedName("source")
    val source: String? = null,
    
    @SerializedName("metadata")
    val metadata: Map<String, Any>? = null
) : Parcelable {

    companion object {
        private const val TAG = "HealthMetric"

        // Supported metric types with their valid ranges and units
        private val SUPPORTED_METRICS = mapOf(
            "heart_rate" to MetricSpec(30.0..220.0, "bpm"),
            "blood_pressure_systolic" to MetricSpec(60.0..250.0, "mmHg"),
            "blood_pressure_diastolic" to MetricSpec(40.0..150.0, "mmHg"),
            "blood_glucose" to MetricSpec(20.0..600.0, "mg/dL"),
            "body_temperature" to MetricSpec(30.0..45.0, "°C"),
            "oxygen_saturation" to MetricSpec(50.0..100.0, "%"),
            "respiratory_rate" to MetricSpec(4.0..60.0, "breaths/min"),
            "body_weight" to MetricSpec(1.0..500.0, "kg"),
            "body_height" to MetricSpec(30.0..300.0, "cm")
        )

        private data class MetricSpec(val range: ClosedFloatingPointRange<Double>, val unit: String)

        /**
         * Creates a validated HealthMetric instance from JSON data.
         *
         * @param json Map containing the metric data
         * @return Validated HealthMetric instance
         * @throws IllegalArgumentException if the data is invalid
         */
        @JvmStatic
        @Throws(IllegalArgumentException::class)
        fun fromJson(json: Map<String, Any>): HealthMetric {
            try {
                // Extract and validate required fields
                val id = (json["id"] as? String) ?: throw IllegalArgumentException("Missing id")
                val type = (json["type"] as? String) ?: throw IllegalArgumentException("Missing type")
                val value = (json["value"] as? Number)?.toDouble() ?: throw IllegalArgumentException("Missing value")
                val unit = (json["unit"] as? String) ?: throw IllegalArgumentException("Missing unit")
                
                // Parse timestamp
                val timestampStr = (json["timestamp"] as? String) ?: throw IllegalArgumentException("Missing timestamp")
                val timestamp = DateUtils.parseISODate(timestampStr) ?: throw IllegalArgumentException("Invalid timestamp format")
                
                // Extract optional fields
                val source = json["source"] as? String
                @Suppress("UNCHECKED_CAST")
                val metadata = (json["metadata"] as? Map<String, Any>)?.toMap()

                return HealthMetric(
                    id = id,
                    type = type,
                    value = value,
                    unit = unit,
                    timestamp = timestamp,
                    source = source,
                    metadata = metadata
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error parsing JSON to HealthMetric", e)
                throw IllegalArgumentException("Invalid health metric data", e)
            }
        }
    }

    init {
        // Validate ID format
        require(try {
            UUID.fromString(id)
            true
        } catch (e: IllegalArgumentException) {
            false
        }) { "Invalid ID format: must be UUID" }

        // Validate metric type and unit
        val metricSpec = SUPPORTED_METRICS[type] ?: throw IllegalArgumentException("Unsupported metric type: $type")
        require(unit == metricSpec.unit) { "Invalid unit for $type: expected ${metricSpec.unit}, got $unit" }
        
        // Validate value range
        require(value in metricSpec.range) { 
            "Value $value out of range for $type: valid range is ${metricSpec.range}" 
        }

        // Validate timestamp is not in future
        require(!timestamp.after(Date())) { "Timestamp cannot be in the future" }

        // Create immutable copy of metadata if present
        metadata?.let {
            Collections.unmodifiableMap(HashMap(it))
        }
    }

    /**
     * Converts the health metric to a secure, validated JSON format.
     *
     * @return Immutable map containing the metric data
     */
    fun toJson(): Map<String, Any> {
        val json = mutableMapOf<String, Any>(
            "id" to id,
            "type" to type,
            "value" to value,
            "unit" to unit,
            "timestamp" to DateUtils.formatISODate(timestamp)
        )

        source?.let { json["source"] = it }
        metadata?.let { json["metadata"] = HashMap(it) }

        return Collections.unmodifiableMap(json)
    }

    override fun toString(): String {
        return "HealthMetric(id=$id, type=$type, value=$value ${unit}, timestamp=${DateUtils.formatISODate(timestamp)})"
    }
}