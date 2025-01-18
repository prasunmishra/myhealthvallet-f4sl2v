package com.phrsat.healthbridge

import com.phrsat.healthbridge.models.HealthMetric
import com.phrsat.healthbridge.utils.DateUtils
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.Timeout
import java.util.*
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class HealthMetricTest {
    @get:Rule
    val timeout = Timeout(TIMEOUT_MS, TimeUnit.MILLISECONDS)

    private companion object {
        private const val TEST_ID = "123e4567-e89b-12d3-a456-426614174000"
        private const val TEST_TYPE = "heart_rate"
        private const val TEST_VALUE = 75.0
        private const val TEST_UNIT = "bpm"
        private const val TIMEOUT_MS = 5000L
        private const val CONCURRENT_THREADS = 10
    }

    private lateinit var testTimestamp: Date
    private lateinit var testMetadata: Map<String, Any>
    private lateinit var testHealthMetric: HealthMetric

    @Before
    fun setup() {
        testTimestamp = Date()
        testMetadata = mapOf(
            "device_id" to "test_device_123",
            "measurement_method" to "automatic",
            "fhir_coding" to mapOf(
                "system" to "http://loinc.org",
                "code" to "8867-4",
                "display" to "Heart rate"
            )
        )
        testHealthMetric = HealthMetric(
            id = TEST_ID,
            type = TEST_TYPE,
            value = TEST_VALUE,
            unit = TEST_UNIT,
            timestamp = testTimestamp,
            source = "test_device",
            metadata = testMetadata
        )
    }

    @Test
    fun testHealthMetricCreation() {
        assertNotNull("HealthMetric should be created successfully", testHealthMetric)
        assertEquals("ID should match", TEST_ID, testHealthMetric.id)
        assertEquals("Type should match", TEST_TYPE, testHealthMetric.type)
        assertEquals("Value should match", TEST_VALUE, testHealthMetric.value, 0.001)
        assertEquals("Unit should match", TEST_UNIT, testHealthMetric.unit)
        assertEquals("Timestamp should match", testTimestamp, testHealthMetric.timestamp)
        assertEquals("Source should match", "test_device", testHealthMetric.source)
        assertEquals("Metadata should match", testMetadata, testHealthMetric.metadata)
    }

    @Test(expected = IllegalArgumentException::class)
    fun testInvalidMetricType() {
        HealthMetric(
            id = TEST_ID,
            type = "invalid_type",
            value = TEST_VALUE,
            unit = TEST_UNIT,
            timestamp = testTimestamp
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun testInvalidUnit() {
        HealthMetric(
            id = TEST_ID,
            type = TEST_TYPE,
            value = TEST_VALUE,
            unit = "invalid_unit",
            timestamp = testTimestamp
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun testInvalidValue() {
        HealthMetric(
            id = TEST_ID,
            type = TEST_TYPE,
            value = -1.0,
            unit = TEST_UNIT,
            timestamp = testTimestamp
        )
    }

    @Test
    fun testFHIRCompliance() {
        val json = testHealthMetric.toJson()
        
        // Verify FHIR required fields
        assertTrue("Missing FHIR coding", 
            (testHealthMetric.metadata?.get("fhir_coding") as? Map<*, *>)?.containsKey("system") == true)
        assertTrue("Missing FHIR code",
            (testHealthMetric.metadata?.get("fhir_coding") as? Map<*, *>)?.containsKey("code") == true)
        
        // Verify ISO8601 timestamp format
        val timestampStr = json["timestamp"] as String
        assertNotNull("Timestamp should be parsed successfully", DateUtils.parseISODate(timestampStr))
        
        // Verify value constraints
        assertTrue("Value should be within FHIR constraints", testHealthMetric.value in 30.0..220.0)
    }

    @Test
    fun testJsonSerialization() {
        val json = testHealthMetric.toJson()
        val recreatedMetric = HealthMetric.fromJson(json)
        
        assertEquals("Serialization should preserve ID", testHealthMetric.id, recreatedMetric.id)
        assertEquals("Serialization should preserve type", testHealthMetric.type, recreatedMetric.type)
        assertEquals("Serialization should preserve value", testHealthMetric.value, recreatedMetric.value, 0.001)
        assertEquals("Serialization should preserve unit", testHealthMetric.unit, recreatedMetric.unit)
        assertEquals("Serialization should preserve timestamp", 
            DateUtils.formatISODate(testHealthMetric.timestamp),
            DateUtils.formatISODate(recreatedMetric.timestamp))
    }

    @Test
    fun testConcurrentAccess() {
        val threadCount = CONCURRENT_THREADS
        val latch = CountDownLatch(threadCount)
        val executor = Executors.newFixedThreadPool(threadCount)
        val errors = Collections.synchronizedList(mutableListOf<Exception>())

        // Create concurrent readers and writers
        repeat(threadCount) {
            executor.submit {
                try {
                    // Test concurrent JSON operations
                    val json = testHealthMetric.toJson()
                    val recreated = HealthMetric.fromJson(json)
                    assertEquals(testHealthMetric.id, recreated.id)

                    // Test concurrent date formatting
                    val formattedDate = DateUtils.formatISODate(testHealthMetric.timestamp)
                    assertNotNull(DateUtils.parseISODate(formattedDate))
                } catch (e: Exception) {
                    errors.add(e)
                } finally {
                    latch.countDown()
                }
            }
        }

        assertTrue("Concurrent operations should complete within timeout",
            latch.await(TIMEOUT_MS, TimeUnit.MILLISECONDS))
        assertTrue("No errors should occur during concurrent access: ${errors.firstOrNull()?.message}",
            errors.isEmpty())
    }

    @Test
    fun testMetadataImmutability() {
        val mutableMetadata = mutableMapOf(
            "key" to "value"
        )
        val metric = HealthMetric(
            id = TEST_ID,
            type = TEST_TYPE,
            value = TEST_VALUE,
            unit = TEST_UNIT,
            timestamp = testTimestamp,
            metadata = mutableMetadata
        )

        // Attempt to modify original map
        mutableMetadata["new_key"] = "new_value"

        // Verify metric's metadata remains unchanged
        assertFalse("Metadata should be immutable",
            metric.metadata?.containsKey("new_key") ?: false)
    }

    @Test
    fun testTimestampValidation() {
        val futureDate = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1)
        }.time

        assertThrows(IllegalArgumentException::class.java) {
            HealthMetric(
                id = TEST_ID,
                type = TEST_TYPE,
                value = TEST_VALUE,
                unit = TEST_UNIT,
                timestamp = futureDate
            )
        }
    }
}