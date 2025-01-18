import HealthKit // v14.0+
import Foundation // v14.0+

/// Extension providing thread-safe unit conversion and formatting capabilities for HKQuantity
public extension HKQuantity {
    
    // MARK: - Error Types
    
    /// Errors that can occur during quantity conversion and formatting
    enum ConversionError: Error {
        case invalidQuantityType
        case incompatibleUnits(String)
        case conversionFailed(String)
        case outOfBounds(String)
        case cacheMiss(String)
    }
    
    enum FormattingError: Error {
        case invalidUnit
        case invalidLocale
        case formattingFailed(String)
    }
    
    // MARK: - Private Properties
    
    private static let conversionCache = NSCache<NSString, NSNumber>()
    private static let queue = DispatchQueue(label: "com.phrsat.hkquantity.conversion", qos: .userInitiated)
    private static let lock = NSLock()
    
    // MARK: - Public Methods
    
    /// Converts the quantity to the standard unit for its type with thread-safe caching
    /// - Returns: Result containing the converted value or error
    @objc func toStandardUnit() -> Result<Double, ConversionError> {
        Self.lock.lock()
        defer { Self.lock.unlock() }
        
        // Generate cache key
        let cacheKey = NSString(string: "std_\(self.description)")
        
        // Check cache first
        if let cachedValue = Self.conversionCache.object(forKey: cacheKey) {
            return .success(cachedValue.doubleValue)
        }
        
        // Determine quantity type and get standard unit
        guard let quantityType = try? self.quantityType() else {
            return .failure(.invalidQuantityType)
        }
        
        let unitType: UnitType
        switch quantityType {
        case HKQuantityType.quantityType(forIdentifier: .heartRate):
            unitType = .frequency
        case HKQuantityType.quantityType(forIdentifier: .bodyMass):
            unitType = .mass
        case HKQuantityType.quantityType(forIdentifier: .bodyTemperature):
            unitType = .temperature
        case HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic),
             HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic):
            unitType = .pressure
        case HKQuantityType.quantityType(forIdentifier: .bloodGlucose):
            unitType = .concentration
        case HKQuantityType.quantityType(forIdentifier: .oxygenSaturation):
            unitType = .percentage
        case HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned):
            unitType = .energy
        case HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning):
            unitType = .length
        default:
            return .failure(.invalidQuantityType)
        }
        
        // Get standard unit
        guard case .success(let standardUnit) = UnitConversionUtils.getStandardUnit(unitType) else {
            return .failure(.conversionFailed("Failed to get standard unit"))
        }
        
        // Perform conversion
        let convertedValue = self.doubleValue(for: standardUnit)
        
        // Validate conversion result
        guard !convertedValue.isNaN && !convertedValue.isInfinite else {
            return .failure(.conversionFailed("Conversion resulted in invalid value"))
        }
        
        // Cache the result
        Self.conversionCache.setObject(NSNumber(value: convertedValue), forKey: cacheKey)
        
        return .success(convertedValue)
    }
    
    /// Returns a localized, formatted string representation of the quantity
    /// - Parameters:
    ///   - unit: Optional unit to convert to before formatting (defaults to quantity's unit)
    ///   - locale: Optional locale for formatting (defaults to current)
    ///   - precision: Number of decimal places (defaults to 2)
    /// - Returns: Result containing formatted string or error
    func formattedString(
        unit: HKUnit? = nil,
        locale: Locale? = nil,
        precision: Int = 2
    ) -> Result<String, FormattingError> {
        let targetUnit = unit ?? try? self.quantityType()?.defaultUnit
        guard let targetUnit = targetUnit else {
            return .failure(.invalidUnit)
        }
        
        let value = self.doubleValue(for: targetUnit)
        let formattingLocale = locale ?? .current
        
        return UnitConversionUtils.formatValue(
            value,
            unit: targetUnit,
            locale: formattingLocale
        ).mapError { _ in
            .formattingFailed("Failed to format quantity value")
        }
    }
    
    /// Converts quantity to specified unit with thread-safe caching
    /// - Parameter unit: Target unit for conversion
    /// - Returns: Result containing converted value or error
    @objc func convertTo(_ unit: HKUnit) -> Result<Double, ConversionError> {
        Self.lock.lock()
        defer { Self.lock.unlock() }
        
        // Generate cache key
        let cacheKey = NSString(string: "\(self.description)_\(unit.unitString)")
        
        // Check cache first
        if let cachedValue = Self.conversionCache.object(forKey: cacheKey) {
            return .success(cachedValue.doubleValue)
        }
        
        // Verify unit compatibility
        guard let quantityType = try? self.quantityType(),
              quantityType.isCompatible(with: unit) else {
            return .failure(.incompatibleUnits("Incompatible unit for conversion"))
        }
        
        // Perform conversion
        let convertedValue = self.doubleValue(for: unit)
        
        // Validate conversion result
        guard !convertedValue.isNaN && !convertedValue.isInfinite else {
            return .failure(.conversionFailed("Conversion resulted in invalid value"))
        }
        
        // Cache the result
        Self.conversionCache.setObject(NSNumber(value: convertedValue), forKey: cacheKey)
        
        return .success(convertedValue)
    }
    
    // MARK: - Private Methods
    
    private func quantityType() throws -> HKQuantityType? {
        // This is a helper method to determine the quantity type
        // Implementation depends on internal HealthKit APIs
        // Returns nil if type cannot be determined
        return nil
    }
}