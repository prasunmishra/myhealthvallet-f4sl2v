//
// HealthBridgeConstants.swift
// PHRSATHealthBridge
//
// Created by PHRSAT
// Copyright © 2023 PHRSAT. All rights reserved.
//

import Foundation // v14.0+
import HealthKitConstants

/// Defines event types for React Native bridge communication
/// - Note: Ensures type safety and standardization in bridge events
@objc public enum Events: Int, CaseIterable {
    /// Emitted when new health data is available
    case healthDataUpdate
    /// Emitted when HealthKit authorization status changes
    case authorizationChange
    /// Emitted during health data synchronization progress
    case syncProgress
    /// Emitted when health data synchronization completes
    case syncComplete
    /// Emitted when an error occurs during synchronization
    case syncError
    
    /// String representation of event names for React Native
    public var eventName: String {
        switch self {
        case .healthDataUpdate:
            return "onHealthDataUpdate"
        case .authorizationChange:
            return "onAuthorizationChange"
        case .syncProgress:
            return "onSyncProgress"
        case .syncComplete:
            return "onSyncComplete"
        case .syncError:
            return "onSyncError"
        }
    }
}

/// Defines error codes for React Native bridge error handling
/// - Note: Implements HIPAA-compliant error messaging
@objc public enum ErrorCodes: Int, CaseIterable {
    /// Bridge module not properly initialized
    case notInitialized
    /// HealthKit authorization was denied by user
    case authorizationDenied
    /// HealthKit is not available on the device
    case healthKitNotAvailable
    /// Invalid parameters provided to bridge method
    case invalidParameters
    /// Health data synchronization failed
    case syncFailed
    /// Health data query operation failed
    case queryFailed
    
    /// Human-readable error messages
    public var message: String {
        switch self {
        case .notInitialized:
            return "Health bridge module is not initialized"
        case .authorizationDenied:
            return "HealthKit authorization was denied"
        case .healthKitNotAvailable:
            return "HealthKit is not available on this device"
        case .invalidParameters:
            return "Invalid parameters provided"
        case .syncFailed:
            return "Health data synchronization failed"
        case .queryFailed:
            return "Health data query failed"
        }
    }
}

/// Defines method names exposed through the React Native bridge
/// - Note: Ensures consistent method naming across bridge interface
@objc public enum Methods: Int, CaseIterable {
    /// Request HealthKit authorization
    case requestAuthorization
    /// Start HealthKit data synchronization
    case startHealthKitSync
    /// Retrieve health data
    case getHealthData
    /// Stop HealthKit data synchronization
    case stopHealthKitSync
    
    /// String representation of method names for React Native
    public var methodName: String {
        switch self {
        case .requestAuthorization:
            return "requestAuthorization"
        case .startHealthKitSync:
            return "startHealthKitSync"
        case .getHealthData:
            return "getHealthData"
        case .stopHealthKitSync:
            return "stopHealthKitSync"
        }
    }
}

/// Bridge configuration constants
/// - Note: Centralizes bridge module configuration
public struct BridgeConstants {
    /// React Native bridge module name
    public static let moduleName: String = "HealthBridgeModule"
    
    /// React Native event emitter name
    public static let eventEmitterName: String = "HealthBridgeEvents"
    
    /// Private initializer to prevent instantiation
    private init() {}
}

// MARK: - Bridge Type Extensions

extension Events: CustomStringConvertible {
    public var description: String {
        return eventName
    }
}

extension ErrorCodes: CustomStringConvertible {
    public var description: String {
        return message
    }
}

extension Methods: CustomStringConvertible {
    public var description: String {
        return methodName
    }
}