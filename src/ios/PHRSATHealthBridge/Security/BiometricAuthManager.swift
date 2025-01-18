//
// BiometricAuthManager.swift
// PHRSATHealthBridge
//
// Thread-safe singleton class managing biometric authentication with enhanced
// security features including attempt tracking and context management
//
// Version: 1.0
// iOS Deployment Target: 14.0+
//

import Foundation // v14.0+
import LocalAuthentication // v14.0+

/// Enumeration of possible biometric authentication errors
public enum BiometricError: Error {
    case maxAttemptsExceeded
    case contextInvalidated
    case biometricsNotAvailable
    case biometricsNotEnrolled
    case authenticationFailed
    case systemCancel
    case userCancel
    case internalError
}

/// Thread-safe singleton class managing biometric authentication
public final class BiometricAuthManager {
    
    // MARK: - Singleton Instance
    
    /// Shared singleton instance
    public static let shared = BiometricAuthManager()
    
    // MARK: - Private Properties
    
    /// Authentication context for biometric operations
    private var context: LAContext
    
    /// Counter for failed authentication attempts
    private var authAttempts: Int
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Timestamp of last authentication attempt
    private var lastAuthTime: TimeInterval
    
    /// Timer for automatic context invalidation
    private var contextInvalidationTimer: Timer?
    
    /// Key for storing authentication attempts in keychain
    private let attemptsKey = "biometric_auth_attempts"
    
    // MARK: - Initialization
    
    private init() {
        self.context = LAContext()
        self.queue = DispatchQueue(label: "com.phrsat.biometric", qos: .userInitiated)
        self.lastAuthTime = Date().timeIntervalSince1970
        
        // Load stored auth attempts or initialize to 0
        let storedAttempts = KeychainManager.shared.loadData(forKey: attemptsKey)
        switch storedAttempts {
        case .success(let data):
            self.authAttempts = Int(data[0])
        case .failure(_):
            self.authAttempts = 0
        }
        
        // Configure context with enhanced security
        context.touchIDAuthenticationAllowableReuseDuration = 0
        context.localizedFallbackTitle = ""
        
        // Set up context invalidation timer
        setupContextInvalidationTimer()
    }
    
    // MARK: - Public Methods
    
    /// Checks if biometric authentication is available
    /// - Returns: Result indicating availability or specific error
    public func canUseBiometrics() -> Result<Bool, BiometricError> {
        return queue.sync {
            var error: NSError?
            let canEvaluate = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
            
            if let error = error as? LAError {
                switch error.code {
                case .biometryNotAvailable:
                    return .failure(.biometricsNotAvailable)
                case .biometryNotEnrolled:
                    return .failure(.biometricsNotEnrolled)
                default:
                    return .failure(.internalError)
                }
            }
            
            return .success(canEvaluate)
        }
    }
    
    /// Performs biometric authentication with attempt tracking
    /// - Parameter completion: Callback with authentication result
    public func authenticateUser(completion: @escaping (Result<Bool, BiometricError>) -> Void) {
        queue.async { [weak self] in
            guard let self = self else {
                completion(.failure(.internalError))
                return
            }
            
            // Check for max attempts exceeded
            if self.authAttempts >= SecurityConstants.Authentication.kMaxAuthAttempts {
                let timeSinceLastAttempt = Date().timeIntervalSince1970 - self.lastAuthTime
                if timeSinceLastAttempt < SecurityConstants.Authentication.kAuthLockoutDuration {
                    completion(.failure(.maxAttemptsExceeded))
                    return
                }
                self.resetAuthAttempts()
            }
            
            // Verify context validity
            if self.context.invalidated {
                self.invalidateContext()
            }
            
            // Perform authentication
            self.context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: SecurityConstants.Authentication.kBiometricAuthReason
            ) { success, error in
                self.queue.async {
                    if success {
                        self.resetAuthAttempts()
                        completion(.success(true))
                    } else {
                        self.handleAuthenticationError(error, completion: completion)
                    }
                }
            }
        }
    }
    
    /// Resets the authentication attempts counter
    public func resetAuthAttempts() {
        queue.async {
            self.authAttempts = 0
            self.lastAuthTime = Date().timeIntervalSince1970
            
            // Persist reset attempts
            let data = Data([UInt8(self.authAttempts)])
            _ = KeychainManager.shared.saveData(data, forKey: self.attemptsKey)
        }
    }
    
    /// Invalidates the current authentication context
    public func invalidateContext() {
        queue.async {
            self.context.invalidate()
            self.context = LAContext()
            self.context.touchIDAuthenticationAllowableReuseDuration = 0
            self.context.localizedFallbackTitle = ""
            self.setupContextInvalidationTimer()
        }
    }
    
    // MARK: - Private Methods
    
    private func handleAuthenticationError(_ error: Error?, completion: @escaping (Result<Bool, BiometricError>) -> Void) {
        guard let error = error as? LAError else {
            completion(.failure(.internalError))
            return
        }
        
        self.authAttempts += 1
        self.lastAuthTime = Date().timeIntervalSince1970
        
        // Persist updated attempts
        let data = Data([UInt8(self.authAttempts)])
        _ = KeychainManager.shared.saveData(data, forKey: self.attemptsKey)
        
        switch error.code {
        case .userCancel:
            completion(.failure(.userCancel))
        case .systemCancel:
            completion(.failure(.systemCancel))
        case .authenticationFailed:
            completion(.failure(.authenticationFailed))
        default:
            completion(.failure(.internalError))
        }
    }
    
    private func setupContextInvalidationTimer() {
        contextInvalidationTimer?.invalidate()
        contextInvalidationTimer = Timer.scheduledTimer(
            withTimeInterval: SecurityConstants.Authentication.kAuthLockoutDuration,
            repeats: false
        ) { [weak self] _ in
            self?.invalidateContext()
        }
    }
}