import Foundation

/// Thread-safe utility class providing comprehensive date manipulation, formatting, and comparison functions
/// for handling health record timestamps, synchronization dates, and localized display formatting.
@objc public final class DateUtils: NSObject {
    
    // MARK: - Private Properties
    
    /// Thread-safe ISO8601 date formatter for API communication
    private static let iso8601Formatter = ISO8601DateFormatter()
    
    /// Thread-safe date formatter for health record display
    private static let healthDateFormatter = DateFormatter()
    
    /// Serial queue for thread-safe access to shared formatters
    private static let formatterQueue = DispatchQueue(label: "com.phrsat.dateutils.formatters")
    
    // MARK: - Public Methods
    
    /// Formats a Date object to ISO8601 string format with UTC timezone
    /// - Parameter date: The date to format
    /// - Returns: ISO8601 formatted string in UTC timezone
    @objc public static func formatISO8601(_ date: Date) -> String {
        return formatterQueue.sync {
            iso8601Formatter.timeZone = TimeZone(identifier: "UTC")
            iso8601Formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return iso8601Formatter.string(from: date)
        }
    }
    
    /// Parses an ISO8601 formatted string into a Date object
    /// - Parameter dateString: The ISO8601 formatted date string to parse
    /// - Returns: Optional Date if parsing succeeds, nil if invalid
    @objc public static func parseISO8601(_ dateString: String) -> Date? {
        guard !dateString.isEmpty else { return nil }
        
        return formatterQueue.sync {
            iso8601Formatter.timeZone = TimeZone(identifier: "UTC")
            iso8601Formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return iso8601Formatter.date(from: dateString)
        }
    }
    
    /// Formats a date for localized display in health records UI
    /// - Parameters:
    ///   - date: The date to format
    ///   - format: The desired format string
    ///   - locale: Optional locale for formatting (defaults to current)
    /// - Returns: Localized formatted date string
    @objc public static func formatHealthDate(_ date: Date, format: String, locale: Locale? = nil) -> String {
        guard !format.isEmpty else { return "" }
        
        return formatterQueue.sync {
            healthDateFormatter.dateFormat = format
            healthDateFormatter.locale = locale ?? Locale.current
            healthDateFormatter.timeZone = TimeZone.current
            return healthDateFormatter.string(from: date)
        }
    }
    
    /// Returns the start of day (00:00:00) for a given date
    /// - Parameters:
    ///   - date: The reference date
    ///   - timezone: Optional timezone (defaults to current)
    /// - Returns: Date set to start of day
    @objc public static func getStartOfDay(_ date: Date, timezone: TimeZone? = nil) -> Date {
        let calendar = Calendar.current
        let tz = timezone ?? TimeZone.current
        calendar.timeZone = tz
        
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return calendar.date(from: components) ?? date
    }
    
    /// Returns the end of day (23:59:59.999) for a given date
    /// - Parameters:
    ///   - date: The reference date
    ///   - timezone: Optional timezone (defaults to current)
    /// - Returns: Date set to end of day
    @objc public static func getEndOfDay(_ date: Date, timezone: TimeZone? = nil) -> Date {
        let calendar = Calendar.current
        let tz = timezone ?? TimeZone.current
        calendar.timeZone = tz
        
        var components = calendar.dateComponents([.year, .month, .day], from: date)
        components.hour = 23
        components.minute = 59
        components.second = 59
        components.nanosecond = 999_999_999
        
        return calendar.date(from: components) ?? date
    }
    
    /// Generates an optimized date range for specified number of days
    /// - Parameters:
    ///   - days: Number of days to include in range
    ///   - timezone: Optional timezone (defaults to current)
    /// - Returns: Optional tuple containing start and end dates
    @objc public static func dateRange(_ days: Int, timezone: TimeZone? = nil) -> (Date, Date)? {
        guard days > 0 && days <= 365 else { return nil }
        
        let calendar = Calendar.current
        let tz = timezone ?? TimeZone.current
        calendar.timeZone = tz
        
        let endDate = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -(days - 1), to: getStartOfDay(endDate, timezone: tz)) else {
            return nil
        }
        
        return (startDate, getEndOfDay(endDate, timezone: tz))
    }
}