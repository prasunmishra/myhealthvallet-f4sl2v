import Foundation // Latest
import HealthKit // Latest

/// Errors that can occur during health metric operations
@objc public enum HealthMetricError: Int, Error {
    case invalidType
    case invalidValue
    case invalidUnit
    case invalidTimestamp
    case invalidMetadata
    case conversionError
    case healthKitError
    
    var localizedDescription: String {
        switch self {
        case .invalidType: return NSLocalizedString("Invalid health metric type", comment: "")
        case .invalidValue: return NSLocalizedString("Value is outside valid range", comment: "")
        case .invalidUnit: return NSLocalizedString("Unsupported unit for metric type", comment: "")
        case .invalidTimestamp: return NSLocalizedString("Invalid timestamp", comment: "")
        case .invalidMetadata: return NSLocalizedString("Invalid metadata format", comment: "")
        case .conversionError: return NSLocalizedString("Error converting units", comment: "")
        case .healthKitError: return NSLocalizedString("HealthKit operation failed", comment: "")
        }
    }
}

/// Model class representing a single health metric measurement with comprehensive validation
@objc public class HealthMetric: NSObject {
    // MARK: - Properties
    
    public let id: UUID
    public let type: HealthMetricType
    public let value: Double
    public let unit: String
    public let timestamp: Date
    public let source: String?
    public let metadata: [String: Any]?
    public private(set) var lastError: HealthMetricError?
    
    // MARK: - Initialization
    
    /// Initializes a new health metric instance with validation
    public init(type: HealthMetricType, 
                value: Double, 
                unit: String, 
                timestamp: Date, 
                source: String? = nil, 
                metadata: [String: Any]? = nil) throws {
        
        // Initialize properties
        self.id = UUID()
        self.type = type
        self.value = value
        self.unit = unit
        self.timestamp = timestamp
        self.source = source
        self.metadata = metadata
        self.lastError = nil
        
        super.init()
        
        // Validate all parameters
        try validateMetric()
    }
    
    // MARK: - Private Methods
    
    private func validateMetric() throws {
        // Validate timestamp
        if timestamp > Date() {
            lastError = .invalidTimestamp
            throw HealthMetricError.invalidTimestamp
        }
        
        // Validate value range
        if !type.validRange.contains(value) {
            lastError = .invalidValue
            throw HealthMetricError.invalidValue
        }
        
        // Validate unit
        guard let hkUnit = HKUnit(from: unit),
              type.supportedUnits.contains(hkUnit) else {
            lastError = .invalidUnit
            throw HealthMetricError.invalidUnit
        }
        
        // Validate metadata
        if let metadata = metadata {
            guard JSONSerialization.isValidJSONObject(metadata) else {
                lastError = .invalidMetadata
                throw HealthMetricError.invalidMetadata
            }
        }
    }
    
    // MARK: - Public Methods
    
    /// Converts the health metric to a HealthKit quantity sample with error handling
    public func toHKQuantitySample() -> Result<HKQuantitySample, HealthMetricError> {
        // Get quantity type
        let quantityTypeResult = type.quantityType()
        guard case .success(let quantityType) = quantityTypeResult else {
            lastError = .healthKitError
            return .failure(.healthKitError)
        }
        
        // Create quantity
        guard let hkUnit = HKUnit(from: unit) else {
            lastError = .invalidUnit
            return .failure(.invalidUnit)
        }
        
        let quantity = HKQuantity(unit: hkUnit, doubleValue: value)
        
        // Create metadata
        var validatedMetadata = metadata ?? [:]
        validatedMetadata[HKMetadataKeyExternalUUID] = id.uuidString
        if let source = source {
            validatedMetadata[HKMetadataKeySourceName] = source
        }
        
        // Create sample
        let sample = HKQuantitySample(type: quantityType,
                                    quantity: quantity,
                                    start: timestamp,
                                    end: timestamp,
                                    metadata: validatedMetadata)
        
        return .success(sample)
    }
    
    /// Creates a HealthMetric instance from a HealthKit quantity sample with validation
    public class func fromHKQuantitySample(_ sample: HKQuantitySample) -> Result<HealthMetric, HealthMetricError> {
        // Determine metric type
        guard let metricType = HealthMetricType.allCases.first(where: { $0.identifier == sample.quantityType.identifier }) else {
            return .failure(.invalidType)
        }
        
        // Get value in default unit
        let value = sample.quantity.doubleValue(for: metricType.defaultUnit)
        
        // Extract metadata
        var source: String?
        var metadata: [String: Any]?
        
        if let sampleMetadata = sample.metadata {
            source = sampleMetadata[HKMetadataKeySourceName] as? String
            
            // Filter out HealthKit specific metadata
            let filteredMetadata = sampleMetadata.filter { key, _ in
                !key.starts(with: "HK")
            }
            if !filteredMetadata.isEmpty {
                metadata = filteredMetadata
            }
        }
        
        // Create new metric
        do {
            let metric = try HealthMetric(type: metricType,
                                        value: value,
                                        unit: metricType.defaultUnit.unitString,
                                        timestamp: sample.startDate,
                                        source: source,
                                        metadata: metadata)
            return .success(metric)
        } catch let error as HealthMetricError {
            return .failure(error)
        } catch {
            return .failure(.healthKitError)
        }
    }
    
    /// Converts the health metric to a validated dictionary representation
    public func toDictionary() -> Result<[String: Any], HealthMetricError> {
        let dateFormatter = ISO8601DateFormatter()
        
        var dict: [String: Any] = [
            "id": id.uuidString,
            "type": type.identifier,
            "value": value,
            "unit": unit,
            "timestamp": dateFormatter.string(from: timestamp)
        ]
        
        if let source = source {
            dict["source"] = source
        }
        
        if let metadata = metadata {
            dict["metadata"] = metadata
        }
        
        guard JSONSerialization.isValidJSONObject(dict) else {
            lastError = .invalidMetadata
            return .failure(.invalidMetadata)
        }
        
        return .success(dict)
    }
}