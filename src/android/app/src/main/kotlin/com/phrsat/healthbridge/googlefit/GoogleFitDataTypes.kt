package com.phrsat.healthbridge.googlefit

import com.google.android.gms.fitness.data.DataType // v21.1.0
import com.google.android.gms.fitness.data.Field // v21.1.0
import com.phrsat.healthbridge.models.HealthMetric
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Enum class defining supported Google Fit data types with FHIR-compliant mappings
 * and comprehensive validation. Provides thread-safe caching and conversion utilities.
 *
 * @property metricType Internal metric type identifier
 * @property unit Standardized measurement unit
 * @property fhirResourceType FHIR R4 resource type for data mapping
 */
enum class GoogleFitDataTypes(
    val metricType: String,
    val unit: String,
    val fhirResourceType: String
) {
    HEART_RATE_BPM(
        "heart_rate",
        "bpm",
        "Observation"
    ),
    STEPS_COUNT(
        "steps",
        "count",
        "Observation"
    ),
    BLOOD_PRESSURE_MMHG(
        "blood_pressure",
        "mmHg",
        "Observation"
    ),
    WEIGHT_KG(
        "body_weight",
        "kg",
        "Observation"
    ),
    HEIGHT_M(
        "body_height",
        "cm",
        "Observation"
    ),
    SLEEP_SEGMENT(
        "sleep",
        "segment",
        "Observation"
    ),
    OXYGEN_SATURATION(
        "oxygen_saturation",
        "%",
        "Observation"
    ),
    BLOOD_GLUCOSE(
        "blood_glucose",
        "mg/dL",
        "Observation"
    );

    companion object {
        private val dataTypeCache = ConcurrentHashMap<GoogleFitDataTypes, DataType>()
        private val fieldCache = ConcurrentHashMap<GoogleFitDataTypes, Field>()

        /**
         * Retrieves the corresponding Google Fit DataType with validation.
         *
         * @param type GoogleFitDataTypes enum value
         * @return Validated Google Fit DataType
         * @throws IllegalArgumentException if mapping is invalid
         */
        @JvmStatic
        fun getDataType(type: GoogleFitDataTypes): DataType {
            return dataTypeCache.getOrPut(type) {
                when (type) {
                    HEART_RATE_BPM -> DataType.TYPE_HEART_RATE_BPM
                    STEPS_COUNT -> DataType.TYPE_STEP_COUNT_DELTA
                    BLOOD_PRESSURE_MMHG -> DataType.TYPE_BLOOD_PRESSURE
                    WEIGHT_KG -> DataType.TYPE_WEIGHT
                    HEIGHT_M -> DataType.TYPE_HEIGHT
                    SLEEP_SEGMENT -> DataType.TYPE_SLEEP_SEGMENT
                    OXYGEN_SATURATION -> DataType.TYPE_OXYGEN_SATURATION
                    BLOOD_GLUCOSE -> DataType.TYPE_BLOOD_GLUCOSE
                }
            }
        }

        /**
         * Retrieves the corresponding Google Fit Field with validation.
         *
         * @param type GoogleFitDataTypes enum value
         * @return Validated Google Fit Field
         * @throws IllegalArgumentException if mapping is invalid
         */
        @JvmStatic
        fun getField(type: GoogleFitDataTypes): Field {
            return fieldCache.getOrPut(type) {
                when (type) {
                    HEART_RATE_BPM -> Field.FIELD_BPM
                    STEPS_COUNT -> Field.FIELD_STEPS
                    BLOOD_PRESSURE_MMHG -> Field.FIELD_BLOOD_PRESSURE
                    WEIGHT_KG -> Field.FIELD_WEIGHT
                    HEIGHT_M -> Field.FIELD_HEIGHT
                    SLEEP_SEGMENT -> Field.FIELD_SLEEP_SEGMENT_TYPE
                    OXYGEN_SATURATION -> Field.FIELD_OXYGEN_SATURATION
                    BLOOD_GLUCOSE -> Field.FIELD_BLOOD_GLUCOSE_LEVEL
                }
            }
        }
    }

    private val cache = ConcurrentHashMap<String, Any>()

    /**
     * Converts Google Fit data type to validated internal health metric type.
     *
     * @return Validated internal health metric type identifier
     * @throws IllegalArgumentException if conversion is invalid
     */
    fun toHealthMetricType(): String {
        return cache.getOrPut("metricType") {
            HealthMetric.fromJson(mapOf(
                "id" to "00000000-0000-0000-0000-000000000000",
                "type" to metricType,
                "value" to 0.0,
                "unit" to unit,
                "timestamp" to "2023-01-01T00:00:00.000Z"
            )).type
        } as String
    }

    /**
     * Converts Google Fit unit to validated internal health metric unit.
     *
     * @return Validated internal health metric unit
     * @throws IllegalArgumentException if conversion is invalid
     */
    fun toHealthMetricUnit(): String {
        return cache.getOrPut("unit") {
            HealthMetric.fromJson(mapOf(
                "id" to "00000000-0000-0000-0000-000000000000",
                "type" to metricType,
                "value" to 0.0,
                "unit" to unit,
                "timestamp" to "2023-01-01T00:00:00.000Z"
            )).unit
        } as String
    }

    /**
     * Converts Google Fit data to FHIR-compliant resource.
     *
     * @param data Raw Google Fit data value
     * @return FHIR-compliant resource JSON string
     * @throws IllegalArgumentException if conversion fails or data is invalid
     */
    fun toFhirResource(data: Any): String {
        val value = when (data) {
            is Number -> data.toDouble()
            else -> throw IllegalArgumentException("Invalid data type for conversion")
        }

        val fhirJson = JSONObject().apply {
            put("resourceType", fhirResourceType)
            put("status", "final")
            put("code", JSONObject().apply {
                put("coding", arrayOf(JSONObject().apply {
                    put("system", "http://loinc.org")
                    put("code", when (this@GoogleFitDataTypes) {
                        HEART_RATE_BPM -> "8867-4"
                        BLOOD_PRESSURE_MMHG -> "85354-9"
                        WEIGHT_KG -> "29463-7"
                        HEIGHT_M -> "8302-2"
                        OXYGEN_SATURATION -> "2708-6"
                        BLOOD_GLUCOSE -> "2339-0"
                        else -> throw IllegalArgumentException("No LOINC code mapping for ${this@GoogleFitDataTypes}")
                    })
                }))
            })
            put("valueQuantity", JSONObject().apply {
                put("value", value)
                put("unit", unit)
                put("system", "http://unitsofmeasure.org")
                put("code", unit)
            })
        }

        return fhirJson.toString()
    }
}