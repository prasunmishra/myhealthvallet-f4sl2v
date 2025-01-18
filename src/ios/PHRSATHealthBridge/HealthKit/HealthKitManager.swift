import HealthKit // Latest
import Foundation // Latest

/// Thread-safe singleton manager coordinating HealthKit operations with comprehensive error handling and telemetry
public class HealthKitManager {
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = HealthKitManager()
    
    /// HealthKit store instance
    private let healthStore: HKHealthStore
    
    /// Authorization manager instance
    private let authManager: HealthKitAuthorizationManager
    
    /// Query manager instance
    private let queryManager: HealthKitQueryManager
    
    /// Thread-safe query anchors storage
    private var queryAnchors: [HealthMetricType: HKQueryAnchor?]
    
    /// Cache for query results
    private let queryCache: NSCache<NSString, HealthMetricResult>
    
    /// Lock for thread-safe anchor access
    private let anchorsLock: NSLock
    
    /// Serial queue for HealthKit operations
    private let operationQueue: DispatchQueue
    
    /// Telemetry manager for monitoring
    private let telemetryManager: TelemetryManager
    
    /// Error logger instance
    private let errorLogger: PHRSATLogger
    
    // MARK: - Initialization
    
    private init() {
        // Initialize core components
        self.healthStore = HKHealthStore()
        self.authManager = HealthKitAuthorizationManager.shared
        self.queryManager = HealthKitQueryManager(store: healthStore)
        
        // Initialize thread-safe storage
        self.queryAnchors = [:]
        self.queryCache = NSCache<NSString, HealthMetricResult>()
        self.queryCache.countLimit = 100
        
        // Initialize synchronization
        self.anchorsLock = NSLock()
        self.operationQueue = DispatchQueue(label: "com.phrsat.healthkit", qos: .userInitiated)
        
        // Initialize monitoring
        self.telemetryManager = TelemetryManager.shared
        self.errorLogger = PHRSATLogger.shared
        
        // Register for background delivery
        setupBackgroundDelivery()
    }
    
    // MARK: - Public Methods
    
    /// Sets up HealthKit integration with necessary permissions
    public func setupHealthKit(completion: @escaping (Result<Bool, HealthKitError>) -> Void) {
        telemetryManager.trackEvent("HealthKitSetup.Started")
        
        // Verify HealthKit availability
        guard HKHealthStore.isHealthDataAvailable() else {
            errorLogger.log(.error, "HealthKit not available")
            completion(.failure(.healthKitNotAvailable))
            return
        }
        
        // Request permissions
        authManager.requestPermissions { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(true):
                // Verify granted permissions
                self.authManager.verifyPermissions { permissionResult in
                    switch permissionResult {
                    case .success(let status):
                        if status.readPermissionsGranted && status.writePermissionsGranted {
                            // Enable background delivery
                            self.authManager.enableBackgroundDelivery { deliveryResult in
                                switch deliveryResult {
                                case .success:
                                    self.telemetryManager.trackEvent("HealthKitSetup.Completed")
                                    completion(.success(true))
                                case .failure(let error):
                                    self.errorLogger.log(.error, "Background delivery setup failed: \(error)")
                                    completion(.failure(error))
                                }
                            }
                        } else {
                            self.errorLogger.log(.error, "Insufficient permissions granted")
                            completion(.failure(.authorizationDenied))
                        }
                    case .failure(let error):
                        self.errorLogger.log(.error, "Permission verification failed: \(error)")
                        completion(.failure(error))
                    }
                }
            case .success(false):
                self.errorLogger.log(.error, "Permission request denied")
                completion(.failure(.authorizationDenied))
            case .failure(let error):
                self.errorLogger.log(.error, "Permission request failed: \(error)")
                completion(.failure(error))
            }
        }
    }
    
    /// Fetches health data for specified metric type with caching and error handling
    public func fetchHealthData(type: HealthMetricType,
                              startDate: Date,
                              endDate: Date,
                              completion: @escaping (Result<[HealthMetric], HealthKitError>) -> Void) {
        telemetryManager.trackEvent("HealthDataFetch.Started", metadata: ["type": type.identifier])
        
        operationQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Check cache
            let cacheKey = "\(type.identifier)_\(startDate.timeIntervalSince1970)_\(endDate.timeIntervalSince1970)" as NSString
            if let cachedResult = self.queryCache.object(forKey: cacheKey) {
                self.telemetryManager.trackEvent("HealthDataFetch.CacheHit")
                completion(.success(cachedResult.metrics))
                return
            }
            
            // Execute query
            self.queryManager.executeQuantityQuery(type: type,
                                                startDate: startDate,
                                                endDate: endDate) { [weak self] result in
                guard let self = self else { return }
                
                switch result {
                case .success(let metrics):
                    // Cache results
                    let result = HealthMetricResult(metrics: metrics, timestamp: Date())
                    self.queryCache.setObject(result, forKey: cacheKey)
                    
                    self.telemetryManager.trackEvent("HealthDataFetch.Completed",
                                                   metadata: ["count": String(metrics.count)])
                    completion(.success(metrics))
                    
                case .failure(let error):
                    self.errorLogger.log(.error, "Health data fetch failed: \(error)")
                    completion(.failure(.queryFailed(error.localizedDescription)))
                }
            }
        }
    }
    
    /// Observes health data updates with background delivery support
    public func observeHealthData(type: HealthMetricType,
                                handler: @escaping (Result<[HealthMetric], HealthKitError>) -> Void) {
        telemetryManager.trackEvent("HealthDataObservation.Started", metadata: ["type": type.identifier])
        
        operationQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Get existing anchor
            self.anchorsLock.lock()
            let anchor = self.queryAnchors[type]
            self.anchorsLock.unlock()
            
            // Start observation query
            let backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
                self?.errorLogger.log(.warning, "Background task expired")
            }
            
            self.queryManager.executeAnchoredObjectQuery(type: type,
                                                      anchor: anchor,
                                                      taskId: backgroundTask) { [weak self] result in
                guard let self = self else { return }
                
                switch result {
                case .success(let (samples, newAnchor)):
                    // Update anchor
                    self.anchorsLock.lock()
                    self.queryAnchors[type] = newAnchor
                    self.anchorsLock.unlock()
                    
                    self.telemetryManager.trackEvent("HealthDataObservation.Updated",
                                                   metadata: ["count": String(samples.count)])
                    handler(.success(samples))
                    
                case .failure(let error):
                    self.errorLogger.log(.error, "Health data observation failed: \(error)")
                    handler(.failure(.queryFailed(error.localizedDescription)))
                }
            }
        }
    }
    
    /// Fetches statistics for specified metric type
    public func fetchStatistics(type: HealthMetricType,
                              startDate: Date,
                              endDate: Date,
                              options: HKStatisticsOptions,
                              completion: @escaping (Result<HKStatistics, HealthKitError>) -> Void) {
        telemetryManager.trackEvent("StatisticsFetch.Started", metadata: ["type": type.identifier])
        
        operationQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.queryManager.executeStatisticsQuery(type: type,
                                                  startDate: startDate,
                                                  endDate: endDate,
                                                  options: options) { [weak self] result in
                guard let self = self else { return }
                
                switch result {
                case .success(let statistics):
                    self.telemetryManager.trackEvent("StatisticsFetch.Completed")
                    completion(.success(statistics))
                    
                case .failure(let error):
                    self.errorLogger.log(.error, "Statistics fetch failed: \(error)")
                    completion(.failure(.queryFailed(error.localizedDescription)))
                }
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func setupBackgroundDelivery() {
        NotificationCenter.default.addObserver(self,
                                            selector: #selector(handleBackgroundDelivery(_:)),
                                            name: UIApplication.didEnterBackgroundNotification,
                                            object: nil)
    }
    
    @objc private func handleBackgroundDelivery(_ notification: Notification) {
        let backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.errorLogger.log(.warning, "Background delivery task expired")
        }
        
        // Process background updates
        operationQueue.async { [weak self] in
            guard let self = self else { return }
            
            let group = DispatchGroup()
            
            for type in HealthMetricType.allCases {
                group.enter()
                self.observeHealthData(type: type) { _ in
                    group.leave()
                }
            }
            
            group.notify(queue: self.operationQueue) {
                UIApplication.shared.endBackgroundTask(backgroundTask)
            }
        }
    }
}

// MARK: - Supporting Types

private class HealthMetricResult {
    let metrics: [HealthMetric]
    let timestamp: Date
    
    init(metrics: [HealthMetric], timestamp: Date) {
        self.metrics = metrics
        self.timestamp = timestamp
    }
}