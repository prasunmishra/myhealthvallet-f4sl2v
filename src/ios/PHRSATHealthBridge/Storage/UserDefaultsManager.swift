//
// UserDefaultsManager.swift
// PHRSATHealthBridge
//
// Thread-safe singleton class managing persistent storage using UserDefaults
// with encryption support for sensitive data
//
// Version: 1.0
// iOS Deployment Target: 14.0+
//

import Foundation // v14.0+

/// Enumeration of possible storage operation errors
public enum StorageError: Error {
    case invalidInput
    case dataConversionFailed
    case encryptionFailed
    case decryptionFailed
    case storageOperationFailed
    case valueNotFound
    case typeMismatch
    case synchronizationFailed
}

/// Thread-safe singleton class managing persistent storage with encryption support
public final class UserDefaultsManager {
    
    // MARK: - Singleton Instance
    
    /// Shared singleton instance
    public static let shared = UserDefaultsManager()
    
    // MARK: - Private Properties
    
    /// UserDefaults instance for persistent storage
    private let defaults: UserDefaults
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Lock for synchronized access
    private let accessLock: NSLock
    
    // MARK: - Constants
    
    private enum Constants {
        static let queueLabel = "com.phrsat.userdefaults"
        static let encryptedPrefix = "encrypted_"
    }
    
    // MARK: - Initialization
    
    private init() {
        self.defaults = UserDefaults.standard
        self.queue = DispatchQueue(label: Constants.queueLabel, qos: .userInitiated)
        self.accessLock = NSLock()
        
        // Register for app termination notification to ensure data persistence
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationWillTerminate),
            name: UIApplication.willTerminateNotification,
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    // MARK: - Public Methods
    
    /// Stores a value in UserDefaults with optional encryption
    /// - Parameters:
    ///   - value: Value to store
    ///   - key: Storage key
    ///   - encrypt: Whether to encrypt the value
    /// - Returns: Result indicating success or specific error
    public func setValue(_ value: Any, forKey key: String, encrypt: Bool = false) -> Result<Void, StorageError> {
        guard !key.isEmpty else {
            return .failure(.invalidInput)
        }
        
        return queue.sync {
            accessLock.lock()
            defer { accessLock.unlock() }
            
            if encrypt {
                // Convert value to Data for encryption
                guard let data = try? NSKeyedArchiver.archivedData(
                    withRootObject: value,
                    requiringSecureCoding: true
                ) else {
                    return .failure(.dataConversionFailed)
                }
                
                // Encrypt data using EncryptionManager
                switch EncryptionManager.shared.encrypt(data) {
                case .success(let encryptedData):
                    defaults.set(encryptedData, forKey: Constants.encryptedPrefix + key)
                case .failure(_):
                    return .failure(.encryptionFailed)
                }
            } else {
                defaults.set(value, forKey: key)
            }
            
            guard defaults.synchronize() else {
                return .failure(.synchronizationFailed)
            }
            
            return .success(())
        }
    }
    
    /// Retrieves a value from UserDefaults with automatic decryption if needed
    /// - Parameters:
    ///   - key: Storage key
    ///   - encrypted: Whether the value is encrypted
    /// - Returns: Result containing retrieved value or specific error
    public func getValue(forKey key: String, encrypted: Bool = false) -> Result<Any?, StorageError> {
        guard !key.isEmpty else {
            return .failure(.invalidInput)
        }
        
        return queue.sync {
            accessLock.lock()
            defer { accessLock.unlock() }
            
            if encrypted {
                let storageKey = Constants.encryptedPrefix + key
                guard let encryptedData = defaults.data(forKey: storageKey) else {
                    return .success(nil)
                }
                
                // Decrypt data using EncryptionManager
                switch EncryptionManager.shared.decrypt(encryptedData) {
                case .success(let decryptedData):
                    do {
                        let value = try NSKeyedUnarchiver.unarchiveTopLevelObjectWithData(decryptedData)
                        return .success(value)
                    } catch {
                        return .failure(.dataConversionFailed)
                    }
                case .failure(_):
                    return .failure(.decryptionFailed)
                }
            } else {
                let value = defaults.object(forKey: key)
                return .success(value)
            }
        }
    }
    
    /// Removes a value from UserDefaults
    /// - Parameter key: Storage key
    /// - Returns: Result indicating success or specific error
    public func removeValue(forKey key: String) -> Result<Void, StorageError> {
        guard !key.isEmpty else {
            return .failure(.invalidInput)
        }
        
        return queue.sync {
            accessLock.lock()
            defer { accessLock.unlock() }
            
            // Remove both encrypted and non-encrypted versions
            defaults.removeObject(forKey: key)
            defaults.removeObject(forKey: Constants.encryptedPrefix + key)
            
            guard defaults.synchronize() else {
                return .failure(.synchronizationFailed)
            }
            
            return .success(())
        }
    }
    
    /// Removes all values from UserDefaults
    /// - Returns: Result indicating success or specific error
    public func clearAll() -> Result<Void, StorageError> {
        return queue.sync {
            accessLock.lock()
            defer { accessLock.unlock() }
            
            // Get all keys and remove them
            guard let domain = Bundle.main.bundleIdentifier else {
                return .failure(.storageOperationFailed)
            }
            
            defaults.removePersistentDomain(forName: domain)
            
            guard defaults.synchronize() else {
                return .failure(.synchronizationFailed)
            }
            
            return .success(())
        }
    }
    
    // MARK: - Private Methods
    
    @objc private func applicationWillTerminate(_ notification: Notification) {
        // Ensure all changes are synchronized before app termination
        _ = queue.sync {
            defaults.synchronize()
        }
    }
}