//
// EventEmitter.swift
// PHRSATHealthBridge
//
// Created by PHRSAT
// Copyright © 2023 PHRSAT. All rights reserved.
//

import Foundation // v14.0+
import React // v0.72+

/// Thread-safe, HIPAA-compliant event emitter for bridging native iOS health events to React Native
@objc(HealthBridgeEventEmitter)
@objcMembers
class HealthBridgeEventEmitter: RCTEventEmitter {
    
    // MARK: - Properties
    
    /// Singleton instance for thread-safe access
    private static var _shared: HealthBridgeEventEmitter?
    private static let sharedInstanceLock = NSLock()
    
    /// Thread-safe listener state tracking
    private var hasListeners: Bool {
        get { return _hasListeners.value }
        set { _hasListeners.value = newValue }
    }
    private let _hasListeners = Atomic<Bool>(false)
    
    /// Dedicated serial queue for event emission
    private let eventQueue: DispatchQueue
    
    /// Synchronization lock for event emission
    private let emissionLock: NSLock
    
    /// Retry configuration for failed emissions
    private let maxRetryAttempts: UInt = 3
    private let retryDelay: TimeInterval = 1.0
    
    // MARK: - Initialization
    
    private override init() {
        eventQueue = DispatchQueue(label: "com.phrsat.healthbridge.events",
                                 qos: .userInitiated,
                                 attributes: [],
                                 autoreleaseFrequency: .workItem,
                                 target: nil)
        
        emissionLock = NSLock()
        super.init()
    }
    
    // MARK: - Singleton Access
    
    /// Thread-safe singleton instance accessor
    @objc static var shared: HealthBridgeEventEmitter {
        sharedInstanceLock.lock()
        defer { sharedInstanceLock.unlock() }
        
        if _shared == nil {
            _shared = HealthBridgeEventEmitter()
        }
        return _shared!
    }
    
    // MARK: - RCTEventEmitter Overrides
    
    /// Required override providing supported event names
    override func supportedEvents() -> [String] {
        return Events.allCases.map { $0.eventName }
    }
    
    override func startObserving() {
        hasListeners = true
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    // MARK: - Event Emission Methods
    
    /// Emits HIPAA-compliant health data updates with retry mechanism
    func emitHealthDataUpdate(_ data: [String: Any]) {
        guard let sanitizedData = sanitizeHealthData(data) else {
            NSLog("[HealthBridge] Failed to sanitize health data")
            return
        }
        
        emitEvent(.healthDataUpdate, body: sanitizedData)
    }
    
    /// Emits HealthKit authorization status changes
    func emitAuthorizationChange(_ isAuthorized: Bool) {
        emitEvent(.authorizationChange, body: ["isAuthorized": isAuthorized])
    }
    
    /// Emits sync progress updates
    func emitSyncProgress(_ progress: Double) {
        emitEvent(.syncProgress, body: ["progress": progress])
    }
    
    /// Emits sync completion status
    func emitSyncComplete(_ success: Bool, error: Error? = nil) {
        var body: [String: Any] = ["success": success]
        if let error = error {
            body["error"] = error.localizedDescription
        }
        emitEvent(.syncComplete, body: body)
    }
    
    // MARK: - Private Methods
    
    /// Thread-safe event emission with retry mechanism
    private func emitEvent(_ event: Events, body: [String: Any], attempt: UInt = 0) {
        guard hasListeners else {
            NSLog("[HealthBridge] No listeners registered for events")
            return
        }
        
        emissionLock.lock()
        defer { emissionLock.unlock() }
        
        eventQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                try self.validateEventData(body)
                self.sendEvent(withName: event.eventName, body: body)
                self.logEventEmission(event, body: body)
            } catch {
                NSLog("[HealthBridge] Error emitting event: \(error.localizedDescription)")
                
                if attempt < self.maxRetryAttempts {
                    DispatchQueue.global().asyncAfter(deadline: .now() + self.retryDelay) {
                        self.emitEvent(event, body: body, attempt: attempt + 1)
                    }
                }
            }
        }
    }
    
    /// Validates and sanitizes health data for HIPAA compliance
    private func sanitizeHealthData(_ data: [String: Any]) -> [String: Any]? {
        // Remove any potential PII from the data
        var sanitized = data
        let piiKeys = ["name", "email", "phone", "address", "ssn", "mrn"]
        piiKeys.forEach { sanitized.removeValue(forKey: $0) }
        
        // Validate data structure
        guard validateHealthDataStructure(sanitized) else {
            return nil
        }
        
        return sanitized
    }
    
    /// Validates health data structure
    private func validateHealthDataStructure(_ data: [String: Any]) -> Bool {
        // Ensure required fields are present and have correct types
        guard let metrics = data["metrics"] as? [[String: Any]] else {
            return false
        }
        
        return metrics.allSatisfy { metric in
            guard let identifier = metric["identifier"] as? String,
                  let value = metric["value"] as? Double,
                  let unit = metric["unit"] as? String,
                  let timestamp = metric["timestamp"] as? TimeInterval else {
                return false
            }
            
            return HealthKitMetricIdentifier.allCases.map({ "\($0)" }).contains(identifier)
        }
    }
    
    /// Validates event data for security
    private func validateEventData(_ data: [String: Any]) throws {
        // Implement validation logic based on event type
        guard JSONSerialization.isValidJSONObject(data) else {
            throw NSError(domain: "com.phrsat.healthbridge",
                         code: ErrorCodes.invalidParameters.rawValue,
                         userInfo: [NSLocalizedDescriptionKey: "Invalid event data format"])
        }
    }
    
    /// Logs event emission for audit purposes
    private func logEventEmission(_ event: Events, body: [String: Any]) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        NSLog("[HealthBridge] Event emitted - Type: \(event.eventName), Timestamp: \(timestamp)")
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