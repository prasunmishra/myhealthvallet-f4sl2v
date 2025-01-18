//
// SecurityConstants.swift
// PHRSATHealthBridge
//
// Security constants ensuring HIPAA compliance and maintaining consistent
// security parameters across the application
//
// Version: 1.0
// iOS Deployment Target: 14.0+
//

import Foundation // v14.0+

/// Centralized security configuration constants ensuring HIPAA compliance and maintaining
/// consistent security parameters across the application
public enum SecurityConstants {
    
    /// Constants related to data encryption following HIPAA security requirements
    public enum Encryption {
        /// AES encryption key size in bits, compliant with HIPAA security requirements
        public static let kEncryptionKeySize: Int = 256
        
        /// Nonce size in bytes for AES-GCM encryption mode
        public static let kAESGCMNonceSize: Int = 12
        
        /// Number of iterations for key derivation function
        public static let kKeyDerivationIterations: Int = 10000
    }
    
    /// Constants related to biometric and system authentication
    public enum Authentication {
        /// User-facing message for biometric authentication prompt
        public static let kBiometricAuthReason: String = "Authenticate to access your protected health information"
        
        /// Maximum allowed authentication attempts before lockout
        public static let kMaxAuthAttempts: Int = 3
        
        /// Duration in seconds for authentication lockout period
        public static let kAuthLockoutDuration: TimeInterval = 300.0
    }
    
    /// Constants related to keychain storage and access
    public enum Keychain {
        /// Unique identifier for keychain service access
        public static let kKeychainServiceIdentifier: String = "com.phrsat.healthbridge"
        
        /// Keychain access group for shared keychain access
        public static let kKeychainAccessGroup: String = "com.phrsat.healthbridge.keychain"
        
        /// Keychain item accessibility constraint
        public static let kKeychainAccessibility: String = kSecAccessibleWhenUnlockedThisDeviceOnly
    }
}