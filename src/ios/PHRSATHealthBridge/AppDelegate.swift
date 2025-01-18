//
// AppDelegate.swift
// PHRSATHealthBridge
//
// Created by PHRSAT
// Copyright © 2023 PHRSAT. All rights reserved.
//

import UIKit // Latest
import React // v0.72+

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    // MARK: - Properties
    
    /// Main application window
    var window: UIWindow?
    
    /// HealthKit configuration state
    private var isHealthKitConfigured: Bool = false
    
    /// Security configuration state
    private var isSecurityConfigured: Bool = false
    
    /// Bridge configuration state
    private var isBridgeConfigured: Bool = false
    
    /// Background processing queue
    private let backgroundQueue = DispatchQueue(label: "com.phrsat.background",
                                              qos: .userInitiated)
    
    /// Health manager instance
    private lazy var healthKitManager = HealthKitManager.shared
    
    /// Biometric authentication manager
    private lazy var biometricManager = BiometricAuthManager.shared
    
    /// React Native bridge module
    private lazy var bridgeModule = HealthBridgeModule.shared
    
    // MARK: - UIApplicationDelegate Methods
    
    func application(_ application: UIApplication,
                    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Configure window
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.backgroundColor = .white
        
        // Initialize security components
        configureSecurity { [weak self] success in
            guard success else {
                NSLog("[PHRSAT] Security configuration failed")
                return
            }
            self?.isSecurityConfigured = true
        }
        
        // Configure React Native bridge
        configureBridge(withLaunchOptions: launchOptions)
        
        // Setup HealthKit integration
        configureHealthKit()
        
        // Configure root view controller
        configureRootViewController()
        
        window?.makeKeyAndVisible()
        
        return true
    }
    
    func applicationWillResignActive(_ application: UIApplication) {
        // Secure UI when entering background
        window?.isHidden = true
        
        // Pause health monitoring
        healthKitManager.pauseHealthMonitoring()
        
        // Notify bridge of state change
        bridgeModule.emitStateChange("inactive")
        
        // Secure sensitive data
        backgroundQueue.async {
            self.secureSensitiveData()
        }
    }
    
    func applicationDidEnterBackground(_ application: UIApplication) {
        let taskID = application.beginBackgroundTask { [weak self] in
            self?.cleanupBackgroundTask()
        }
        
        backgroundQueue.async {
            // Encrypt cached data
            self.encryptCachedData()
            
            // Stop non-essential services
            self.healthKitManager.stopNonEssentialMonitoring()
            
            // Update security state
            self.biometricManager.invalidateContext()
            
            // Notify bridge
            self.bridgeModule.emitStateChange("background")
            
            application.endBackgroundTask(taskID)
        }
    }
    
    func applicationWillEnterForeground(_ application: UIApplication) {
        // Validate security session
        biometricManager.authenticateUser { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success:
                self.restoreSecureState()
                self.healthKitManager.resumeHealthMonitoring()
                self.bridgeModule.emitStateChange("foreground")
                
            case .failure:
                self.handleAuthenticationFailure()
            }
        }
    }
    
    func applicationDidBecomeActive(_ application: UIApplication) {
        // Show UI
        window?.isHidden = false
        
        // Revalidate security
        validateSecurityState()
        
        // Resume health monitoring
        healthKitManager.startHealthMonitoring()
        
        // Update bridge state
        bridgeModule.emitStateChange("active")
    }
    
    // MARK: - Private Configuration Methods
    
    private func configureSecurity(completion: @escaping (Bool) -> Void) {
        biometricManager.canUseBiometrics().map { available in
            if available {
                biometricManager.configureBiometrics { result in
                    switch result {
                    case .success:
                        completion(true)
                    case .failure(let error):
                        NSLog("[PHRSAT] Biometric configuration failed: \(error)")
                        completion(false)
                    }
                }
            } else {
                completion(false)
            }
        }
    }
    
    private func configureBridge(withLaunchOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
        guard let bridge = RCTBridge(delegate: self, launchOptions: launchOptions) else {
            NSLog("[PHRSAT] Failed to initialize React Native bridge")
            return
        }
        
        bridgeModule.configureBridge(bridge) { [weak self] success in
            self?.isBridgeConfigured = success
        }
    }
    
    private func configureHealthKit() {
        healthKitManager.setupHealthKit { [weak self] result in
            switch result {
            case .success:
                self?.isHealthKitConfigured = true
                self?.healthKitManager.requestAuthorization { _ in
                    self?.healthKitManager.startHealthMonitoring()
                }
            case .failure(let error):
                NSLog("[PHRSAT] HealthKit configuration failed: \(error)")
            }
        }
    }
    
    private func configureRootViewController() {
        guard let bridge = bridgeModule.bridge else {
            NSLog("[PHRSAT] Bridge not initialized")
            return
        }
        
        let rootView = RCTRootView(
            bridge: bridge,
            moduleName: "PHRSAT",
            initialProperties: nil
        )
        
        let rootViewController = UIViewController()
        rootViewController.view = rootView
        window?.rootViewController = rootViewController
    }
    
    // MARK: - Private Helper Methods
    
    private func secureSensitiveData() {
        // Implement secure data persistence
    }
    
    private func encryptCachedData() {
        // Implement cache encryption
    }
    
    private func cleanupBackgroundTask() {
        // Cleanup background operations
    }
    
    private func restoreSecureState() {
        // Restore secure application state
    }
    
    private func handleAuthenticationFailure() {
        // Handle failed authentication
    }
    
    private func validateSecurityState() {
        // Validate security components
    }
}

// MARK: - RCTBridgeDelegate

extension AppDelegate: RCTBridgeDelegate {
    func sourceURL(for bridge: RCTBridge!) -> URL! {
        #if DEBUG
        return RCTBundleURLProvider.sharedSettings()?.jsBundleURL(forBundleRoot: "index")
        #else
        return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
        #endif
    }
}