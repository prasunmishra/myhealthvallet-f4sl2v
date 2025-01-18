import Foundation

// MARK: - Date Extension
extension Date {
    
    // MARK: - API Formatting
    
    /// Converts the date to ISO8601 formatted string with UTC timezone for API communication
    /// - Returns: ISO8601 formatted string in UTC timezone
    public func toISO8601String() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: self)
    }
    
    // MARK: - Day Boundary Operations
    
    /// Returns a new Date object set to the start of the current day (00:00:00)
    /// in the user's current timezone
    /// - Returns: Date representing start of the current day
    public func startOfDay() -> Date {
        let calendar = Calendar.autoupdatingCurrent
        let components = calendar.dateComponents([.year, .month, .day], from: self)
        return calendar.date(from: components) ?? self
    }
    
    /// Returns a new Date object set to the end of the current day (23:59:59.999)
    /// in the user's current timezone
    /// - Returns: Date representing end of the current day
    public func endOfDay() -> Date {
        let calendar = Calendar.autoupdatingCurrent
        var components = calendar.dateComponents([.year, .month, .day], from: self)
        components.hour = 23
        components.minute = 59
        components.second = 59
        components.nanosecond = 999_999_999
        return calendar.date(from: components) ?? self
    }
    
    // MARK: - Date Manipulation
    
    /// Returns a new Date by adding the specified number of days
    /// - Parameter days: Number of days to add (can be negative)
    /// - Returns: New date with days added
    public func addDays(_ days: Int) -> Date {
        let calendar = Calendar.autoupdatingCurrent
        let components = DateComponents(day: days)
        return calendar.date(byAdding: components, to: self) ?? self
    }
    
    /// Returns a new Date by subtracting the specified number of days
    /// - Parameter days: Number of days to subtract (can be negative)
    /// - Returns: New date with days subtracted
    public func subtractDays(_ days: Int) -> Date {
        return addDays(-days)
    }
    
    // MARK: - Formatting
    
    /// Formats the date for display using specified format string with localization
    /// - Parameter format: Date format string (e.g., "yyyy-MM-dd")
    /// - Returns: Localized formatted date string
    public func formatForDisplay(_ format: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = format
        formatter.locale = Locale.autoupdatingCurrent
        formatter.timeZone = TimeZone.autoupdatingCurrent
        return formatter.string(from: self)
    }
    
    // MARK: - Comparison
    
    /// Checks if the date is in the same day as another date
    /// - Parameter date: Date to compare with
    /// - Returns: True if dates are in the same day considering timezones
    public func isSameDay(as date: Date) -> Bool {
        let calendar = Calendar.autoupdatingCurrent
        let components1 = calendar.dateComponents([.year, .month, .day], from: self)
        let components2 = calendar.dateComponents([.year, .month, .day], from: date)
        return components1.year == components2.year &&
               components1.month == components2.month &&
               components1.day == components2.day
    }
}