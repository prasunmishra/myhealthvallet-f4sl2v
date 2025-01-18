import Foundation // Latest
import HealthKit // Latest

/// Manages background synchronization of HealthKit data with comprehensive error handling and monitoring
public class HealthKitSyncManager {
    // MARK: - Constants
    
    private let SYNC_INTERVAL: TimeInterval = 3600.0
    private let MAX_RETRY_ATTEMPTS: Int = 3
    private let BATCH_SIZE: Int = 100
    private let NETWORK_TIMEOUT: TimeInterval = 30.0
    private let MIN_BATTERY_LEVEL: Float = 0.2
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = HealthKitSyncManager()
    
    /// Core HealthKit manager instance
    private let healthKitManager: HealthKitManager
    
    /// Serial queue for sync operations
    private let syncQueue: DispatchQueue
    
    /// Timer for periodic sync
    private var syncTimer: Timer?
    
    /// Last sync dates per metric type
    private var lastSyncDates: [HealthMetricType: Date]
    
    /// Retry attempts per metric type
    private var retryAttempts: [HealthMetricType: Int]
    
    /// Network reachability monitor
    private let reachability: NetworkReachability
    
    /// Metrics collector for monitoring
    private let metricsCollector: SyncMetricsCollector
    
    /// Data compression manager
    private let compressionManager: DataCompressionManager
    
    /// Conflict resolution handler
    private let conflictHandler: ConflictResolutionHandler
    
    /// Background task identifier
    private var backgroundTaskId: UIBackgroundTaskIdentifier?
    
    // MARK: - Initialization
    
    private init() {
        // Initialize core components
        self.healthKitManager = HealthKitManager.shared
        self.syncQueue = DispatchQueue(label: "com.phrsat.healthkit.sync", qos: .utility)
        self.lastSyncDates = [:]
        self.retryAttempts = [:]
        
        // Initialize monitoring components
        self.reachability = NetworkReachability()
        self.metricsCollector = SyncMetricsCollector()
        self.compressionManager = DataCompressionManager()
        self.conflictHandler = ConflictResolutionHandler()
        
        // Setup observers
        setupBatteryMonitoring()
        setupBackgroundTaskHandling()
    }
    
    // MARK: - Public Methods
    
    /// Starts periodic background synchronization with intelligent scheduling
    public func startSync(config: SyncConfiguration? = nil) {
        syncQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Stop existing sync if running
            self.stopSync()
            
            // Apply configuration
            let interval = config?.syncInterval ?? self.SYNC_INTERVAL
            
            // Create sync timer
            self.syncTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
                self?.performSync(priority: .normal) { _ in }
            }
            
            // Perform initial sync
            self.performSync(priority: .high) { _ in }
            
            // Setup observers for real-time updates
            self.setupHealthKitObservers()
            
            // Start metrics collection
            self.metricsCollector.startCollection()
        }
    }
    
    /// Stops background synchronization and performs cleanup
    public func stopSync() {
        syncQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Invalidate timer
            self.syncTimer?.invalidate()
            self.syncTimer = nil
            
            // Remove observers
            self.removeHealthKitObservers()
            
            // End background task if active
            if let taskId = self.backgroundTaskId {
                UIApplication.shared.endBackgroundTask(taskId)
                self.backgroundTaskId = nil
            }
            
            // Stop metrics collection
            self.metricsCollector.stopCollection()
        }
    }
    
    /// Performs intelligent synchronization for all health metric types
    public func performSync(priority: SyncPriority, completion: @escaping (Result<SyncStats, Error>) -> Void) {
        syncQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Check device conditions
            guard self.canPerformSync() else {
                completion(.failure(SyncError.deviceConditionsNotMet))
                return
            }
            
            // Start background task
            self.beginBackgroundTask()
            
            // Get supported metric types
            guard case .success(let types) = HealthMetricType.allTypes() else {
                self.endBackgroundTask()
                completion(.failure(SyncError.healthKitError))
                return
            }
            
            let group = DispatchGroup()
            var syncErrors: [Error] = []
            var syncStats = SyncStats()
            
            // Process each metric type
            for type in types {
                group.enter()
                
                self.syncMetricType(type, priority: priority) { result in
                    switch result {
                    case .success(let stats):
                        syncStats.merge(with: stats)
                    case .failure(let error):
                        syncErrors.append(error)
                    }
                    group.leave()
                }
            }
            
            // Handle completion
            group.notify(queue: self.syncQueue) { [weak self] in
                guard let self = self else { return }
                
                // Update metrics
                self.metricsCollector.recordSyncCompletion(stats: syncStats, errors: syncErrors)
                
                // End background task
                self.endBackgroundTask()
                
                // Return result
                if syncErrors.isEmpty {
                    completion(.success(syncStats))
                } else {
                    completion(.failure(SyncError.partialFailure(syncErrors)))
                }
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func canPerformSync() -> Bool {
        // Check network reachability
        guard reachability.isReachable else { return false }
        
        // Check battery level
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        guard device.batteryLevel > MIN_BATTERY_LEVEL else { return false }
        
        return true
    }
    
    private func syncMetricType(_ type: HealthMetricType, priority: SyncPriority, completion: @escaping (Result<SyncStats, Error>) -> Void) {
        // Get last sync date
        let lastSync = lastSyncDates[type] ?? Date.distantPast
        
        // Fetch health data
        healthKitManager.fetchHealthData(type: type, startDate: lastSync, endDate: Date()) { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let metrics):
                // Compress data
                let compressedMetrics = self.compressionManager.compressMetrics(metrics)
                
                // Process in batches
                self.processBatches(of: compressedMetrics, type: type) { batchResult in
                    switch batchResult {
                    case .success(let stats):
                        // Update last sync date
                        self.lastSyncDates[type] = Date()
                        self.retryAttempts[type] = 0
                        completion(.success(stats))
                        
                    case .failure(let error):
                        // Handle retry logic
                        self.handleSyncError(error, for: type) { shouldRetry in
                            if shouldRetry {
                                self.syncMetricType(type, priority: priority, completion: completion)
                            } else {
                                completion(.failure(error))
                            }
                        }
                    }
                }
                
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }
    
    private func processBatches(of metrics: [HealthMetric], type: HealthMetricType, completion: @escaping (Result<SyncStats, Error>) -> Void) {
        let batches = stride(from: 0, to: metrics.count, by: BATCH_SIZE).map {
            Array(metrics[$0..<min($0 + BATCH_SIZE, metrics.count)])
        }
        
        var stats = SyncStats()
        let group = DispatchGroup()
        var batchErrors: [Error] = []
        
        for batch in batches {
            group.enter()
            
            uploadBatch(batch, type: type) { result in
                switch result {
                case .success(let batchStats):
                    stats.merge(with: batchStats)
                case .failure(let error):
                    batchErrors.append(error)
                }
                group.leave()
            }
        }
        
        group.notify(queue: syncQueue) {
            if batchErrors.isEmpty {
                completion(.success(stats))
            } else {
                completion(.failure(SyncError.batchUploadFailed(batchErrors)))
            }
        }
    }
    
    private func handleSyncError(_ error: Error, for type: HealthMetricType, completion: @escaping (Bool) -> Void) {
        let attempts = retryAttempts[type] ?? 0
        
        if attempts < MAX_RETRY_ATTEMPTS {
            retryAttempts[type] = attempts + 1
            
            // Exponential backoff
            let delay = TimeInterval(pow(2.0, Double(attempts))) * 1.0
            syncQueue.asyncAfter(deadline: .now() + delay) {
                completion(true)
            }
        } else {
            completion(false)
        }
    }
    
    private func setupHealthKitObservers() {
        guard case .success(let types) = HealthMetricType.allTypes() else { return }
        
        for type in types {
            healthKitManager.observeHealthData(type: type) { [weak self] result in
                guard let self = self else { return }
                
                switch result {
                case .success(let metrics):
                    self.handleRealtimeUpdate(metrics, type: type)
                case .failure(let error):
                    self.metricsCollector.recordError(error)
                }
            }
        }
    }
    
    private func handleRealtimeUpdate(_ metrics: [HealthMetric], type: HealthMetricType) {
        // Process real-time updates with high priority
        syncQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.processBatches(of: metrics, type: type) { result in
                switch result {
                case .success(let stats):
                    self.metricsCollector.recordRealtimeUpdate(stats: stats)
                case .failure(let error):
                    self.metricsCollector.recordError(error)
                }
            }
        }
    }
    
    private func beginBackgroundTask() {
        backgroundTaskId = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.endBackgroundTask()
        }
    }
    
    private func endBackgroundTask() {
        if let taskId = backgroundTaskId {
            UIApplication.shared.endBackgroundTask(taskId)
            backgroundTaskId = nil
        }
    }
    
    private func setupBatteryMonitoring() {
        NotificationCenter.default.addObserver(self,
                                            selector: #selector(handleBatteryLevelChange),
                                            name: UIDevice.batteryLevelDidChangeNotification,
                                            object: nil)
        UIDevice.current.isBatteryMonitoringEnabled = true
    }
    
    @objc private func handleBatteryLevelChange() {
        let batteryLevel = UIDevice.current.batteryLevel
        if batteryLevel <= MIN_BATTERY_LEVEL {
            stopSync()
        }
    }
    
    private func setupBackgroundTaskHandling() {
        NotificationCenter.default.addObserver(self,
                                            selector: #selector(handleAppBackground),
                                            name: UIApplication.didEnterBackgroundNotification,
                                            object: nil)
    }
    
    @objc private func handleAppBackground() {
        beginBackgroundTask()
        performSync(priority: .background) { [weak self] _ in
            self?.endBackgroundTask()
        }
    }
}

// MARK: - Supporting Types

private enum SyncError: Error {
    case deviceConditionsNotMet
    case healthKitError
    case batchUploadFailed([Error])
    case partialFailure([Error])
}

private enum SyncPriority {
    case high
    case normal
    case background
}

private struct SyncStats {
    var recordsProcessed: Int = 0
    var bytesTransferred: Int = 0
    var syncDuration: TimeInterval = 0
    
    mutating func merge(with other: SyncStats) {
        recordsProcessed += other.recordsProcessed
        bytesTransferred += other.bytesTransferred
        syncDuration += other.syncDuration
    }
}