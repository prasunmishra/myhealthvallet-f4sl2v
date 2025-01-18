import HealthKit // v14.0+
import Foundation // v14.0+

/// Errors that can occur during HealthKit operations
public enum HealthKitError: Error {
    case typeUnavailable(String)
    case authorizationDenied(String)
    case healthKitNotAvailable
    case invalidQuantityType
}

/// Errors that can occur during unit conversion
public enum UnitConversionError: Error {
    case incompatibleUnits(String)
    case valueOutOfRange(String)
    case conversionFailed(String)
    case unsupportedUnit(String)
}

/// Type-safe enumeration of supported health metric types with comprehensive configuration
public enum HealthMetricType: CaseIterable {
    case heartRate
    case bloodPressureSystolic
    case bloodPressureDiastolic
    case bloodGlucose
    case bodyWeight
    case bodyTemperature
    case oxygenSaturation
    case stepCount
    case activeEnergyBurned
    case distanceWalkingRunning
    
    /// Unique identifier for the health metric type
    public var identifier: String {
        switch self {
        case .heartRate: return HKQuantityTypeIdentifier.heartRate.rawValue
        case .bloodPressureSystolic: return HKQuantityTypeIdentifier.bloodPressureSystolic.rawValue
        case .bloodPressureDiastolic: return HKQuantityTypeIdentifier.bloodPressureDiastolic.rawValue
        case .bloodGlucose: return HKQuantityTypeIdentifier.bloodGlucose.rawValue
        case .bodyWeight: return HKQuantityTypeIdentifier.bodyMass.rawValue
        case .bodyTemperature: return HKQuantityTypeIdentifier.bodyTemperature.rawValue
        case .oxygenSaturation: return HKQuantityTypeIdentifier.oxygenSaturation.rawValue
        case .stepCount: return HKQuantityTypeIdentifier.stepCount.rawValue
        case .activeEnergyBurned: return HKQuantityTypeIdentifier.activeEnergyBurned.rawValue
        case .distanceWalkingRunning: return HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue
        }
    }
    
    /// Localized display name for the health metric type
    public var localizedDisplayName: String {
        switch self {
        case .heartRate: return NSLocalizedString("Heart Rate", comment: "Heart rate metric name")
        case .bloodPressureSystolic: return NSLocalizedString("Systolic Blood Pressure", comment: "Systolic blood pressure metric name")
        case .bloodPressureDiastolic: return NSLocalizedString("Diastolic Blood Pressure", comment: "Diastolic blood pressure metric name")
        case .bloodGlucose: return NSLocalizedString("Blood Glucose", comment: "Blood glucose metric name")
        case .bodyWeight: return NSLocalizedString("Body Weight", comment: "Body weight metric name")
        case .bodyTemperature: return NSLocalizedString("Body Temperature", comment: "Body temperature metric name")
        case .oxygenSaturation: return NSLocalizedString("Oxygen Saturation", comment: "Oxygen saturation metric name")
        case .stepCount: return NSLocalizedString("Step Count", comment: "Step count metric name")
        case .activeEnergyBurned: return NSLocalizedString("Active Energy Burned", comment: "Active energy burned metric name")
        case .distanceWalkingRunning: return NSLocalizedString("Distance Walking/Running", comment: "Distance walking/running metric name")
        }
    }
    
    /// Default unit for the health metric type
    public var defaultUnit: HKUnit {
        switch self {
        case .heartRate: return HKUnit.count().unitDivided(by: .minute())
        case .bloodPressureSystolic, .bloodPressureDiastolic: return HKUnit.millimeterOfMercury()
        case .bloodGlucose: return HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci))
        case .bodyWeight: return HKUnit.gramUnit(with: .kilo)
        case .bodyTemperature: return HKUnit.degreeCelsius()
        case .oxygenSaturation: return HKUnit.percent()
        case .stepCount: return HKUnit.count()
        case .activeEnergyBurned: return HKUnit.kilocalorie()
        case .distanceWalkingRunning: return HKUnit.meter()
        }
    }
    
    /// Valid range for the health metric type
    public var validRange: Range<Double> {
        switch self {
        case .heartRate: return 0..<300
        case .bloodPressureSystolic: return 0..<300
        case .bloodPressureDiastolic: return 0..<200
        case .bloodGlucose: return 0..<500
        case .bodyWeight: return 0..<500
        case .bodyTemperature: return 25..<45
        case .oxygenSaturation: return 0..<100
        case .stepCount: return 0..<100000
        case .activeEnergyBurned: return 0..<10000
        case .distanceWalkingRunning: return 0..<100000
        }
    }
    
    /// Supported units for the health metric type
    public var supportedUnits: Set<HKUnit> {
        switch self {
        case .heartRate:
            return [HKUnit.count().unitDivided(by: .minute()),
                   HKUnit.count().unitDivided(by: .second())]
        case .bloodPressureSystolic, .bloodPressureDiastolic:
            return [HKUnit.millimeterOfMercury(),
                   HKUnit.pascal()]
        case .bloodGlucose:
            return [HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci)),
                   HKUnit.moleUnit(with: .milli).unitDivided(by: .liter())]
        case .bodyWeight:
            return [HKUnit.gramUnit(with: .kilo),
                   HKUnit.pound()]
        case .bodyTemperature:
            return [HKUnit.degreeCelsius(),
                   HKUnit.degreeFahrenheit()]
        case .oxygenSaturation:
            return [HKUnit.percent()]
        case .stepCount:
            return [HKUnit.count()]
        case .activeEnergyBurned:
            return [HKUnit.kilocalorie(),
                   HKUnit.joule()]
        case .distanceWalkingRunning:
            return [HKUnit.meter(),
                   HKUnit.mile()]
        }
    }
    
    /// Returns the HKQuantityType for the health metric type with validation
    public func quantityType() -> Result<HKQuantityType, HealthKitError> {
        guard HKHealthStore.isHealthDataAvailable() else {
            return .failure(.healthKitNotAvailable)
        }
        
        guard let type = HKQuantityType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier)) else {
            return .failure(.invalidQuantityType)
        }
        
        return .success(type)
    }
    
    /// Returns a validated set of all supported HKQuantityTypes
    public static func allTypes() -> Result<Set<HKQuantityType>, HealthKitError> {
        guard HKHealthStore.isHealthDataAvailable() else {
            return .failure(.healthKitNotAvailable)
        }
        
        var types = Set<HKQuantityType>()
        
        for metricType in HealthMetricType.allCases {
            switch metricType.quantityType() {
            case .success(let quantityType):
                types.insert(quantityType)
            case .failure(let error):
                return .failure(error)
            }
        }
        
        return .success(types)
    }
    
    /// Converts a value between supported units for the metric type
    public func convertValue(_ value: Double, from fromUnit: HKUnit, to toUnit: HKUnit) -> Result<Double, UnitConversionError> {
        guard supportedUnits.contains(fromUnit) && supportedUnits.contains(toUnit) else {
            return .failure(.unsupportedUnit("One or both units are not supported for this metric type"))
        }
        
        guard validRange.contains(value) else {
            return .failure(.valueOutOfRange("Value \(value) is outside the valid range for this metric type"))
        }
        
        let quantity = HKQuantity(unit: fromUnit, doubleValue: value)
        let convertedValue = quantity.doubleValue(for: toUnit)
        
        guard validRange.contains(convertedValue) else {
            return .failure(.conversionFailed("Converted value \(convertedValue) is outside the valid range"))
        }
        
        return .success(convertedValue)
    }
}