import XCTest // Latest
import HealthKit // Latest
@testable import PHRSATHealthBridge

/// Comprehensive test suite for validating HealthMetric model functionality and data accuracy
class HealthMetricTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: HealthMetric?
    private var healthStore: HKHealthStore!
    private let testDataGenerator = TestDataGenerator()
    
    // MARK: - Test Lifecycle
    
    override func setUp() {
        super.setUp()
        healthStore = HKHealthStore()
        
        // Request HealthKit authorization for testing
        let types = Set([HKObjectType.quantityType(forIdentifier: .heartRate)!])
        try? healthStore.requestAuthorization(toShare: types, read: types) { _, _ in }
        
        // Create test metric instance
        try? sut = HealthMetric(
            type: .heartRate,
            value: 75.0,
            unit: "count/min",
            timestamp: Date(),
            source: "PHRSATTests",
            metadata: ["testKey": "testValue"]
        )
    }
    
    override func tearDown() {
        sut = nil
        super.tearDown()
    }
    
    // MARK: - Initialization Tests
    
    func testHealthMetricInitialization() throws {
        // Test valid initialization
        let timestamp = Date()
        let metric = try HealthMetric(
            type: .heartRate,
            value: 75.0,
            unit: "count/min",
            timestamp: timestamp,
            source: "PHRSATTests",
            metadata: ["testKey": "testValue"]
        )
        
        XCTAssertNotNil(metric.id)
        XCTAssertEqual(metric.type, .heartRate)
        XCTAssertEqual(metric.value, 75.0)
        XCTAssertEqual(metric.unit, "count/min")
        XCTAssertEqual(metric.timestamp, timestamp)
        XCTAssertEqual(metric.source, "PHRSATTests")
        XCTAssertEqual(metric.metadata?["testKey"] as? String, "testValue")
        
        // Test initialization with invalid value
        XCTAssertThrowsError(try HealthMetric(
            type: .heartRate,
            value: -1.0,
            unit: "count/min",
            timestamp: Date()
        )) { error in
            XCTAssertEqual(error as? HealthMetricError, .invalidValue)
        }
        
        // Test initialization with future timestamp
        XCTAssertThrowsError(try HealthMetric(
            type: .heartRate,
            value: 75.0,
            unit: "count/min",
            timestamp: Date().addingTimeInterval(3600)
        )) { error in
            XCTAssertEqual(error as? HealthMetricError, .invalidTimestamp)
        }
        
        // Test initialization with invalid unit
        XCTAssertThrowsError(try HealthMetric(
            type: .heartRate,
            value: 75.0,
            unit: "invalid",
            timestamp: Date()
        )) { error in
            XCTAssertEqual(error as? HealthMetricError, .invalidUnit)
        }
    }
    
    // MARK: - HealthKit Conversion Tests
    
    func testHealthKitConversion() throws {
        guard let metric = sut else {
            XCTFail("Test metric not initialized")
            return
        }
        
        // Test conversion to HKQuantitySample
        let sampleResult = metric.toHKQuantitySample()
        switch sampleResult {
        case .success(let sample):
            XCTAssertEqual(sample.quantityType.identifier, HKQuantityTypeIdentifier.heartRate.rawValue)
            XCTAssertEqual(sample.quantity.doubleValue(for: HKUnit(from: metric.unit)), metric.value)
            XCTAssertEqual(sample.startDate, metric.timestamp)
            XCTAssertEqual(sample.metadata?[HKMetadataKeyExternalUUID] as? String, metric.id.uuidString)
            XCTAssertEqual(sample.metadata?[HKMetadataKeySourceName] as? String, metric.source)
            
        case .failure(let error):
            XCTFail("Failed to convert to HKQuantitySample: \(error)")
        }
        
        // Test conversion from HKQuantitySample
        if case .success(let sample) = sampleResult {
            let reconvertedResult = HealthMetric.fromHKQuantitySample(sample)
            switch reconvertedResult {
            case .success(let reconvertedMetric):
                XCTAssertEqual(reconvertedMetric.type, metric.type)
                XCTAssertEqual(reconvertedMetric.value, metric.value, accuracy: 0.001)
                XCTAssertEqual(reconvertedMetric.timestamp, metric.timestamp)
                XCTAssertEqual(reconvertedMetric.source, metric.source)
                
            case .failure(let error):
                XCTFail("Failed to convert from HKQuantitySample: \(error)")
            }
        }
    }
    
    // MARK: - Dictionary Conversion Tests
    
    func testDictionaryConversion() throws {
        guard let metric = sut else {
            XCTFail("Test metric not initialized")
            return
        }
        
        let dictionaryResult = metric.toDictionary()
        switch dictionaryResult {
        case .success(let dict):
            XCTAssertEqual(dict["id"] as? String, metric.id.uuidString)
            XCTAssertEqual(dict["type"] as? String, metric.type.identifier)
            XCTAssertEqual(dict["value"] as? Double, metric.value)
            XCTAssertEqual(dict["unit"] as? String, metric.unit)
            XCTAssertEqual(dict["source"] as? String, metric.source)
            XCTAssertNotNil(dict["timestamp"])
            
            if let metadata = dict["metadata"] as? [String: Any] {
                XCTAssertEqual(metadata["testKey"] as? String, "testValue")
            } else {
                XCTFail("Missing metadata in dictionary conversion")
            }
            
        case .failure(let error):
            XCTFail("Failed to convert to dictionary: \(error)")
        }
    }
    
    // MARK: - Invalid Input Tests
    
    func testInvalidInputs() {
        // Test out of range values for different metric types
        for type in HealthMetricType.allCases {
            let invalidValue = type.validRange.upperBound + 1
            XCTAssertThrowsError(try HealthMetric(
                type: type,
                value: invalidValue,
                unit: type.defaultUnit.unitString,
                timestamp: Date()
            )) { error in
                XCTAssertEqual(error as? HealthMetricError, .invalidValue)
            }
        }
        
        // Test invalid units for each metric type
        XCTAssertThrowsError(try HealthMetric(
            type: .heartRate,
            value: 75.0,
            unit: "kg", // Invalid unit for heart rate
            timestamp: Date()
        )) { error in
            XCTAssertEqual(error as? HealthMetricError, .invalidUnit)
        }
        
        // Test invalid metadata
        let invalidMetadata: [String: Any] = ["invalid": Double.infinity]
        XCTAssertThrowsError(try HealthMetric(
            type: .heartRate,
            value: 75.0,
            unit: "count/min",
            timestamp: Date(),
            metadata: invalidMetadata
        )) { error in
            XCTAssertEqual(error as? HealthMetricError, .invalidMetadata)
        }
    }
    
    // MARK: - Helper Types
    
    private class TestDataGenerator {
        func generateValidMetric(for type: HealthMetricType) throws -> HealthMetric {
            let midValue = (type.validRange.lowerBound + type.validRange.upperBound) / 2
            return try HealthMetric(
                type: type,
                value: midValue,
                unit: type.defaultUnit.unitString,
                timestamp: Date(),
                source: "TestGenerator",
                metadata: ["generated": true]
            )
        }
    }
}