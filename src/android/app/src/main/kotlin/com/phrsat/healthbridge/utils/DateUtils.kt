package com.phrsat.healthbridge.utils

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Calendar
import java.util.TimeZone
import java.util.Locale
import java.util.concurrent.locks.ReentrantLock
import android.util.Log

/**
 * Thread-safe utility object providing comprehensive date manipulation, formatting,
 * and comparison functions for handling health records and metrics timestamps.
 * 
 * Ensures consistent date handling across the application with proper timezone management
 * and robust error handling. All operations are thread-safe through synchronization.
 *
 * @version 1.0
 */
object DateUtils {
    private const val TAG = "DateUtils"
    private const val ISO_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
    private const val DISPLAY_DATE_FORMAT = "MMM dd, yyyy"
    private const val DISPLAY_DATETIME_FORMAT = "MMM dd, yyyy HH:mm"

    private val isoDateFormatterLock = ReentrantLock()
    private val displayDateFormatterLock = ReentrantLock()
    private val displayDateTimeFormatterLock = ReentrantLock()

    private val isoDateFormatter = SimpleDateFormat(ISO_DATE_FORMAT, Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private val displayDateFormatter = SimpleDateFormat(DISPLAY_DATE_FORMAT, Locale.US)
    private val displayDateTimeFormatter = SimpleDateFormat(DISPLAY_DATETIME_FORMAT, Locale.US)

    /**
     * Converts a Date object to ISO8601 formatted string in UTC timezone.
     *
     * @param date The Date object to format
     * @return ISO8601 formatted date string
     * @throws IllegalArgumentException if the date is null or formatting fails
     */
    @JvmStatic
    @Throws(IllegalArgumentException::class)
    fun formatISODate(date: Date): String {
        requireNotNull(date) { "Date parameter cannot be null" }
        
        isoDateFormatterLock.lock()
        try {
            return isoDateFormatter.format(date).also {
                require(it.matches(Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"))) {
                    "Generated date string does not match ISO8601 format"
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error formatting date to ISO8601", e)
            throw IllegalArgumentException("Failed to format date to ISO8601", e)
        } finally {
            isoDateFormatterLock.unlock()
        }
    }

    /**
     * Parses an ISO8601 formatted string to Date object.
     *
     * @param dateString The ISO8601 formatted date string
     * @return Date object if parsing succeeds, null otherwise
     */
    @JvmStatic
    fun parseISODate(dateString: String): Date? {
        if (!dateString.matches(Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"))) {
            Log.w(TAG, "Invalid ISO8601 date format: $dateString")
            return null
        }

        isoDateFormatterLock.lock()
        try {
            return isoDateFormatter.parse(dateString)
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing ISO8601 date: $dateString", e)
            return null
        } finally {
            isoDateFormatterLock.unlock()
        }
    }

    /**
     * Formats a date for user-friendly display without time.
     *
     * @param date The Date object to format
     * @return Formatted date string in user's locale
     * @throws IllegalArgumentException if the date is null
     */
    @JvmStatic
    @Throws(IllegalArgumentException::class)
    fun formatDisplayDate(date: Date): String {
        requireNotNull(date) { "Date parameter cannot be null" }

        displayDateFormatterLock.lock()
        try {
            return displayDateFormatter.format(date)
        } catch (e: Exception) {
            Log.e(TAG, "Error formatting display date", e)
            throw IllegalArgumentException("Failed to format display date", e)
        } finally {
            displayDateFormatterLock.unlock()
        }
    }

    /**
     * Formats a date with time for user-friendly display.
     *
     * @param date The Date object to format
     * @return Formatted date and time string in user's locale
     * @throws IllegalArgumentException if the date is null
     */
    @JvmStatic
    @Throws(IllegalArgumentException::class)
    fun formatDisplayDateTime(date: Date): String {
        requireNotNull(date) { "Date parameter cannot be null" }

        displayDateTimeFormatterLock.lock()
        try {
            return displayDateTimeFormatter.format(date)
        } catch (e: Exception) {
            Log.e(TAG, "Error formatting display datetime", e)
            throw IllegalArgumentException("Failed to format display datetime", e)
        } finally {
            displayDateTimeFormatterLock.unlock()
        }
    }

    /**
     * Returns the start of day (00:00:00.000) for a given date in the user's timezone.
     *
     * @param date The Date object to modify
     * @return Date object set to start of day
     * @throws IllegalArgumentException if the date is null
     */
    @JvmStatic
    @Throws(IllegalArgumentException::class)
    fun getStartOfDay(date: Date): Date {
        requireNotNull(date) { "Date parameter cannot be null" }

        return Calendar.getInstance().apply {
            time = date
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.time
    }

    /**
     * Returns the end of day (23:59:59.999) for a given date in the user's timezone.
     *
     * @param date The Date object to modify
     * @return Date object set to end of day
     * @throws IllegalArgumentException if the date is null
     */
    @JvmStatic
    @Throws(IllegalArgumentException::class)
    fun getEndOfDay(date: Date): Date {
        requireNotNull(date) { "Date parameter cannot be null" }

        return Calendar.getInstance().apply {
            time = date
            set(Calendar.HOUR_OF_DAY, 23)
            set(Calendar.MINUTE, 59)
            set(Calendar.SECOND, 59)
            set(Calendar.MILLISECOND, 999)
        }.time
    }
}