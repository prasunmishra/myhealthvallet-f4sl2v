import Foundation // Latest
import BackgroundTasks // Latest

/// Manages background tasks and processing for the PHRSAT iOS application with enhanced reliability
public class BackgroundTaskManager {
    // MARK: - Constants
    
    /// Background task identifier for health data synchronization
    static let BACKGROUND_TASK_HEALTH_SYNC = "com.phrsat.healthbridge.healthsync"
    
    /// Minimum interval between background task executions (15 minutes)
    static let BACKGROUND_TASK_MIN_INTERVAL: TimeInterval = 900
    
    /// Maximum duration for background task execution (3 minutes)
    static let BACKGROUND_TASK_MAX_DURATION: TimeInterval = 180
    
    /// Battery threshold for low power mode (20%)
    static let BATTERY_THRESHOLD_LOW: Float = 0.2
    
    /// Maximum retry attempts for failed tasks
    static let MAX_RETRY_ATTEMPTS: Int = 3
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = BackgroundTaskManager()
    
    /// Background task scheduler instance
    private let scheduler: BGTaskScheduler
    
    /// HealthKit observer for background monitoring
    private let healthKitObserver: HealthKitObserverQuery
    
    /// HealthKit sync manager instance
    private let syncManager: HealthKitSyncManager
    
    /// Background task registration status
    private var isRegistered: Bool
    
    /// Retry counter for failed tasks
    private var retryCount: Int
    
    /// Current device battery level
    private var batteryLevel: Float
    
    /// Device low power mode status
    private var isLowPowerMode: Bool
    
    // MARK: - Initialization
    
    private init() {
        // Initialize core components
        self.scheduler = BGTaskScheduler.shared
        self.healthKitObserver = HealthKitObserverQuery(healthStore: HKHealthStore())
        self.syncManager = HealthKitSyncManager.shared
        
        // Initialize state
        self.isRegistered = false
        self.retryCount = 0
        
        // Initialize device monitoring
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        self.batteryLevel = device.batteryLevel
        self.isLowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
        
        // Setup observers
        setupPowerModeObserver()
        setupBatteryObserver()
    }
    
    // MARK: - Public Methods
    
    /// Registers background tasks with the system
    @discardableResult
    public func registerBackgroundTasks() -> Bool {
        guard !isRegistered else { return true }
        
        // Register health sync background task
        let registered = scheduler.register(forTaskWithIdentifier: Self.BACKGROUND_TASK_HEALTH_SYNC,
                                         using: nil) { [weak self] task in
            guard let self = self else {
                task.setTaskCompleted(success: false)
                return
            }
            
            self.handleHealthSync(task: task as! BGProcessingTask)
        }
        
        if registered {
            isRegistered = true
            scheduleHealthSync()
        }
        
        return registered
    }
    
    /// Schedules the next health data synchronization task
    public func scheduleHealthSync() {
        guard isRegistered else { return }
        
        // Check device conditions
        guard batteryLevel > Self.BATTERY_THRESHOLD_LOW && !isLowPowerMode else {
            return
        }
        
        // Create request
        let request = BGProcessingTaskRequest(identifier: Self.BACKGROUND_TASK_HEALTH_SYNC)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: Self.BACKGROUND_TASK_MIN_INTERVAL)
        
        do {
            try scheduler.submit(request)
        } catch {
            NSLog("Failed to schedule background task: \(error.localizedDescription)")
        }
    }
    
    /// Cancels all pending background tasks
    public func cancelAllPendingTasks() {
        scheduler.cancelAllTaskRequests()
        syncManager.stopSync()
        healthKitObserver.stopObserving()
        retryCount = 0
    }
    
    // MARK: - Private Methods
    
    private func handleHealthSync(task: BGProcessingTask) {
        // Set expiration handler
        task.expirationHandler = { [weak self] in
            self?.syncManager.stopSync()
            task.setTaskCompleted(success: false)
        }
        
        // Schedule next sync
        scheduleHealthSync()
        
        // Start health data sync
        syncManager.startSync { [weak self] result in
            guard let self = self else {
                task.setTaskCompleted(success: false)
                return
            }
            
            switch result {
            case .success:
                self.retryCount = 0
                task.setTaskCompleted(success: true)
                
            case .failure:
                if self.retryCount < Self.MAX_RETRY_ATTEMPTS {
                    self.retryCount += 1
                    self.scheduleHealthSync()
                }
                task.setTaskCompleted(success: false)
            }
        }
    }
    
    private func setupPowerModeObserver() {
        NotificationCenter.default.addObserver(self,
                                            selector: #selector(handlePowerModeChange),
                                            name: .NSProcessInfoPowerStateDidChange,
                                            object: nil)
    }
    
    private func setupBatteryObserver() {
        NotificationCenter.default.addObserver(self,
                                            selector: #selector(handleBatteryLevelChange),
                                            name: UIDevice.batteryLevelDidChangeNotification,
                                            object: nil)
    }
    
    @objc private func handlePowerModeChange() {
        isLowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
        if isLowPowerMode {
            cancelAllPendingTasks()
        } else {
            scheduleHealthSync()
        }
    }
    
    @objc private func handleBatteryLevelChange() {
        batteryLevel = UIDevice.current.batteryLevel
        if batteryLevel <= Self.BATTERY_THRESHOLD_LOW {
            cancelAllPendingTasks()
        } else if isRegistered {
            scheduleHealthSync()
        }
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}