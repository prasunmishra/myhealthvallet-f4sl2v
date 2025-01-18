import XCTest // Latest
import HealthKit // Latest
@testable import PHRSATHealthBridge

/// Comprehensive test suite for HealthKitManager validating all core functionality
class HealthKitManagerTests: XCTestCase {
    // MARK: - Properties
    
    private var sut: HealthKitManager!
    private var asyncExpectation: XCTestExpectation!
    private let defaultTimeout: TimeInterval = 5.0
    private var testMetricTypes: [HealthMetricType]!
    private var testDateRange: DateInterval!
    
    // MARK: - Test Lifecycle
    
    override func setUp() {
        super.setUp()
        sut = HealthKitManager.shared
        asyncExpectation = expectation(description: "Async operation")
        testMetricTypes = Array(HealthMetricType.allCases)
        
        // Set up date range for last 7 days
        let endDate = Date()
        let startDate = Calendar.current.date(byAdding: .day, value: -7, to: endDate)!
        testDateRange = DateInterval(start: startDate, end: endDate)
    }
    
    override func tearDown() {
        // Reset HealthKit authorization state
        if let healthStore = sut?.value(forKey: "healthStore") as? HKHealthStore {
            // Clear any mock data
            for type in testMetricTypes {
                if case .success(let quantityType) = type.quantityType() {
                    try? healthStore.deleteObjects(of: quantityType, predicate: nil)
                }
            }
        }
        
        sut = nil
        asyncExpectation = nil
        testMetricTypes = nil
        testDateRange = nil
        super.tearDown()
    }
    
    // MARK: - HealthKit Setup Tests
    
    func testHealthKitSetup() {
        // Test successful setup
        sut.setupHealthKit { result in
            switch result {
            case .success(let success):
                XCTAssertTrue(success, "HealthKit setup should succeed")
            case .failure(let error):
                XCTFail("HealthKit setup failed with error: \(error)")
            }
            self.asyncExpectation.fulfill()
        }
        
        wait(for: [asyncExpectation], timeout: defaultTimeout)
        
        // Test setup with denied permissions
        asyncExpectation = expectation(description: "Permission denied")
        
        // Simulate denied permissions
        if let authManager = sut.value(forKey: "authManager") as? HealthKitAuthorizationManager {
            // Mock denied state
            authManager.setValue(false, forKey: "permissionsGranted")
        }
        
        sut.setupHealthKit { result in
            if case .failure(let error) = result {
                XCTAssertEqual(error, .authorizationDenied, "Should fail with authorization denied")
            } else {
                XCTFail("Should not succeed with denied permissions")
            }
            self.asyncExpectation.fulfill()
        }
        
        wait(for: [asyncExpectation], timeout: defaultTimeout)
    }
    
    // MARK: - Health Data Fetch Tests
    
    func testFetchHealthData() {
        // Test successful data fetch
        for type in testMetricTypes {
            asyncExpectation = expectation(description: "Fetch \(type)")
            
            sut.fetchHealthData(type: type,
                              startDate: testDateRange.start,
                              endDate: testDateRange.end) { result in
                switch result {
                case .success(let metrics):
                    XCTAssertNotNil(metrics, "Should return metrics array")
                    
                    // Validate metric properties
                    for metric in metrics {
                        XCTAssertTrue(type.validRange.contains(metric.value),
                                    "Metric value should be within valid range")
                        XCTAssertTrue(self.testDateRange.contains(metric.timestamp),
                                    "Metric timestamp should be within test range")
                        XCTAssertTrue(type.supportedUnits.contains(HKUnit(from: metric.unit)!),
                                    "Metric unit should be supported")
                    }
                    
                case .failure(let error):
                    XCTFail("Health data fetch failed for \(type): \(error)")
                }
                self.asyncExpectation.fulfill()
            }
            
            wait(for: [asyncExpectation], timeout: defaultTimeout)
        }
        
        // Test invalid date range
        asyncExpectation = expectation(description: "Invalid date range")
        
        sut.fetchHealthData(type: .heartRate,
                          startDate: testDateRange.end,
                          endDate: testDateRange.start) { result in
            if case .failure(let error) = result {
                XCTAssertNotNil(error, "Should fail with invalid date range")
            } else {
                XCTFail("Should not succeed with invalid date range")
            }
            self.asyncExpectation.fulfill()
        }
        
        wait(for: [asyncExpectation], timeout: defaultTimeout)
    }
    
    // MARK: - Health Data Observation Tests
    
    func testObserveHealthData() {
        // Test successful observation
        for type in testMetricTypes {
            asyncExpectation = expectation(description: "Observe \(type)")
            asyncExpectation.expectedFulfillmentCount = 2 // Initial + Update
            
            sut.observeHealthData(type: type) { result in
                switch result {
                case .success(let metrics):
                    XCTAssertNotNil(metrics, "Should receive metrics updates")
                    
                    // Validate received metrics
                    for metric in metrics {
                        XCTAssertTrue(type.validRange.contains(metric.value),
                                    "Updated metric value should be within valid range")
                        XCTAssertTrue(metric.timestamp <= Date(),
                                    "Updated metric timestamp should not be in future")
                    }
                    
                case .failure(let error):
                    XCTFail("Health data observation failed for \(type): \(error)")
                }
                self.asyncExpectation.fulfill()
            }
            
            // Simulate new data
            if case .success(let quantityType) = type.quantityType() {
                let sample = HKQuantitySample(type: quantityType,
                                            quantity: HKQuantity(unit: type.defaultUnit,
                                                              doubleValue: type.validRange.lowerBound + 1),
                                            start: Date(),
                                            end: Date())
                
                if let healthStore = sut.value(forKey: "healthStore") as? HKHealthStore {
                    healthStore.save(sample) { success, error in
                        XCTAssertTrue(success, "Sample save should succeed")
                        XCTAssertNil(error, "Sample save should not error")
                    }
                }
            }
            
            wait(for: [asyncExpectation], timeout: defaultTimeout * 2)
        }
    }
    
    // MARK: - Statistics Tests
    
    func testFetchStatistics() {
        // Test statistics calculation
        for type in testMetricTypes {
            asyncExpectation = expectation(description: "Statistics \(type)")
            
            sut.fetchStatistics(type: type,
                              startDate: testDateRange.start,
                              endDate: testDateRange.end,
                              options: [.discreteAverage, .discreteMin, .discreteMax]) { result in
                switch result {
                case .success(let statistics):
                    XCTAssertNotNil(statistics, "Should return statistics")
                    
                    // Validate statistics values
                    if let avgQuantity = statistics.averageQuantity() {
                        let avgValue = avgQuantity.doubleValue(for: type.defaultUnit)
                        XCTAssertTrue(type.validRange.contains(avgValue),
                                    "Average value should be within valid range")
                    }
                    
                    if let minQuantity = statistics.minimumQuantity() {
                        let minValue = minQuantity.doubleValue(for: type.defaultUnit)
                        XCTAssertTrue(type.validRange.contains(minValue),
                                    "Minimum value should be within valid range")
                    }
                    
                    if let maxQuantity = statistics.maximumQuantity() {
                        let maxValue = maxQuantity.doubleValue(for: type.defaultUnit)
                        XCTAssertTrue(type.validRange.contains(maxValue),
                                    "Maximum value should be within valid range")
                    }
                    
                case .failure(let error):
                    XCTFail("Statistics fetch failed for \(type): \(error)")
                }
                self.asyncExpectation.fulfill()
            }
            
            wait(for: [asyncExpectation], timeout: defaultTimeout)
        }
        
        // Test invalid statistics options
        asyncExpectation = expectation(description: "Invalid statistics")
        
        sut.fetchStatistics(type: .heartRate,
                          startDate: testDateRange.start,
                          endDate: testDateRange.end,
                          options: []) { result in
            if case .failure(let error) = result {
                XCTAssertNotNil(error, "Should fail with invalid options")
            } else {
                XCTFail("Should not succeed with invalid options")
            }
            self.asyncExpectation.fulfill()
        }
        
        wait(for: [asyncExpectation], timeout: defaultTimeout)
    }
}