import HealthKit // v14.0+
import Foundation // v14.0+

/// Enumeration of supported measurement unit types
public enum UnitType {
    case mass
    case length
    case energy
    case temperature
    case pressure
    case frequency
    case percentage
    case volume
    case concentration
}

/// Enumeration of possible unit conversion errors
public enum ConversionError: Error {
    case incompatibleUnits(String)
    case invalidValue(String)
    case outOfRange(String)
    case unsupportedUnit(String)
    case conversionFailed(String)
}

/// Utility class providing standardized unit conversion functions
public final class UnitConversionUtils {
    
    // MARK: - Private Properties
    
    private static let conversionCache = NSCache<NSString, NSNumber>()
    private static let queue = DispatchQueue(label: "com.phrsat.unitconversion", qos: .userInitiated)
    private static let cacheLimit = 1000
    
    // MARK: - Initialization
    
    private init() {} // Prevent instantiation
    
    // MARK: - Public Methods
    
    /// Converts a value from one unit to another within the same unit type
    /// - Parameters:
    ///   - value: The value to convert
    ///   - fromUnit: The source unit
    ///   - toUnit: The target unit
    /// - Returns: Converted value in the target unit or error
    public static func convertValue(
        _ value: Double,
        from fromUnit: HKUnit,
        to toUnit: HKUnit
    ) -> Result<Double, ConversionError> {
        // Validate input value
        guard !value.isNaN && !value.isInfinite else {
            return .failure(.invalidValue("Invalid input value"))
        }
        
        // Verify unit compatibility
        guard fromUnit.dimensionality == toUnit.dimensionality else {
            return .failure(.incompatibleUnits("Units are not compatible for conversion"))
        }
        
        // Generate cache key
        let cacheKey = NSString(string: "\(value)-\(fromUnit.unitString)-\(toUnit.unitString)")
        
        // Check conversion cache
        if let cachedValue = conversionCache.object(forKey: cacheKey) {
            return .success(cachedValue.doubleValue)
        }
        
        // Perform thread-safe conversion
        return queue.sync {
            let quantity = HKQuantity(unit: fromUnit, doubleValue: value)
            let convertedValue = quantity.doubleValue(for: toUnit)
            
            // Validate converted value
            guard !convertedValue.isNaN && !convertedValue.isInfinite else {
                return .failure(.conversionFailed("Conversion resulted in invalid value"))
            }
            
            // Cache successful conversion
            conversionCache.setObject(NSNumber(value: convertedValue), forKey: cacheKey)
            
            return .success(convertedValue)
        }
    }
    
    /// Returns the standard unit for a given unit type
    /// - Parameter unitType: The unit type
    /// - Returns: Standard unit for the given type or error
    public static func getStandardUnit(_ unitType: UnitType) -> Result<HKUnit, ConversionError> {
        switch unitType {
        case .mass:
            return .success(HKUnit.gramUnit(with: .kilo))
        case .length:
            return .success(HKUnit.meter())
        case .energy:
            return .success(HKUnit.kilocalorie())
        case .temperature:
            return .success(HKUnit.degreeCelsius())
        case .pressure:
            return .success(HKUnit.millimeterOfMercury())
        case .frequency:
            return .success(HKUnit.count().unitDivided(by: .minute()))
        case .percentage:
            return .success(HKUnit.percent())
        case .volume:
            return .success(HKUnit.liter())
        case .concentration:
            return .success(HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci)))
        }
    }
    
    /// Formats a value with its unit for display
    /// - Parameters:
    ///   - value: The value to format
    ///   - unit: The unit of the value
    ///   - locale: The locale to use for formatting
    /// - Returns: Localized formatted string with value and unit or error
    public static func formatValue(
        _ value: Double,
        unit: HKUnit,
        locale: Locale = .current
    ) -> Result<String, ConversionError> {
        // Validate value
        guard !value.isNaN && !value.isInfinite else {
            return .failure(.invalidValue("Invalid value for formatting"))
        }
        
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 2
        
        guard let formattedValue = formatter.string(from: NSNumber(value: value)) else {
            return .failure(.conversionFailed("Failed to format value"))
        }
        
        let unitString = unit.unitString
        return .success("\(formattedValue) \(unitString)")
    }
    
    /// Parses a string containing a value and unit
    /// - Parameter valueString: The string to parse
    /// - Returns: Tuple of parsed value and unit or error
    public static func parseValueWithUnit(_ valueString: String) -> Result<(Double, HKUnit), ConversionError> {
        let components = valueString.split(separator: " ")
        
        guard components.count == 2 else {
            return .failure(.invalidValue("Invalid format: expected 'value unit'"))
        }
        
        guard let value = Double(components[0]) else {
            return .failure(.invalidValue("Invalid numeric value"))
        }
        
        guard let unit = try? HKUnit(from: String(components[1])) else {
            return .failure(.unsupportedUnit("Unsupported or invalid unit"))
        }
        
        return .success((value, unit))
    }
    
    // MARK: - Cache Management
    
    /// Clears the conversion cache
    public static func clearCache() {
        queue.sync {
            conversionCache.removeAllObjects()
        }
    }
    
    /// Sets the maximum number of cached conversions
    /// - Parameter limit: Maximum number of cached items
    public static func setCacheLimit(_ limit: Int) {
        queue.sync {
            conversionCache.countLimit = limit
        }
    }
}