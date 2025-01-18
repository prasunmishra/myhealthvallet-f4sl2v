//
// HealthKitAuthorization.swift
// PHRSATHealthBridge
//
// Created by PHRSAT
// Copyright © 2023 PHRSAT. All rights reserved.
//

import HealthKit // v14.0+
import Foundation // v14.0+

/// Represents possible errors during HealthKit authorization
public enum HealthKitError: Error {
    case healthKitNotAvailable
    case authorizationDenied
    case backgroundDeliveryFailure
    case permissionError
    case internalError
    
    var localizedDescription: String {
        switch self {
        case .healthKitNotAvailable:
            return "HealthKit is not available on this device"
        case .authorizationDenied:
            return "HealthKit authorization was denied"
        case .backgroundDeliveryFailure:
            return "Failed to enable background delivery"
        case .permissionError:
            return "Permission verification failed"
        case .internalError:
            return "An internal error occurred"
        }
    }
}

/// Represents the status of HealthKit permissions
public struct PermissionStatus {
    let readPermissionsGranted: Bool
    let writePermissionsGranted: Bool
    let backgroundDeliveryEnabled: Bool
}

/// Thread-safe singleton manager for handling HealthKit authorization
/// Implements HIPAA-compliant permission management and background delivery configuration
public class HealthKitAuthorizationManager {
    
    // MARK: - Properties
    
    /// Shared instance following singleton pattern
    public static let shared = HealthKitAuthorizationManager()
    
    /// HealthKit store instance for managing health data access
    private let healthStore = HKHealthStore()
    
    /// Serial queue for thread-safe authorization operations
    private let authQueue = DispatchQueue(label: "com.phrsat.healthkit.auth", qos: .userInitiated)
    
    // MARK: - Initialization
    
    private init() {
        // Private initializer to enforce singleton pattern
    }
    
    // MARK: - Public Methods
    
    /// Checks if HealthKit is available on the device
    /// - Returns: Boolean indicating HealthKit availability
    public func isHealthKitAvailable() -> Bool {
        return HKHealthStore.isHealthDataAvailable()
    }
    
    /// Requests HealthKit permissions with comprehensive error handling
    /// - Parameter completion: Closure called with the authorization result
    public func requestPermissions(completion: @escaping (Result<Bool, HealthKitError>) -> Void) {
        guard isHealthKitAvailable() else {
            completion(.failure(.healthKitNotAvailable))
            return
        }
        
        authQueue.async { [weak self] in
            guard let self = self else {
                completion(.failure(.internalError))
                return
            }
            
            let readTypes = HealthKitConstants.readPermissions
            let writeTypes = HealthKitConstants.writePermissions
            
            self.healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
                if let error = error {
                    NSLog("HealthKit authorization error: \(error.localizedDescription)")
                    completion(.failure(.authorizationDenied))
                    return
                }
                
                completion(.success(success))
            }
        }
    }
    
    /// Verifies existing HealthKit permissions
    /// - Parameter completion: Closure called with detailed permission status
    public func verifyPermissions(completion: @escaping (Result<PermissionStatus, HealthKitError>) -> Void) {
        authQueue.async { [weak self] in
            guard let self = self else {
                completion(.failure(.internalError))
                return
            }
            
            var readGranted = true
            var writeGranted = true
            
            // Verify read permissions
            for type in HealthKitConstants.readPermissions {
                let status = self.healthStore.authorizationStatus(for: type)
                if status != .sharingAuthorized {
                    readGranted = false
                    break
                }
            }
            
            // Verify write permissions
            for type in HealthKitConstants.writePermissions {
                let status = self.healthStore.authorizationStatus(for: type)
                if status != .sharingAuthorized {
                    writeGranted = false
                    break
                }
            }
            
            // Check background delivery status
            var backgroundEnabled = true
            for type in HealthKitConstants.backgroundDeliveryTypes {
                let status = self.healthStore.enabledBackgroundDelivery(for: type)
                if !status {
                    backgroundEnabled = false
                    break
                }
            }
            
            let status = PermissionStatus(
                readPermissionsGranted: readGranted,
                writePermissionsGranted: writeGranted,
                backgroundDeliveryEnabled: backgroundEnabled
            )
            
            completion(.success(status))
        }
    }
    
    /// Enables background delivery for specified health data types
    /// - Parameter completion: Closure called with background delivery configuration result
    public func enableBackgroundDelivery(completion: @escaping (Result<Bool, HealthKitError>) -> Void) {
        authQueue.async { [weak self] in
            guard let self = self else {
                completion(.failure(.internalError))
                return
            }
            
            let dispatchGroup = DispatchGroup()
            var configurationSuccess = true
            
            for quantityType in HealthKitConstants.backgroundDeliveryTypes {
                dispatchGroup.enter()
                
                self.healthStore.enableBackgroundDelivery(for: quantityType, frequency: .immediate) { success, error in
                    if !success || error != nil {
                        configurationSuccess = false
                        NSLog("Background delivery configuration failed for type: \(quantityType.identifier)")
                    }
                    dispatchGroup.leave()
                }
            }
            
            dispatchGroup.notify(queue: self.authQueue) {
                if configurationSuccess {
                    completion(.success(true))
                } else {
                    completion(.failure(.backgroundDeliveryFailure))
                }
            }
        }
    }
}