package com.phrsat.healthbridge

import com.phrsat.healthbridge.utils.DateUtils
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.Timeout
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class DateUtilsTest {
    private companion object {
        private const val TEST_ISO_DATE = "2023-12-25T10:30:00.000Z"
        private const val TEST_DISPLAY_DATE = "Dec 25, 2023"
        private const val TEST_DISPLAY_DATETIME = "Dec 25, 2023 10:30"
        private const val INVALID_DATE = "2023-13-32T25:61:61.000Z"
        private const val TEST_TIMEZONE_PST = "America/Los_Angeles"
        private const val TEST_TIMEZONE_UTC = "UTC"
        private const val THREAD_COUNT = 10
        private const val TEST_TIMEOUT_MS = 5000L
    }

    @get:Rule
    val globalTimeout: Timeout = Timeout.millis(TEST_TIMEOUT_MS)

    private lateinit var testDate: Date
    private lateinit var calendar: Calendar
    private lateinit var executorService: ExecutorService
    private lateinit var threadLatch: CountDownLatch
    private lateinit var defaultTimeZone: TimeZone

    @Before
    fun setUp() {
        // Store default timezone and set UTC for consistent testing
        defaultTimeZone = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone(TEST_TIMEZONE_UTC))

        // Initialize test date
        val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        isoFormatter.timeZone = TimeZone.getTimeZone(TEST_TIMEZONE_UTC)
        testDate = isoFormatter.parse(TEST_ISO_DATE)!!
        
        calendar = Calendar.getInstance(TimeZone.getTimeZone(TEST_TIMEZONE_UTC))
        calendar.time = testDate

        // Setup thread pool and latch for concurrent testing
        executorService = Executors.newFixedThreadPool(THREAD_COUNT)
        threadLatch = CountDownLatch(THREAD_COUNT)
    }

    @Test
    fun testFormatISODate() {
        val formattedDate = DateUtils.formatISODate(testDate)
        assertEquals("ISO date format should match", TEST_ISO_DATE, formattedDate)
    }

    @Test(expected = IllegalArgumentException::class)
    fun testFormatISODateWithNull() {
        DateUtils.formatISODate(null as Date?)
    }

    @Test
    fun testParseISODate() {
        val parsedDate = DateUtils.parseISODate(TEST_ISO_DATE)
        assertNotNull("Parsed date should not be null", parsedDate)
        assertEquals("Parsed date should match original", testDate, parsedDate)
    }

    @Test
    fun testParseInvalidISODate() {
        val parsedDate = DateUtils.parseISODate(INVALID_DATE)
        assertNull("Invalid date should return null", parsedDate)
    }

    @Test
    fun testFormatDisplayDate() {
        val formattedDate = DateUtils.formatDisplayDate(testDate)
        assertEquals("Display date format should match", TEST_DISPLAY_DATE, formattedDate)
    }

    @Test
    fun testFormatDisplayDateTime() {
        val formattedDateTime = DateUtils.formatDisplayDateTime(testDate)
        assertEquals("Display datetime format should match", TEST_DISPLAY_DATETIME, formattedDateTime)
    }

    @Test
    fun testGetStartOfDay() {
        val startOfDay = DateUtils.getStartOfDay(testDate)
        calendar.time = startOfDay
        
        assertEquals("Hour should be 0", 0, calendar.get(Calendar.HOUR_OF_DAY))
        assertEquals("Minute should be 0", 0, calendar.get(Calendar.MINUTE))
        assertEquals("Second should be 0", 0, calendar.get(Calendar.SECOND))
        assertEquals("Millisecond should be 0", 0, calendar.get(Calendar.MILLISECOND))
    }

    @Test
    fun testGetEndOfDay() {
        val endOfDay = DateUtils.getEndOfDay(testDate)
        calendar.time = endOfDay
        
        assertEquals("Hour should be 23", 23, calendar.get(Calendar.HOUR_OF_DAY))
        assertEquals("Minute should be 59", 59, calendar.get(Calendar.MINUTE))
        assertEquals("Second should be 59", 59, calendar.get(Calendar.SECOND))
        assertEquals("Millisecond should be 999", 999, calendar.get(Calendar.MILLISECOND))
    }

    @Test
    fun testFormatISODateConcurrent() {
        val errorRef = AtomicReference<Throwable>()
        val results = Collections.synchronizedSet(HashSet<String>())

        repeat(THREAD_COUNT) {
            executorService.submit {
                try {
                    results.add(DateUtils.formatISODate(testDate))
                } catch (t: Throwable) {
                    errorRef.compareAndSet(null, t)
                } finally {
                    threadLatch.countDown()
                }
            }
        }

        assertTrue("Concurrent operations timed out", 
            threadLatch.await(TEST_TIMEOUT_MS, TimeUnit.MILLISECONDS))
        assertNull("No errors should occur in threads", errorRef.get())
        assertEquals("All formatted dates should be identical", 1, results.size)
        assertEquals("Formatted date should match expected", TEST_ISO_DATE, results.first())
    }

    @Test
    fun testTimezoneHandling() {
        // Test in PST timezone
        TimeZone.setDefault(TimeZone.getTimeZone(TEST_TIMEZONE_PST))
        val pstFormattedDate = DateUtils.formatDisplayDateTime(testDate)
        
        // Test in UTC timezone
        TimeZone.setDefault(TimeZone.getTimeZone(TEST_TIMEZONE_UTC))
        val utcFormattedDate = DateUtils.formatDisplayDateTime(testDate)
        
        // ISO formatting should be consistent regardless of timezone
        assertEquals("ISO date should be timezone independent",
            DateUtils.formatISODate(testDate), TEST_ISO_DATE)
        
        // Display formatting should respect system timezone
        assertNotEquals("Display datetime should differ between timezones",
            pstFormattedDate, utcFormattedDate)
    }

    @Test
    fun testParseISODateNullSafety() {
        assertNull("Null string should return null", DateUtils.parseISODate(null))
        assertNull("Empty string should return null", DateUtils.parseISODate(""))
        assertNull("Blank string should return null", DateUtils.parseISODate("   "))
    }

    @After
    fun tearDown() {
        // Restore original timezone
        TimeZone.setDefault(defaultTimeZone)
        
        // Shutdown thread pool
        executorService.shutdown()
        if (!executorService.awaitTermination(1, TimeUnit.SECONDS)) {
            executorService.shutdownNow()
        }
    }
}