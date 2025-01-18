//
// HealthBridgeModule.swift
// PHRSATHealthBridge
//
// Created by PHRSAT
// Copyright © 2023 PHRSAT. All rights reserved.
//

import Foundation // v14.0+
import React // v0.72+
import HealthKit // Latest

/// Thread-safe React Native bridge module for HealthKit integration with HIPAA compliance
@objc(HealthBridgeModule)
@objcMembers
class HealthBridgeModule: RCTEventEmitter {
    
    // MARK: - Properties
    
    /// HealthKit manager instance
    private let healthKitManager = HealthKitManager.shared
    
    /// Event emitter instance
    private let eventEmitter = HealthBridgeEventEmitter.shared
    
    /// Thread-safe initialization state
    private let isInitialized = Atomic<Bool>(false)
    
    /// Dedicated queue for processing health data
    private let processingQueue = DispatchQueue(label: "com.phrsat.healthbridge.processing",
                                              qos: .userInitiated)
    
    /// Lock for thread-safe data access
    private let dataLock = NSLock()
    
    /// Cache for health data
    private let dataCache = NSCache<NSString, NSData>()
    
    /// Retry manager for failed operations
    private let retryManager = RetryManager(maxAttempts: 3, baseDelay: 1.0)
    
    /// Metrics logger for telemetry
    private let metricsLogger = HealthMetricsLogger.shared
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        
        // Configure cache limits
        dataCache.countLimit = 100
        dataCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
        
        // Start metrics collection
        metricsLogger.startCollection()
    }
    
    // MARK: - RCTEventEmitter Overrides
    
    @objc static override func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func supportedEvents() -> [String] {
        return Events.allCases.map { $0.eventName }
    }
    
    // MARK: - Public Bridge Methods
    
    /// Initializes HealthKit integration with HIPAA compliance checks
    @objc func initialize(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        
        metricsLogger.logEvent("HealthBridgeInitialize.Started")
        
        // Verify device compatibility
        guard HKHealthStore.isHealthDataAvailable() else {
            let error = ErrorCodes.healthKitNotAvailable
            reject(String(error.rawValue),
                  error.message,
                  NSError(domain: "com.phrsat.healthbridge", code: error.rawValue))
            return
        }
        
        processingQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.healthKitManager.setupHealthKit { result in
                switch result {
                case .success:
                    self.isInitialized.value = true
                    self.eventEmitter.emitAuthorizationChange(true)
                    self.metricsLogger.logEvent("HealthBridgeInitialize.Completed")
                    resolve(true)
                    
                case .failure(let error):
                    self.metricsLogger.logError("HealthBridgeInitialize.Failed", error: error)
                    reject(String(ErrorCodes.authorizationDenied.rawValue),
                          error.localizedDescription,
                          error as NSError)
                }
            }
        }
    }
    
    /// Retrieves health data with caching and batch processing
    @objc func getHealthData(_ metricType: String,
                            startDate: Double,
                            endDate: Double,
                            resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        
        guard isInitialized.value else {
            let error = ErrorCodes.notInitialized
            reject(String(error.rawValue), error.message, nil)
            return
        }
        
        // Validate parameters
        guard let type = HealthMetricType.allCases.first(where: { $0.identifier == metricType }),
              startDate <= endDate,
              endDate <= Date().timeIntervalSince1970 else {
            let error = ErrorCodes.invalidParameters
            reject(String(error.rawValue), error.message, nil)
            return
        }
        
        processingQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Check cache
            let cacheKey = "\(metricType)_\(startDate)_\(endDate)" as NSString
            if let cachedData = self.dataCache.object(forKey: cacheKey) {
                resolve(try? JSONSerialization.jsonObject(with: cachedData as Data, options: []))
                return
            }
            
            let startDateTime = Date(timeIntervalSince1970: startDate)
            let endDateTime = Date(timeIntervalSince1970: endDate)
            
            self.healthKitManager.fetchHealthData(type: type,
                                                startDate: startDateTime,
                                                endDate: endDateTime) { result in
                switch result {
                case .success(let metrics):
                    // Convert metrics to dictionary format
                    let data = metrics.compactMap { metric -> [String: Any]? in
                        if case .success(let dict) = metric.toDictionary() {
                            return dict
                        }
                        return nil
                    }
                    
                    // Cache the results
                    if let jsonData = try? JSONSerialization.data(withJSONObject: data) {
                        self.dataCache.setObject(jsonData as NSData, forKey: cacheKey)
                    }
                    
                    self.metricsLogger.logEvent("HealthDataFetch.Completed",
                                              metadata: ["count": String(metrics.count)])
                    resolve(data)
                    
                case .failure(let error):
                    self.metricsLogger.logError("HealthDataFetch.Failed", error: error)
                    reject(String(ErrorCodes.queryFailed.rawValue),
                          error.localizedDescription,
                          error as NSError)
                }
            }
        }
    }
    
    /// Initiates background-aware HealthKit data observation
    @objc func startHealthKitObserving(_ resolve: @escaping RCTPromiseResolveBlock,
                                      reject: @escaping RCTPromiseRejectBlock) {
        
        guard isInitialized.value else {
            let error = ErrorCodes.notInitialized
            reject(String(error.rawValue), error.message, nil)
            return
        }
        
        let backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.metricsLogger.logEvent("HealthKitObserving.BackgroundTaskExpired")
        }
        
        processingQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Start observing each metric type
            let group = DispatchGroup()
            var observationErrors: [Error] = []
            
            for type in HealthMetricType.allCases {
                group.enter()
                
                self.healthKitManager.observeHealthData(type: type) { result in
                    switch result {
                    case .success(let metrics):
                        // Convert and emit metrics
                        let data = metrics.compactMap { metric -> [String: Any]? in
                            if case .success(let dict) = metric.toDictionary() {
                                return dict
                            }
                            return nil
                        }
                        
                        if !data.isEmpty {
                            self.eventEmitter.emitHealthDataUpdate(["metrics": data])
                        }
                        
                    case .failure(let error):
                        observationErrors.append(error)
                    }
                    
                    group.leave()
                }
            }
            
            group.notify(queue: self.processingQueue) {
                UIApplication.shared.endBackgroundTask(backgroundTask)
                
                if observationErrors.isEmpty {
                    self.metricsLogger.logEvent("HealthKitObserving.Started")
                    resolve(true)
                } else {
                    let error = observationErrors.first!
                    self.metricsLogger.logError("HealthKitObserving.Failed", error: error)
                    reject(String(ErrorCodes.queryFailed.rawValue),
                          error.localizedDescription,
                          error as NSError)
                }
            }
        }
    }
}

// MARK: - Thread-Safe Atomic Property Wrapper

private class Atomic<T> {
    private let queue = DispatchQueue(label: "com.phrsat.healthbridge.atomic")
    private var _value: T
    
    init(_ value: T) {
        self._value = value
    }
    
    var value: T {
        get {
            return queue.sync { _value }
        }
        set {
            queue.sync { _value = newValue }
        }
    }
}

// MARK: - RetryManager

private class RetryManager {
    let maxAttempts: UInt
    let baseDelay: TimeInterval
    
    init(maxAttempts: UInt, baseDelay: TimeInterval) {
        self.maxAttempts = maxAttempts
        self.baseDelay = baseDelay
    }
    
    func execute<T>(_ operation: @escaping () async throws -> T,
                    attempt: UInt = 0) async throws -> T {
        do {
            return try await operation()
        } catch {
            guard attempt < maxAttempts else { throw error }
            
            try await Task.sleep(nanoseconds: UInt64(baseDelay * pow(2, Double(attempt)) * 1_000_000_000))
            return try await execute(operation, attempt: attempt + 1)
        }
    }
}