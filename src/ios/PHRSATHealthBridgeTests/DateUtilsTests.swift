import XCTest
import Foundation
@testable import PHRSATHealthBridge

/// Comprehensive test suite for DateUtils class focusing on thread-safety, HIPAA compliance,
/// and timezone handling for the PHRSAT iOS application
class DateUtilsTests: XCTestCase {
    
    // MARK: - Properties
    
    private var testDate: Date!
    private var testDateString: String!
    private var testTimeZones: [TimeZone]!
    private var testLocales: [Locale]!
    private let concurrentQueue = DispatchQueue(label: "com.phrsat.tests.concurrent",
                                              attributes: .concurrent)
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        
        // Initialize test date with known value
        testDateString = "2023-01-01T12:00:00Z"
        testDate = DateUtils.parseISO8601(testDateString)
        XCTAssertNotNil(testDate, "Test date initialization failed")
        
        // Configure test timezones
        testTimeZones = [
            TimeZone(identifier: "UTC")!,
            TimeZone(identifier: "America/New_York")!,
            TimeZone(identifier: "Asia/Tokyo")!
        ]
        
        // Set up test locales
        testLocales = [
            Locale(identifier: "en_US"),
            Locale(identifier: "fr_FR"),
            Locale(identifier: "ja_JP")
        ]
    }
    
    override func tearDown() {
        testDate = nil
        testDateString = nil
        testTimeZones = nil
        testLocales = nil
        super.tearDown()
    }
    
    // MARK: - ISO8601 Formatting Tests
    
    func testFormatISO8601_ThreadSafety() {
        let iterations = 1000
        let expectation = XCTestExpectation(description: "Concurrent ISO8601 formatting")
        var results = [String](repeating: "", count: iterations)
        
        // Test concurrent access
        for i in 0..<iterations {
            concurrentQueue.async {
                let result = DateUtils.formatISO8601(self.testDate)
                results[i] = result
                
                if i == iterations - 1 {
                    expectation.fulfill()
                }
            }
        }
        
        wait(for: [expectation], timeout: 5.0)
        
        // Verify consistency
        let uniqueResults = Set(results)
        XCTAssertEqual(uniqueResults.count, 1, "Thread-safety violation: inconsistent formatting results")
        XCTAssertEqual(uniqueResults.first, testDateString, "Incorrect ISO8601 formatting")
    }
    
    func testFormatISO8601_Timezones() {
        for timezone in testTimeZones {
            let date = Date()
            let formatted = DateUtils.formatISO8601(date)
            
            // Verify UTC output regardless of input timezone
            XCTAssertTrue(formatted.hasSuffix("Z"), "ISO8601 format must use UTC timezone")
            
            // Verify millisecond precision for HIPAA compliance
            XCTAssertTrue(formatted.contains("."), "Missing millisecond precision for HIPAA compliance")
        }
    }
    
    // MARK: - ISO8601 Parsing Tests
    
    func testParseISO8601_EdgeCases() {
        // Test empty string
        XCTAssertNil(DateUtils.parseISO8601(""), "Empty string should return nil")
        
        // Test invalid format
        XCTAssertNil(DateUtils.parseISO8601("invalid-date"), "Invalid format should return nil")
        
        // Test various ISO8601 formats
        let testCases = [
            "2023-01-01T12:00:00Z",
            "2023-01-01T12:00:00.000Z",
            "2023-01-01T12:00:00+00:00"
        ]
        
        for testCase in testCases {
            XCTAssertNotNil(DateUtils.parseISO8601(testCase), "Failed to parse valid ISO8601 format: \(testCase)")
        }
    }
    
    // MARK: - Health Date Formatting Tests
    
    func testFormatHealthDate_Locales() {
        let formats = ["yyyy-MM-dd", "MM/dd/yyyy", "dd/MM/yyyy"]
        
        for locale in testLocales {
            for format in formats {
                let formatted = DateUtils.formatHealthDate(testDate, format: format, locale: locale)
                XCTAssertFalse(formatted.isEmpty, "Formatting failed for locale: \(locale.identifier)")
                
                // Verify format length matches expected
                let expectedLength = format.replacingOccurrences(of: "yyyy", with: "2023")
                    .replacingOccurrences(of: "MM", with: "01")
                    .replacingOccurrences(of: "dd", with: "01")
                XCTAssertEqual(formatted.count, expectedLength.count, "Incorrect format length for locale: \(locale.identifier)")
            }
        }
    }
    
    // MARK: - Day Boundary Tests
    
    func testGetStartOfDay_DST() {
        for timezone in testTimeZones {
            let startOfDay = DateUtils.getStartOfDay(testDate, timezone: timezone)
            let calendar = Calendar.current
            calendar.timeZone = timezone
            
            let components = calendar.dateComponents([.hour, .minute, .second, .nanosecond], from: startOfDay)
            
            XCTAssertEqual(components.hour, 0, "Start of day hour must be 0")
            XCTAssertEqual(components.minute, 0, "Start of day minute must be 0")
            XCTAssertEqual(components.second, 0, "Start of day second must be 0")
            XCTAssertEqual(components.nanosecond, 0, "Start of day nanosecond must be 0")
        }
    }
    
    func testGetEndOfDay_DST() {
        for timezone in testTimeZones {
            let endOfDay = DateUtils.getEndOfDay(testDate, timezone: timezone)
            let calendar = Calendar.current
            calendar.timeZone = timezone
            
            let components = calendar.dateComponents([.hour, .minute, .second, .nanosecond], from: endOfDay)
            
            XCTAssertEqual(components.hour, 23, "End of day hour must be 23")
            XCTAssertEqual(components.minute, 59, "End of day minute must be 59")
            XCTAssertEqual(components.second, 59, "End of day second must be 59")
            XCTAssertEqual(components.nanosecond, 999_999_999, "End of day nanosecond must be 999,999,999")
        }
    }
    
    // MARK: - Date Range Tests
    
    func testDateRange_HIPAA() {
        for timezone in testTimeZones {
            // Test valid range
            if let (startDate, endDate) = DateUtils.dateRange(30, timezone: timezone) {
                // Verify range boundaries
                XCTAssertEqual(DateUtils.getStartOfDay(startDate, timezone: timezone), startDate,
                             "Start date must be at day boundary")
                XCTAssertEqual(DateUtils.getEndOfDay(endDate, timezone: timezone), endDate,
                             "End date must be at day boundary")
                
                // Verify HIPAA-compliant precision
                let startString = DateUtils.formatISO8601(startDate)
                let endString = DateUtils.formatISO8601(endDate)
                XCTAssertTrue(startString.contains("."), "Start date missing millisecond precision")
                XCTAssertTrue(endString.contains("."), "End date missing millisecond precision")
            } else {
                XCTFail("Failed to generate valid date range")
            }
        }
        
        // Test invalid ranges
        XCTAssertNil(DateUtils.dateRange(0), "Zero days should return nil")
        XCTAssertNil(DateUtils.dateRange(366), "More than 365 days should return nil")
    }
    
    func testDateRange_Performance() {
        measure {
            for _ in 0..<100 {
                _ = DateUtils.dateRange(30)
            }
        }
    }
}