import HealthKit // Latest
import Foundation // Latest

/// Errors that can occur during workout data conversion and processing
public enum WorkoutConversionError: Error {
    case invalidWorkout(String)
    case invalidMetrics(String)
    case conversionFailed(String)
    case validationFailed(String)
    case hipaaViolation(String)
}

/// Errors that can occur during metric extraction
public enum MetricExtractionError: Error {
    case invalidSamples(String)
    case unsupportedMetricType(String)
    case conversionFailed(String)
}

/// Errors that can occur during duration calculation
public enum DurationError: Error {
    case invalidDates(String)
    case calculationFailed(String)
}

/// Extension adding PHRSAT-specific functionality to HKWorkout
extension HKWorkout {
    
    /// Converts HKWorkout to WorkoutData model with comprehensive validation and error handling
    /// - Parameter samples: Array of associated HKQuantitySample metrics
    /// - Returns: Result containing either validated WorkoutData or detailed error information
    public func toWorkoutData(samples: [HKQuantitySample]) -> Result<WorkoutData, WorkoutConversionError> {
        // Validate workout data integrity
        guard startDate <= endDate else {
            return .failure(.invalidWorkout("Invalid date range: end date precedes start date"))
        }
        
        guard duration > 0 else {
            return .failure(.invalidWorkout("Invalid duration: must be greater than 0"))
        }
        
        // Extract and validate metrics
        let metricsResult = getMetrics(samples: samples)
        guard case .success(let metrics) = metricsResult else {
            if case .failure(let error) = metricsResult {
                return .failure(.invalidMetrics("Metric extraction failed: \(error)"))
            }
            return .failure(.invalidMetrics("Unknown metric extraction error"))
        }
        
        // Convert metrics to HealthMetric objects
        var healthMetrics: [HealthMetric] = []
        for (type, values) in metrics {
            for value in values {
                do {
                    let metric = try HealthMetric(
                        type: type,
                        value: value,
                        unit: type.defaultUnit.unitString,
                        timestamp: startDate,
                        source: "HealthKit",
                        metadata: nil
                    )
                    healthMetrics.append(metric)
                } catch {
                    return .failure(.conversionFailed("Failed to create health metric: \(error)"))
                }
            }
        }
        
        // Create WorkoutData instance with validation
        do {
            let workoutData = try WorkoutData(
                activityType: workoutActivityType,
                startDate: startDate,
                endDate: endDate,
                duration: duration,
                totalEnergyBurned: totalEnergyBurned?.doubleValue(for: .kilocalorie()),
                energyUnit: .kilocalorie(),
                totalDistance: totalDistance?.doubleValue(for: .meter()),
                distanceUnit: .meter(),
                metrics: healthMetrics,
                source: "HealthKit",
                metadata: metadata,
                workoutRoute: nil,
                heartRateZones: nil,
                weatherConditions: nil
            )
            
            return .success(workoutData)
        } catch {
            return .failure(.validationFailed("WorkoutData validation failed: \(error)"))
        }
    }
    
    /// Extracts and validates workout metrics from associated samples
    /// - Parameter samples: Array of HKQuantitySample metrics
    /// - Returns: Result containing either validated metrics dictionary or detailed error information
    private func getMetrics(samples: [HKQuantitySample]) -> Result<[WorkoutMetricType: [Double]], MetricExtractionError> {
        // Validate input samples
        guard !samples.isEmpty else {
            return .failure(.invalidSamples("No samples provided"))
        }
        
        var metricsByType: [WorkoutMetricType: [Double]] = [:]
        
        // Process each sample
        for sample in samples {
            guard let metricType = WorkoutMetricType.allCases.first(where: { $0.identifier == sample.quantityType.identifier }) else {
                continue // Skip unsupported metric types
            }
            
            let value = sample.quantity.doubleValue(for: metricType.defaultUnit)
            
            // Validate value range
            guard metricType.validRange.contains(value) else {
                return .failure(.conversionFailed("Value \(value) outside valid range for \(metricType.localizedDisplayName)"))
            }
            
            // Add to metrics dictionary
            if metricsByType[metricType] == nil {
                metricsByType[metricType] = []
            }
            metricsByType[metricType]?.append(value)
        }
        
        return .success(metricsByType)
    }
    
    /// Calculates workout duration in seconds with validation
    /// - Returns: Result containing either validated duration or detailed error information
    private func getDuration() -> Result<TimeInterval, DurationError> {
        // Validate date range
        guard startDate <= endDate else {
            return .failure(.invalidDates("End date precedes start date"))
        }
        
        // Calculate duration
        let calculatedDuration = endDate.timeIntervalSince(startDate)
        
        // Validate duration
        guard calculatedDuration > 0 else {
            return .failure(.calculationFailed("Invalid duration: must be greater than 0"))
        }
        
        // Verify calculated duration matches stored duration
        guard abs(calculatedDuration - duration) < 1.0 else {
            return .failure(.calculationFailed("Duration mismatch between calculated and stored values"))
        }
        
        return .success(calculatedDuration)
    }
}