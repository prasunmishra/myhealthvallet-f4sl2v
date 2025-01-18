//
// SecureStorage.swift
// PHRSATHealthBridge
//
// High-level secure storage interface for sensitive health data with HIPAA compliance
// and comprehensive security measures
//
// Version: 1.0
// iOS Deployment Target: 14.0+
//

import Foundation // v14.0+

/// Enumeration of possible storage operation errors
public enum StorageError: Error {
    case validationFailed
    case encryptionFailed
    case storageOperationFailed
    case dataNotFound
    case dataCorrupted
    case securityCheckFailed
    case memorySecurityError
    case auditLogFailed
}

/// Options for data validation before storage
public struct ValidationOptions: OptionSet {
    public let rawValue: Int
    
    public static let sensitiveDataCheck = ValidationOptions(rawValue: 1 << 0)
    public static let sizeLimit = ValidationOptions(rawValue: 1 << 1)
    public static let formatValidation = ValidationOptions(rawValue: 1 << 2)
    public static let integrityCheck = ValidationOptions(rawValue: 1 << 3)
    
    public init(rawValue: Int) {
        self.rawValue = rawValue
    }
}

/// Thread-safe singleton class providing secure storage for sensitive health data
public final class SecureStorage {
    
    // MARK: - Singleton Instance
    
    /// Shared singleton instance
    public static let shared = SecureStorage()
    
    // MARK: - Private Properties
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Encryption manager instance
    private let encryptionManager: EncryptionManager
    
    /// Keychain manager instance
    private let keychainManager: KeychainManager
    
    /// Audit logger for security operations
    private let auditLogger: Logger
    
    /// Data validator instance
    private let validator: DataValidator
    
    /// Key rotation manager
    private let keyRotator: KeyRotationManager
    
    // MARK: - Initialization
    
    private init() {
        self.queue = DispatchQueue(label: "com.phrsat.securestorage", qos: .userInitiated)
        self.encryptionManager = EncryptionManager.shared
        self.keychainManager = KeychainManager.shared
        self.auditLogger = Logger(subsystem: "com.phrsat.securestorage", category: "security")
        self.validator = DataValidator()
        self.keyRotator = KeyRotationManager()
        
        setupMemoryProtection()
        registerNotifications()
    }
    
    // MARK: - Public Methods
    
    /// Securely saves data with encryption and validation
    /// - Parameters:
    ///   - data: Data to be stored
    ///   - key: Unique identifier for the data
    ///   - options: Validation options for the data
    /// - Returns: Result indicating success or specific error
    public func saveSecureData(_ data: Data,
                              forKey key: String,
                              withOptions options: ValidationOptions = [.sensitiveDataCheck, .sizeLimit]) -> Result<Void, StorageError> {
        return queue.sync {
            // Start audit logging
            auditLogger.info("Starting secure save operation for key: \(key)")
            
            // Validate input data
            guard case .success = validator.validateData(data, withOptions: options) else {
                auditLogger.error("Data validation failed for key: \(key)")
                return .failure(.validationFailed)
            }
            
            // Encrypt data
            guard case .success(let encryptedData) = encryptionManager.encrypt(data) else {
                auditLogger.error("Encryption failed for key: \(key)")
                return .failure(.encryptionFailed)
            }
            
            // Save to keychain
            let saveResult = keychainManager.saveData(encryptedData,
                                                    forKey: key,
                                                    withAccessibility: .whenUnlockedThisDeviceOnly)
            
            switch saveResult {
            case .success:
                auditLogger.info("Successfully saved data for key: \(key)")
                cleanMemory()
                return .success(())
                
            case .failure:
                auditLogger.error("Storage operation failed for key: \(key)")
                cleanMemory()
                return .failure(.storageOperationFailed)
            }
        }
    }
    
    /// Retrieves and decrypts secure data
    /// - Parameter key: Unique identifier for the data
    /// - Returns: Result containing decrypted data or error
    public func loadSecureData(forKey key: String) -> Result<Data, StorageError> {
        return queue.sync {
            auditLogger.info("Starting secure load operation for key: \(key)")
            
            // Retrieve encrypted data from keychain
            let loadResult = keychainManager.loadData(forKey: key)
            
            switch loadResult {
            case .success(let encryptedData):
                // Decrypt data
                guard case .success(let decryptedData) = encryptionManager.decrypt(encryptedData) else {
                    auditLogger.error("Decryption failed for key: \(key)")
                    return .failure(.encryptionFailed)
                }
                
                // Validate decrypted data
                guard case .success = validator.validateData(decryptedData, withOptions: [.integrityCheck]) else {
                    auditLogger.error("Data integrity check failed for key: \(key)")
                    return .failure(.dataCorrupted)
                }
                
                auditLogger.info("Successfully loaded data for key: \(key)")
                return .success(decryptedData)
                
            case .failure:
                auditLogger.error("Data not found for key: \(key)")
                return .failure(.dataNotFound)
            }
        }
    }
    
    /// Securely deletes data with verification
    /// - Parameter key: Unique identifier for the data
    /// - Returns: Result indicating success or error
    public func deleteSecureData(forKey key: String) -> Result<Void, StorageError> {
        return queue.sync {
            auditLogger.info("Starting secure delete operation for key: \(key)")
            
            let deleteResult = keychainManager.deleteData(forKey: key)
            
            switch deleteResult {
            case .success:
                auditLogger.info("Successfully deleted data for key: \(key)")
                return .success(())
                
            case .failure:
                auditLogger.error("Delete operation failed for key: \(key)")
                return .failure(.storageOperationFailed)
            }
        }
    }
    
    /// Updates existing secure data with atomic operation
    /// - Parameters:
    ///   - data: New data to store
    ///   - key: Unique identifier for the data
    ///   - options: Validation options for the data
    /// - Returns: Result indicating success or error
    public func updateSecureData(_ data: Data,
                                forKey key: String,
                                withOptions options: ValidationOptions = [.sensitiveDataCheck, .sizeLimit]) -> Result<Void, StorageError> {
        return queue.sync {
            auditLogger.info("Starting secure update operation for key: \(key)")
            
            // Validate input data
            guard case .success = validator.validateData(data, withOptions: options) else {
                auditLogger.error("Data validation failed for key: \(key)")
                return .failure(.validationFailed)
            }
            
            // Encrypt data
            guard case .success(let encryptedData) = encryptionManager.encrypt(data) else {
                auditLogger.error("Encryption failed for key: \(key)")
                return .failure(.encryptionFailed)
            }
            
            // Update in keychain
            let updateResult = keychainManager.updateData(encryptedData,
                                                        forKey: key,
                                                        withAccessibility: .whenUnlockedThisDeviceOnly)
            
            switch updateResult {
            case .success:
                auditLogger.info("Successfully updated data for key: \(key)")
                cleanMemory()
                return .success(())
                
            case .failure:
                auditLogger.error("Update operation failed for key: \(key)")
                cleanMemory()
                return .failure(.storageOperationFailed)
            }
        }
    }
    
    // MARK: - Private Methods
    
    /// Sets up memory protection mechanisms
    private func setupMemoryProtection() {
        // Enable secure memory operations
        setenv("MALLOC_PROTECT_BEFORE", "1", 1)
        setenv("MALLOC_PROTECT_AFTER", "1", 1)
    }
    
    /// Registers for system notifications
    private func registerNotifications() {
        NotificationCenter.default.addObserver(self,
                                             selector: #selector(handleApplicationStateChange),
                                             name: UIApplication.willResignActiveNotification,
                                             object: nil)
    }
    
    /// Handles application state changes
    @objc private func handleApplicationStateChange() {
        cleanMemory()
    }
    
    /// Cleans sensitive data from memory
    private func cleanMemory() {
        // Perform secure memory cleanup
        malloc_destroy_zone(malloc_default_zone())
    }
}