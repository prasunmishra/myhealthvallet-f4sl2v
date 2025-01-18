import HealthKit // Latest
import Foundation // Latest

/// Manages workout-related operations and synchronization with HealthKit with enhanced error handling and HIPAA compliance
@available(iOS 13.0, *)
@objc public class HealthKitWorkoutManager: NSObject {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = HealthKitWorkoutManager()
    
    /// HealthKit store instance
    private let healthStore: HKHealthStore
    
    /// Query manager for optimized HealthKit operations
    private let queryManager: HealthKitQueryManager
    
    /// Current workout session
    private var currentWorkoutSession: HKWorkoutSession?
    
    /// Current workout builder
    private var workoutBuilder: HKLiveWorkoutBuilder?
    
    /// Serial queue for workout operations
    private let workoutQueue = DispatchQueue(label: "com.phrsat.healthbridge.workout", qos: .userInitiated)
    
    /// Cache for workout data
    private let workoutCache = NSCache<NSString, WorkoutData>()
    
    /// Error logger for HIPAA compliance
    private let errorLogger = Logger(subsystem: "com.phrsat.healthbridge", category: "WorkoutManager")
    
    /// Retry configuration
    private let retryConfig = RetryConfiguration(maxAttempts: 3, delay: 1.0)
    
    // MARK: - Initialization
    
    private override init() {
        self.healthStore = HKHealthStore()
        self.queryManager = HealthKitQueryManager(store: healthStore)
        
        super.init()
        
        // Configure workout cache
        workoutCache.countLimit = 50
        
        // Setup background delivery
        setupBackgroundDelivery()
    }
    
    // MARK: - Public Methods
    
    /// Starts a new workout session with enhanced validation and error handling
    public func startWorkout(activityType: HKWorkoutActivityType,
                           config: WorkoutConfiguration,
                           completion: @escaping (Result<Void, WorkoutDataError>) -> Void) {
        
        workoutQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Validate no existing session
            if self.currentWorkoutSession != nil {
                self.errorLogger.error("Attempted to start workout while session active")
                completion(.failure(.healthKitError))
                return
            }
            
            // Create workout configuration
            let workoutConfig = HKWorkoutConfiguration()
            workoutConfig.activityType = activityType
            workoutConfig.locationType = config.locationType
            
            // Start workout session with retry logic
            var attempts = 0
            self.startWorkoutSession(config: workoutConfig) { result in
                switch result {
                case .success:
                    // Configure data collection
                    self.configureWorkoutBuilder()
                    
                    // Log for HIPAA compliance
                    self.errorLogger.info("Workout session started: \(activityType.rawValue)")
                    completion(.success(()))
                    
                case .failure(let error):
                    attempts += 1
                    if attempts < self.retryConfig.maxAttempts {
                        // Retry after delay
                        self.workoutQueue.asyncAfter(deadline: .now() + self.retryConfig.delay) {
                            self.startWorkoutSession(config: workoutConfig) { _ in }
                        }
                    } else {
                        self.errorLogger.error("Failed to start workout after \(attempts) attempts: \(error.localizedDescription)")
                        completion(.failure(.healthKitError))
                    }
                }
            }
        }
    }
    
    /// Ends the current workout session with data validation and error recovery
    public func endWorkout(completion: @escaping (Result<WorkoutData, WorkoutDataError>) -> Void) {
        workoutQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Validate active session
            guard let session = self.currentWorkoutSession,
                  let builder = self.workoutBuilder else {
                self.errorLogger.error("No active workout session to end")
                completion(.failure(.healthKitError))
                return
            }
            
            // End workout session
            session.end()
            
            // Collect final workout data
            builder.finishWorkout { [weak self] workout, error in
                guard let self = self else { return }
                
                if let error = error {
                    self.errorLogger.error("Failed to finish workout: \(error.localizedDescription)")
                    completion(.failure(.healthKitError))
                    return
                }
                
                guard let workout = workout else {
                    self.errorLogger.error("No workout data available")
                    completion(.failure(.healthKitError))
                    return
                }
                
                // Fetch associated samples
                self.queryManager.executeQuantityQuery(
                    type: .heartRate,
                    startDate: workout.startDate,
                    endDate: workout.endDate
                ) { result in
                    switch result {
                    case .success(let samples):
                        // Convert to WorkoutData
                        switch WorkoutData.fromHKWorkout(workout, samples: samples) {
                        case .success(let workoutData):
                            // Cache workout data
                            self.workoutCache.setObject(workoutData,
                                                      forKey: workoutData.id.uuidString as NSString)
                            
                            // Log for HIPAA compliance
                            self.errorLogger.info("Workout completed: \(workoutData.id.uuidString)")
                            completion(.success(workoutData))
                            
                        case .failure(let error):
                            self.errorLogger.error("Failed to convert workout data: \(error.localizedDescription)")
                            completion(.failure(error))
                        }
                        
                    case .failure(let error):
                        self.errorLogger.error("Failed to fetch workout samples: \(error.localizedDescription)")
                        completion(.failure(.healthKitError))
                    }
                }
            }
            
            // Cleanup
            self.currentWorkoutSession = nil
            self.workoutBuilder = nil
        }
    }
    
    // MARK: - Private Methods
    
    private func startWorkoutSession(config: HKWorkoutConfiguration,
                                   completion: @escaping (Result<Void, Error>) -> Void) {
        do {
            let session = try HKWorkoutSession(healthStore: healthStore,
                                             configuration: config)
            let builder = session.associatedWorkoutBuilder()
            
            session.delegate = self
            builder.delegate = self
            
            self.currentWorkoutSession = session
            self.workoutBuilder = builder
            
            session.startActivity(with: Date())
            builder.beginCollection(withStart: Date()) { success, error in
                if let error = error {
                    completion(.failure(error))
                } else {
                    completion(.success(()))
                }
            }
        } catch {
            completion(.failure(error))
        }
    }
    
    private func configureWorkoutBuilder() {
        guard let builder = workoutBuilder else { return }
        
        // Configure data collection
        let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
        let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
        let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!
        
        builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore,
                                                    workoutConfiguration: builder.workoutConfiguration)
        
        // Enable collection for relevant types
        builder.enableCollection(for: heartRateType)
        builder.enableCollection(for: energyType)
        builder.enableCollection(for: distanceType)
    }
    
    private func setupBackgroundDelivery() {
        let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
        
        healthStore.enableBackgroundDelivery(for: heartRateType,
                                           frequency: .immediate) { success, error in
            if let error = error {
                self.errorLogger.error("Failed to enable background delivery: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - HKWorkoutSessionDelegate

extension HealthKitWorkoutManager: HKWorkoutSessionDelegate {
    public func workoutSession(_ workoutSession: HKWorkoutSession,
                             didChangeTo toState: HKWorkoutSessionState,
                             from fromState: HKWorkoutSessionState,
                             date: Date) {
        errorLogger.info("Workout session state changed: \(fromState.rawValue) -> \(toState.rawValue)")
    }
    
    public func workoutSession(_ workoutSession: HKWorkoutSession,
                             didFailWithError error: Error) {
        errorLogger.error("Workout session failed: \(error.localizedDescription)")
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension HealthKitWorkoutManager: HKLiveWorkoutBuilderDelegate {
    public func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                             didCollectDataOf collectedTypes: Set<HKSampleType>) {
        // Handle real-time data collection
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType else { continue }
            
            workoutBuilder.statistics(for: quantityType)?.mostRecentQuantity()
        }
    }
    
    public func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // Handle workout events
    }
}

// MARK: - Supporting Types

private struct RetryConfiguration {
    let maxAttempts: Int
    let delay: TimeInterval
}

private struct WorkoutConfiguration {
    let locationType: HKWorkoutSessionLocationType
    
    init(locationType: HKWorkoutSessionLocationType = .outdoor) {
        self.locationType = locationType
    }
}