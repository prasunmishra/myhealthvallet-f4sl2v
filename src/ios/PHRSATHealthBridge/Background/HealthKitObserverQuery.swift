import HealthKit // Latest
import Foundation // Latest

/// Manages HealthKit observer queries for background health data monitoring with enhanced error handling and HIPAA compliance
@available(iOS 13.0, *)
public class HealthKitObserverQuery {
    // MARK: - Type Definitions
    
    /// Callback type for handling observer query updates
    public typealias ObserverQueryUpdateHandler = (HKObserverQuery, @escaping HKObserverQueryCompletionHandler, Error?) -> Void
    
    // MARK: - Constants
    
    private static let queryTimeoutInterval: TimeInterval = 30.0
    private static let maxRetryAttempts: Int = 3
    private static let retryDelayInterval: TimeInterval = 2.0
    
    // MARK: - Properties
    
    private let healthStore: HKHealthStore
    private var activeQueries: Set<HKObserverQuery>
    private var updateHandler: ObserverQueryUpdateHandler?
    private let queryLock: NSLock
    private var retryCount: Int
    private var isProcessingUpdate: Bool
    private let queryQueue: DispatchQueue
    private let logger = Logger(subsystem: "com.phrsat.healthbridge", category: "HealthKitObserverQuery")
    
    // MARK: - Initialization
    
    /// Initializes the HealthKit observer query manager
    /// - Parameter healthStore: The HealthKit store instance to use for queries
    public init(healthStore: HKHealthStore) {
        self.healthStore = healthStore
        self.activeQueries = Set()
        self.updateHandler = nil
        self.queryLock = NSLock()
        self.retryCount = 0
        self.isProcessingUpdate = false
        self.queryQueue = DispatchQueue(label: "com.phrsat.healthbridge.observerQueue",
                                      qos: .userInitiated)
        
        // Register for background task completion notifications
        NotificationCenter.default.addObserver(self,
                                            selector: #selector(handleBackgroundTaskExpiration),
                                            name: UIApplication.backgroundTaskExpirationNotification,
                                            object: nil)
    }
    
    // MARK: - Public Methods
    
    /// Starts observing changes for specified health metric types
    /// - Parameters:
    ///   - metricTypes: Set of health metric types to observe
    ///   - handler: Callback handler for updates
    /// - Returns: Result indicating success or failure
    public func startObserving(metricTypes: Set<HealthMetricType>,
                             handler: @escaping ObserverQueryUpdateHandler) -> Result<Void, Error> {
        queryLock.lock()
        defer { queryLock.unlock() }
        
        // Validate metric types
        for metricType in metricTypes {
            guard case .success = metricType.quantityType() else {
                logger.error("Invalid metric type: \(metricType.identifier)")
                return .failure(HealthKitError.typeUnavailable("Invalid metric type: \(metricType.identifier)"))
            }
        }
        
        // Store update handler
        updateHandler = handler
        
        // Create and start queries for each metric type
        for metricType in metricTypes {
            guard case .success(let quantityType) = metricType.quantityType() else { continue }
            
            let query = HKObserverQuery(sampleType: quantityType,
                                      predicate: nil) { [weak self] (query, completionHandler, error) in
                guard let self = self else { return }
                self.handleBackgroundDelivery(query: query,
                                            completionHandler: completionHandler,
                                            error: error)
            }
            
            // Enable background delivery
            do {
                try healthStore.enableBackgroundDelivery(for: quantityType,
                                                       frequency: .immediate)
                
                healthStore.execute(query)
                activeQueries.insert(query)
                
                logger.info("Started observing \(metricType.identifier)")
            } catch {
                logger.error("Failed to enable background delivery: \(error.localizedDescription)")
                return .failure(error)
            }
        }
        
        return .success(())
    }
    
    /// Stops all active health metric observations
    public func stopObserving() {
        queryLock.lock()
        defer { queryLock.unlock() }
        
        // Stop each active query
        for query in activeQueries {
            healthStore.stop(query)
            
            if let quantityType = query.objectType as? HKQuantityType {
                do {
                    try healthStore.disableBackgroundDelivery(for: quantityType)
                    logger.info("Stopped observing \(quantityType.identifier)")
                } catch {
                    logger.error("Failed to disable background delivery: \(error.localizedDescription)")
                }
            }
        }
        
        // Clean up
        activeQueries.removeAll()
        updateHandler = nil
        retryCount = 0
    }
    
    // MARK: - Private Methods
    
    private func handleBackgroundDelivery(query: HKObserverQuery,
                                        completionHandler: @escaping HKObserverQueryCompletionHandler,
                                        error: Error?) {
        // Prevent concurrent processing
        guard !isProcessingUpdate else {
            completionHandler()
            return
        }
        
        isProcessingUpdate = true
        
        // Start background task
        let backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.logger.warning("Background task expired")
            self?.isProcessingUpdate = false
            completionHandler()
        }
        
        queryQueue.async { [weak self] in
            guard let self = self else {
                UIApplication.shared.endBackgroundTask(backgroundTask)
                return
            }
            
            // Handle any errors
            if let error = error {
                self.logger.error("Observer query error: \(error.localizedDescription)")
                
                if self.retryCount < Self.maxRetryAttempts {
                    self.retryCount += 1
                    self.queryQueue.asyncAfter(deadline: .now() + Self.retryDelayInterval) {
                        self.handleBackgroundDelivery(query: query,
                                                    completionHandler: completionHandler,
                                                    error: error)
                    }
                } else {
                    self.updateHandler?(query, completionHandler, error)
                }
                
                self.isProcessingUpdate = false
                UIApplication.shared.endBackgroundTask(backgroundTask)
                return
            }
            
            // Reset retry count on successful update
            self.retryCount = 0
            
            // Call update handler
            self.updateHandler?(query, completionHandler, nil)
            
            self.isProcessingUpdate = false
            UIApplication.shared.endBackgroundTask(backgroundTask)
        }
    }
    
    @objc private func handleBackgroundTaskExpiration() {
        logger.warning("Background task expired, cleaning up resources")
        isProcessingUpdate = false
    }
    
    // MARK: - Deinitialization
    
    deinit {
        stopObserving()
        NotificationCenter.default.removeObserver(self)
    }
}