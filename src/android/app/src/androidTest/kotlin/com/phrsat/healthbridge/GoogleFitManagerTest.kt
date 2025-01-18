package com.phrsat.healthbridge

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import com.phrsat.healthbridge.googlefit.GoogleFitDataTypes
import com.phrsat.healthbridge.googlefit.GoogleFitManager
import com.phrsat.healthbridge.logging.AuditLogger
import com.phrsat.healthbridge.models.HealthMetric
import com.phrsat.healthbridge.security.SecurityManager
import com.phrsat.healthbridge.testing.TestDataGenerator
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.*
import java.util.*
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
@LargeTest
class GoogleFitManagerTest {

    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    private lateinit var context: Context
    private lateinit var googleFitManager: GoogleFitManager
    private lateinit var securityManager: SecurityManager
    private lateinit var auditLogger: AuditLogger
    private lateinit var testDataGenerator: TestDataGenerator

    companion object {
        private const val TEST_ENCRYPTION_ALGORITHM = "AES256"
        private const val TEST_API_RATE_LIMIT = 100
        private const val TEST_SYNC_INTERVAL_MS = 900000L // 15 minutes
    }

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        securityManager = mock {
            on { isHipaaCompliant() } doReturn true
            on { encrypt(any(), eq(TEST_ENCRYPTION_ALGORITHM)) } doAnswer { invocation ->
                invocation.getArgument<String>(0)
            }
        }
        auditLogger = mock()
        testDataGenerator = TestDataGenerator()

        googleFitManager = GoogleFitManager(
            context = context,
            securityManager = securityManager,
            auditLogger = auditLogger
        )
    }

    @After
    fun cleanup() {
        // Clear any test data and verify audit logs
        verify(auditLogger, atLeastOnce()).log(any(), any())
    }

    @Test
    fun testHIPAACompliance() = runTest {
        // Test HIPAA compliance verification
        val testMetric = createTestHealthMetric()
        
        // Test with compliant security manager
        runBlocking {
            val result = googleFitManager.writeHealthMetric(testMetric)
            assertTrue("Write operation should succeed with HIPAA compliance", result)
        }

        // Test with non-compliant security manager
        whenever(securityManager.isHipaaCompliant()).thenReturn(false)
        
        runBlocking {
            val exception = assertThrows(SecurityException::class.java) {
                googleFitManager.writeHealthMetric(testMetric)
            }
            assertEquals("HIPAA compliance requirements not met", exception.message)
        }

        // Verify audit logging
        verify(auditLogger).log(contains("HIPAA compliance"), eq("WRITE"))
    }

    @Test
    fun testDataFormatValidation() = runTest {
        // Test valid data format
        val validMetric = createTestHealthMetric()
        runBlocking {
            val result = googleFitManager.writeHealthMetric(validMetric)
            assertTrue("Valid metric should be written successfully", result)
        }

        // Test invalid value
        val invalidValueMetric = validMetric.copy(value = -1.0)
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking {
                googleFitManager.writeHealthMetric(invalidValueMetric)
            }
        }

        // Test future timestamp
        val futureMetric = validMetric.copy(
            timestamp = Date(System.currentTimeMillis() + TimeUnit.DAYS.toMillis(1))
        )
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking {
                googleFitManager.writeHealthMetric(futureMetric)
            }
        }

        verify(auditLogger, atLeastOnce()).log(contains("validation"), any())
    }

    @Test
    fun testPerformanceMetrics() = runTest {
        // Test read performance
        val startTime = System.currentTimeMillis() - TimeUnit.HOURS.toMillis(24)
        val endTime = System.currentTimeMillis()

        val readStartTime = System.nanoTime()
        runBlocking {
            googleFitManager.readHealthMetrics(
                GoogleFitDataTypes.HEART_RATE_BPM,
                startTime,
                endTime
            )
        }
        val readDuration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - readStartTime)
        assertTrue("Read operation should complete within 5 seconds", readDuration < 5000)

        // Test write performance
        val writeStartTime = System.nanoTime()
        runBlocking {
            googleFitManager.writeHealthMetric(createTestHealthMetric())
        }
        val writeDuration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - writeStartTime)
        assertTrue("Write operation should complete within 3 seconds", writeDuration < 3000)

        // Test rate limiting
        repeat(TEST_API_RATE_LIMIT + 1) {
            try {
                runBlocking {
                    googleFitManager.writeHealthMetric(createTestHealthMetric())
                }
            } catch (e: SecurityException) {
                assertEquals("API rate limit exceeded", e.message)
                return@repeat
            }
        }
    }

    @Test
    fun testDataEncryption() = runTest {
        val testMetric = createTestHealthMetric()
        
        runBlocking {
            googleFitManager.writeHealthMetric(testMetric)
        }

        // Verify encryption was called
        verify(securityManager).encrypt(
            eq(testMetric.value.toString()),
            eq(TEST_ENCRYPTION_ALGORITHM)
        )

        // Verify encrypted data in read operation
        val metrics = runBlocking {
            googleFitManager.readHealthMetrics(
                GoogleFitDataTypes.HEART_RATE_BPM,
                testMetric.timestamp.time - 1000,
                testMetric.timestamp.time + 1000
            )
        }

        assertTrue("Metrics should be encrypted", 
            metrics.all { it.metadata?.get("encrypted") == true })
    }

    @Test
    fun testCacheManagement() = runTest {
        val testMetric = createTestHealthMetric()
        val startTime = testMetric.timestamp.time - 1000
        val endTime = testMetric.timestamp.time + 1000

        // First read should hit the API
        runBlocking {
            googleFitManager.readHealthMetrics(
                GoogleFitDataTypes.HEART_RATE_BPM,
                startTime,
                endTime
            )
        }

        // Second read within sync interval should use cache
        val cacheStartTime = System.nanoTime()
        runBlocking {
            googleFitManager.readHealthMetrics(
                GoogleFitDataTypes.HEART_RATE_BPM,
                startTime,
                endTime
            )
        }
        val cacheDuration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - cacheStartTime)
        assertTrue("Cache read should be fast", cacheDuration < 100)

        // Write operation should invalidate cache
        runBlocking {
            googleFitManager.writeHealthMetric(testMetric)
        }

        // Verify cache invalidation log
        verify(auditLogger).log(contains("Cache"), any())
    }

    private fun createTestHealthMetric(): HealthMetric {
        return HealthMetric(
            id = UUID.randomUUID().toString(),
            type = "heart_rate",
            value = 75.0,
            unit = "bpm",
            timestamp = Date(System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(5)),
            source = "test",
            metadata = mapOf("test" to true)
        )
    }
}