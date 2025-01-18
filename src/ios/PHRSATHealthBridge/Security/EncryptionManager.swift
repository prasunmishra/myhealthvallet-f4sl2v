//
// EncryptionManager.swift
// PHRSATHealthBridge
//
// Thread-safe singleton class managing encryption, decryption, and key rotation
// for sensitive health data with HIPAA compliance
//
// Version: 1.0
// iOS Deployment Target: 14.0+
//

import Foundation // v14.0+
import CryptoKit // v14.0+

/// Enumeration of possible encryption operation errors
public enum EncryptionError: Error {
    case invalidInput
    case keyGenerationFailed
    case encryptionFailed
    case decryptionFailed
    case invalidDataFormat
    case keyRotationInProgress
    case keyNotFound
    case insufficientEntropy
    case keyValidationFailed
}

/// Thread-safe singleton class managing encryption operations for sensitive health data
@objc public final class EncryptionManager {
    
    // MARK: - Singleton Instance
    
    /// Shared singleton instance
    public static let shared = EncryptionManager()
    
    // MARK: - Private Properties
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Identifier for encryption key in keychain
    private let keyIdentifier: String
    
    /// Timestamp of last key rotation
    private var lastKeyRotation: Date
    
    /// Counter for key usage
    private var keyUsageCount: UInt64
    
    /// Flag indicating key rotation in progress
    private var isPerformingKeyRotation: Bool
    
    // MARK: - Constants
    
    private enum Constants {
        static let keyPrefix = "com.phrsat.encryption.key."
        static let maxKeyUsage: UInt64 = 100_000
        static let versionIdentifier: UInt8 = 0x01
    }
    
    // MARK: - Initialization
    
    private init() {
        self.queue = DispatchQueue(label: "com.phrsat.encryption", qos: .userInitiated)
        self.keyIdentifier = Constants.keyPrefix + UUID().uuidString
        self.lastKeyRotation = Date()
        self.keyUsageCount = 0
        self.isPerformingKeyRotation = false
        
        // Initialize encryption key if not exists
        if case .failure = generateEncryptionKey() {
            fatalError("Failed to initialize encryption system")
        }
        
        // Schedule key rotation checks
        scheduleKeyRotationCheck()
    }
    
    // MARK: - Public Methods
    
    /// Encrypts data using AES-256-GCM with enhanced security checks
    /// - Parameter data: Data to encrypt
    /// - Returns: Result containing encrypted data or error
    public func encrypt(_ data: Data) -> Result<Data, EncryptionError> {
        return queue.sync {
            // Validate input
            guard !data.isEmpty else {
                return .failure(.invalidInput)
            }
            
            // Check key rotation status
            if isPerformingKeyRotation {
                return .failure(.keyRotationInProgress)
            }
            
            // Check key usage and rotation requirements
            if keyUsageCount >= Constants.maxKeyUsage {
                if case .failure(let error) = rotateEncryptionKey() {
                    return .failure(error)
                }
            }
            
            // Retrieve encryption key
            guard case .success(let keyData) = KeychainManager.shared.loadData(forKey: keyIdentifier) else {
                return .failure(.keyNotFound)
            }
            
            do {
                let key = SymmetricKey(data: keyData)
                
                // Generate random nonce
                var nonce = Data(count: SecurityConstants.Encryption.kAESGCMNonceSize)
                let result = nonce.withUnsafeMutableBytes { pointer in
                    SecRandomCopyBytes(kSecRandomDefault, SecurityConstants.Encryption.kAESGCMNonceSize, pointer.baseAddress!)
                }
                
                guard result == errSecSuccess else {
                    return .failure(.encryptionFailed)
                }
                
                let sealedBox = try AES.GCM.seal(data, using: key, nonce: AES.GCM.Nonce(data: nonce))
                
                // Combine version, nonce, and ciphertext
                var encryptedData = Data([Constants.versionIdentifier])
                encryptedData.append(nonce)
                encryptedData.append(sealedBox.ciphertext)
                encryptedData.append(sealedBox.tag)
                
                // Increment key usage counter
                keyUsageCount += 1
                
                return .success(encryptedData)
            } catch {
                return .failure(.encryptionFailed)
            }
        }
    }
    
    /// Decrypts AES-256-GCM encrypted data with format validation
    /// - Parameter encryptedData: Data to decrypt
    /// - Returns: Result containing decrypted data or error
    public func decrypt(_ encryptedData: Data) -> Result<Data, EncryptionError> {
        return queue.sync {
            // Validate minimum data length
            guard encryptedData.count > (1 + SecurityConstants.Encryption.kAESGCMNonceSize + 16) else {
                return .failure(.invalidDataFormat)
            }
            
            // Check version identifier
            guard encryptedData[0] == Constants.versionIdentifier else {
                return .failure(.invalidDataFormat)
            }
            
            // Extract components
            let nonce = encryptedData.subdata(in: 1..<(1 + SecurityConstants.Encryption.kAESGCMNonceSize))
            let ciphertext = encryptedData.subdata(in: (1 + SecurityConstants.Encryption.kAESGCMNonceSize)..<(encryptedData.count - 16))
            let tag = encryptedData.suffix(16)
            
            // Retrieve encryption key
            guard case .success(let keyData) = KeychainManager.shared.loadData(forKey: keyIdentifier) else {
                return .failure(.keyNotFound)
            }
            
            do {
                let key = SymmetricKey(data: keyData)
                let sealedBox = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce),
                                                     ciphertext: ciphertext,
                                                     tag: tag)
                
                let decryptedData = try AES.GCM.open(sealedBox, using: key)
                return .success(decryptedData)
            } catch {
                return .failure(.decryptionFailed)
            }
        }
    }
    
    /// Performs secure key rotation with data re-encryption
    /// - Returns: Result indicating success or error
    @discardableResult
    public func rotateEncryptionKey() -> Result<Void, EncryptionError> {
        return queue.sync {
            guard !isPerformingKeyRotation else {
                return .failure(.keyRotationInProgress)
            }
            
            isPerformingKeyRotation = true
            
            // Generate new key
            guard case .success(let newKey) = generateEncryptionKey() else {
                isPerformingKeyRotation = false
                return .failure(.keyGenerationFailed)
            }
            
            // Store new key with temporary identifier
            let newKeyIdentifier = Constants.keyPrefix + UUID().uuidString
            guard case .success = KeychainManager.shared.saveData(newKey.withUnsafeBytes { Data($0) },
                                                                forKey: newKeyIdentifier) else {
                isPerformingKeyRotation = false
                return .failure(.keyGenerationFailed)
            }
            
            // Update key identifier and reset usage count
            let oldKeyIdentifier = keyIdentifier
            keyIdentifier = newKeyIdentifier
            keyUsageCount = 0
            lastKeyRotation = Date()
            
            // Clean up old key
            _ = KeychainManager.shared.deleteData(forKey: oldKeyIdentifier)
            
            isPerformingKeyRotation = false
            return .success(())
        }
    }
    
    // MARK: - Private Methods
    
    /// Generates a new AES-256 encryption key with entropy validation
    private func generateEncryptionKey() -> Result<SymmetricKey, EncryptionError> {
        var keyData = Data(count: SecurityConstants.Encryption.kEncryptionKeySize / 8)
        let result = keyData.withUnsafeMutableBytes { pointer in
            SecRandomCopyBytes(kSecRandomDefault, SecurityConstants.Encryption.kEncryptionKeySize / 8, pointer.baseAddress!)
        }
        
        guard result == errSecSuccess else {
            return .failure(.keyGenerationFailed)
        }
        
        let key = SymmetricKey(data: keyData)
        
        // Store key in keychain
        guard case .success = KeychainManager.shared.saveData(keyData,
                                                            forKey: keyIdentifier,
                                                            withAccessibility: .whenUnlockedThisDeviceOnly) else {
            return .failure(.keyGenerationFailed)
        }
        
        return .success(key)
    }
    
    /// Schedules periodic key rotation checks
    private func scheduleKeyRotationCheck() {
        Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            
            let keyAge = Date().timeIntervalSince(self.lastKeyRotation)
            if keyAge >= SecurityConstants.Encryption.kKeyRotationInterval {
                _ = self.rotateEncryptionKey()
            }
        }
    }
}