import Foundation // Latest
import HealthKit // Latest
import CoreLocation // Latest

/// Errors that can occur during workout data operations
@objc public enum WorkoutDataError: Int, Error {
    case invalidDateRange
    case invalidDuration
    case invalidEnergyUnit
    case invalidDistanceUnit
    case invalidHeartRateZones
    case conversionError
    case healthKitError
    
    var localizedDescription: String {
        switch self {
        case .invalidDateRange: return NSLocalizedString("End date must be after start date", comment: "")
        case .invalidDuration: return NSLocalizedString("Duration must match date range", comment: "")
        case .invalidEnergyUnit: return NSLocalizedString("Invalid energy unit", comment: "")
        case .invalidDistanceUnit: return NSLocalizedString("Invalid distance unit", comment: "")
        case .invalidHeartRateZones: return NSLocalizedString("Invalid heart rate zones", comment: "")
        case .conversionError: return NSLocalizedString("Error converting units", comment: "")
        case .healthKitError: return NSLocalizedString("HealthKit operation failed", comment: "")
        }
    }
}

/// Model class representing a workout session with enhanced validation, error handling, and international support
@objc public class WorkoutData: NSObject {
    // MARK: - Properties
    
    public let id: UUID
    public let activityType: HKWorkoutActivityType
    public let startDate: Date
    public let endDate: Date
    public let duration: TimeInterval
    public let totalEnergyBurned: Double?
    public let energyUnit: HKUnit?
    public let totalDistance: Double?
    public let distanceUnit: HKUnit?
    public let metrics: [HealthMetric]
    public let source: String?
    public let metadata: [String: Any]?
    public let workoutRoute: CLLocation?
    public let heartRateZones: [String: Range<Double>]?
    public let weatherConditions: [String: Any]?
    
    // MARK: - Initialization
    
    /// Initializes a new workout data instance with enhanced validation
    public init(activityType: HKWorkoutActivityType,
                startDate: Date,
                endDate: Date,
                duration: TimeInterval,
                totalEnergyBurned: Double? = nil,
                energyUnit: HKUnit? = nil,
                totalDistance: Double? = nil,
                distanceUnit: HKUnit? = nil,
                metrics: [HealthMetric] = [],
                source: String? = nil,
                metadata: [String: Any]? = nil,
                workoutRoute: CLLocation? = nil,
                heartRateZones: [String: Range<Double>]? = nil,
                weatherConditions: [String: Any]? = nil) throws {
        
        // Initialize properties
        self.id = UUID()
        self.activityType = activityType
        self.startDate = startDate
        self.endDate = endDate
        self.duration = duration
        self.totalEnergyBurned = totalEnergyBurned
        self.energyUnit = energyUnit
        self.totalDistance = totalDistance
        self.distanceUnit = distanceUnit
        self.metrics = metrics
        self.source = source
        self.metadata = metadata
        self.workoutRoute = workoutRoute
        self.heartRateZones = heartRateZones
        self.weatherConditions = weatherConditions
        
        super.init()
        
        // Validate workout data
        try validateWorkoutData()
    }
    
    // MARK: - Private Methods
    
    private func validateWorkoutData() throws {
        // Validate date range
        guard endDate > startDate else {
            throw WorkoutDataError.invalidDateRange
        }
        
        // Validate duration matches date range
        let calculatedDuration = endDate.timeIntervalSince(startDate)
        guard abs(calculatedDuration - duration) < 1.0 else {
            throw WorkoutDataError.invalidDuration
        }
        
        // Validate energy unit if provided
        if let energyBurned = totalEnergyBurned, let unit = energyUnit {
            guard unit == HKUnit.kilocalorie() || unit == HKUnit.joule() else {
                throw WorkoutDataError.invalidEnergyUnit
            }
            guard energyBurned >= 0 else {
                throw WorkoutDataError.invalidEnergyUnit
            }
        }
        
        // Validate distance unit if provided
        if let distance = totalDistance, let unit = distanceUnit {
            guard unit == HKUnit.meter() || unit == HKUnit.mile() else {
                throw WorkoutDataError.invalidDistanceUnit
            }
            guard distance >= 0 else {
                throw WorkoutDataError.invalidDistanceUnit
            }
        }
        
        // Validate heart rate zones if provided
        if let zones = heartRateZones {
            for (_, range) in zones {
                guard range.lowerBound >= 0 && range.upperBound <= 220 else {
                    throw WorkoutDataError.invalidHeartRateZones
                }
            }
        }
    }
    
    // MARK: - Public Methods
    
    /// Converts the workout data to a HealthKit workout object with enhanced error handling
    public func toHKWorkout() -> Result<HKWorkout, WorkoutDataError> {
        // Create workout configuration
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = activityType
        
        // Create workout builder
        var workoutBuilder: HKWorkoutBuilder
        
        do {
            workoutBuilder = try HKWorkoutBuilder(healthStore: HKHealthStore(),
                                                configuration: configuration,
                                                device: HKDevice.local())
        } catch {
            return .failure(.healthKitError)
        }
        
        // Add energy burned if available
        if let energy = totalEnergyBurned, let unit = energyUnit {
            let quantity = HKQuantity(unit: unit, doubleValue: energy)
            workoutBuilder.addTotalEnergyBurned(quantity)
        }
        
        // Add distance if available
        if let distance = totalDistance, let unit = distanceUnit {
            let quantity = HKQuantity(unit: unit, doubleValue: distance)
            workoutBuilder.addTotalDistance(quantity)
        }
        
        // Prepare metadata
        var workoutMetadata: [String: Any] = metadata ?? [:]
        workoutMetadata[HKMetadataKeyExternalUUID] = id.uuidString
        
        if let source = source {
            workoutMetadata[HKMetadataKeySourceName] = source
        }
        
        if let weather = weatherConditions {
            workoutMetadata["weatherConditions"] = weather
        }
        
        if let zones = heartRateZones {
            workoutMetadata["heartRateZones"] = zones
        }
        
        // Build workout
        var workout: HKWorkout?
        let semaphore = DispatchSemaphore(value: 0)
        
        workoutBuilder.beginCollection(withStart: startDate) { success, error in
            if !success {
                semaphore.signal()
                return
            }
            
            workoutBuilder.endCollection(withEnd: self.endDate) { success, error in
                if success {
                    workoutBuilder.finishWorkout { finalWorkout, error in
                        workout = finalWorkout
                        semaphore.signal()
                    }
                } else {
                    semaphore.signal()
                }
            }
        }
        
        _ = semaphore.wait(timeout: .now() + 30.0)
        
        guard let finalWorkout = workout else {
            return .failure(.healthKitError)
        }
        
        return .success(finalWorkout)
    }
    
    /// Creates a WorkoutData instance from a HealthKit workout with comprehensive validation
    public class func fromHKWorkout(_ workout: HKWorkout, samples: [HKQuantitySample]) -> Result<WorkoutData, WorkoutDataError> {
        // Extract energy burned
        let energyUnit = HKUnit.kilocalorie()
        let totalEnergyBurned = workout.totalEnergyBurned?.doubleValue(for: energyUnit)
        
        // Extract distance
        let distanceUnit = HKUnit.meter()
        let totalDistance = workout.totalDistance?.doubleValue(for: distanceUnit)
        
        // Convert samples to metrics
        var metrics: [HealthMetric] = []
        for sample in samples {
            if case .success(let metric) = HealthMetric.fromHKQuantitySample(sample) {
                metrics.append(metric)
            }
        }
        
        // Extract metadata
        var source: String?
        var metadata: [String: Any]?
        var heartRateZones: [String: Range<Double>]?
        var weatherConditions: [String: Any]?
        
        if let workoutMetadata = workout.metadata {
            source = workoutMetadata[HKMetadataKeySourceName] as? String
            heartRateZones = workoutMetadata["heartRateZones"] as? [String: Range<Double>]
            weatherConditions = workoutMetadata["weatherConditions"] as? [String: Any]
            
            // Filter out internal metadata
            let filteredMetadata = workoutMetadata.filter { key, _ in
                !key.starts(with: "HK") && key != "heartRateZones" && key != "weatherConditions"
            }
            if !filteredMetadata.isEmpty {
                metadata = filteredMetadata
            }
        }
        
        // Create workout data
        do {
            let workoutData = try WorkoutData(activityType: workout.workoutActivityType,
                                            startDate: workout.startDate,
                                            endDate: workout.endDate,
                                            duration: workout.duration,
                                            totalEnergyBurned: totalEnergyBurned,
                                            energyUnit: energyUnit,
                                            totalDistance: totalDistance,
                                            distanceUnit: distanceUnit,
                                            metrics: metrics,
                                            source: source,
                                            metadata: metadata,
                                            workoutRoute: nil,
                                            heartRateZones: heartRateZones,
                                            weatherConditions: weatherConditions)
            return .success(workoutData)
        } catch {
            return .failure(.healthKitError)
        }
    }
    
    /// Converts the workout data to a dictionary representation with international support
    public func toDictionary() -> [String: Any] {
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        var dict: [String: Any] = [
            "id": id.uuidString,
            "activityType": activityType.rawValue,
            "startDate": dateFormatter.string(from: startDate),
            "endDate": dateFormatter.string(from: endDate),
            "duration": duration
        ]
        
        if let energy = totalEnergyBurned, let unit = energyUnit {
            dict["totalEnergyBurned"] = energy
            dict["energyUnit"] = unit.unitString
        }
        
        if let distance = totalDistance, let unit = distanceUnit {
            dict["totalDistance"] = distance
            dict["distanceUnit"] = unit.unitString
        }
        
        if !metrics.isEmpty {
            dict["metrics"] = metrics.compactMap { metric in
                if case .success(let metricDict) = metric.toDictionary() {
                    return metricDict
                }
                return nil
            }
        }
        
        if let source = source {
            dict["source"] = source
        }
        
        if let metadata = metadata {
            dict["metadata"] = metadata
        }
        
        if let route = workoutRoute {
            dict["location"] = [
                "latitude": route.coordinate.latitude,
                "longitude": route.coordinate.longitude,
                "altitude": route.altitude
            ]
        }
        
        if let zones = heartRateZones {
            var zonesDict: [String: [String: Double]] = [:]
            for (name, range) in zones {
                zonesDict[name] = [
                    "min": range.lowerBound,
                    "max": range.upperBound
                ]
            }
            dict["heartRateZones"] = zonesDict
        }
        
        if let weather = weatherConditions {
            dict["weatherConditions"] = weather
        }
        
        return dict
    }
}