//
// PermissionUtils.swift
// PHRSATHealthBridge
//
// Created by PHRSAT
// Copyright © 2023 PHRSAT. All rights reserved.
//

import Foundation
import Photos
import AVFoundation
import LocalAuthentication

/// Thread-safe utility class for managing various application permissions with HIPAA compliance
public class PermissionUtils {
    
    // MARK: - Properties
    
    /// Singleton instance
    public static let shared = PermissionUtils()
    
    /// Context for biometric authentication
    private let biometricContext = LAContext()
    
    /// HealthKit authorization manager instance
    private let healthKitAuth = HealthKitAuthorizationManager.shared
    
    /// Serial queue for thread-safe permission operations
    private let permissionQueue = DispatchQueue(label: "com.phrsat.permissions", qos: .userInitiated)
    
    /// Cache for storing permission states
    private var permissionCache: [String: Bool] = [:]
    
    // MARK: - Initialization
    
    private init() {
        // Private initializer to enforce singleton pattern
        setupPermissionObservers()
    }
    
    // MARK: - Permission Management
    
    /// Checks and requests HealthKit permissions with HIPAA compliance
    /// - Parameter completion: Closure called with permission status and potential error
    public func checkHealthKitPermissions(completion: @escaping (Bool, Error?) -> Void) {
        permissionQueue.async { [weak self] in
            guard let self = self else {
                completion(false, HealthKitError.internalError)
                return
            }
            
            // First verify existing permissions
            self.healthKitAuth.verifyPermissions { result in
                switch result {
                case .success(let status):
                    if status.readPermissionsGranted && status.writePermissionsGranted {
                        self.updatePermissionCache(for: "healthkit", status: true)
                        completion(true, nil)
                        return
                    }
                    
                    // Request permissions if not already granted
                    self.healthKitAuth.requestPermissions { result in
                        switch result {
                        case .success(let granted):
                            self.updatePermissionCache(for: "healthkit", status: granted)
                            completion(granted, nil)
                        case .failure(let error):
                            self.updatePermissionCache(for: "healthkit", status: false)
                            completion(false, error)
                        }
                    }
                    
                case .failure(let error):
                    self.updatePermissionCache(for: "healthkit", status: false)
                    completion(false, error)
                }
            }
        }
    }
    
    /// Checks and requests camera permission with enhanced security
    /// - Parameter completion: Closure called with camera permission status
    public func checkCameraPermission(completion: @escaping (Bool) -> Void) {
        permissionQueue.async { [weak self] in
            guard let self = self else {
                completion(false)
                return
            }
            
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            
            switch status {
            case .authorized:
                self.updatePermissionCache(for: "camera", status: true)
                completion(true)
                
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    self.updatePermissionCache(for: "camera", status: granted)
                    completion(granted)
                }
                
            case .denied, .restricted:
                self.updatePermissionCache(for: "camera", status: false)
                completion(false)
                
            @unknown default:
                self.updatePermissionCache(for: "camera", status: false)
                completion(false)
            }
        }
    }
    
    /// Checks and requests photo library permission with enhanced security
    /// - Parameter completion: Closure called with photo library permission status
    public func checkPhotoLibraryPermission(completion: @escaping (Bool) -> Void) {
        permissionQueue.async { [weak self] in
            guard let self = self else {
                completion(false)
                return
            }
            
            let status = PHPhotoLibrary.authorizationStatus()
            
            switch status {
            case .authorized, .limited:
                self.updatePermissionCache(for: "photos", status: true)
                completion(true)
                
            case .notDetermined:
                PHPhotoLibrary.requestAuthorization { status in
                    let granted = status == .authorized || status == .limited
                    self.updatePermissionCache(for: "photos", status: granted)
                    completion(granted)
                }
                
            case .denied, .restricted:
                self.updatePermissionCache(for: "photos", status: false)
                completion(false)
                
            @unknown default:
                self.updatePermissionCache(for: "photos", status: false)
                completion(false)
            }
        }
    }
    
    /// Checks if biometric authentication is available with security validation
    /// - Returns: Boolean indicating biometric authentication availability
    public func checkBiometricAvailability() -> Bool {
        var error: NSError?
        let canEvaluate = biometricContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        
        if let error = error {
            NSLog("Biometric availability check failed: \(error.localizedDescription)")
            return false
        }
        
        return canEvaluate
    }
    
    /// Requests biometric authentication with enhanced security measures
    /// - Parameter completion: Closure called with authentication result and potential error
    public func requestBiometricAuth(completion: @escaping (Bool, Error?) -> Void) {
        guard checkBiometricAvailability() else {
            completion(false, LAError(.biometryNotAvailable))
            return
        }
        
        biometricContext.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: SecurityConstants.Authentication.kBiometricAuthReason
        ) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    NSLog("Biometric authentication failed: \(error.localizedDescription)")
                }
                completion(success, error)
            }
        }
    }
    
    // MARK: - Private Helpers
    
    /// Updates the permission cache in a thread-safe manner
    private func updatePermissionCache(for permission: String, status: Bool) {
        permissionQueue.async { [weak self] in
            self?.permissionCache[permission] = status
        }
    }
    
    /// Sets up observers for permission changes
    private func setupPermissionObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePermissionChange(_:)),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }
    
    /// Handles permission change notifications
    @objc private func handlePermissionChange(_ notification: Notification) {
        // Refresh permission cache when app becomes active
        permissionQueue.async { [weak self] in
            self?.permissionCache.removeAll()
        }
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}