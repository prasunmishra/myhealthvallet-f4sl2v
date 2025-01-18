//
// KeychainManager.swift
// PHRSATHealthBridge
//
// Thread-safe singleton class managing secure storage and retrieval of sensitive data 
// in iOS Keychain with HIPAA compliance
//
// Version: 1.0
// iOS Deployment Target: 14.0+
//

import Foundation // v14.0+
import Security // v14.0+

/// Enumeration of possible keychain operation errors
public enum KeychainError: Error {
    case dataConversionError
    case duplicateItem
    case itemNotFound
    case unexpectedStatus(OSStatus)
    case unhandledError(status: OSStatus)
    case invalidInput
    case accessError
}

/// Keychain item accessibility options
public enum KeychainAccessibility {
    case whenUnlocked
    case afterFirstUnlock
    case whenUnlockedThisDeviceOnly
    case afterFirstUnlockThisDeviceOnly
    
    var secAccessibility: CFString {
        switch self {
        case .whenUnlocked:
            return kSecAttrAccessibleWhenUnlocked
        case .afterFirstUnlock:
            return kSecAttrAccessibleAfterFirstUnlock
        case .whenUnlockedThisDeviceOnly:
            return kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        case .afterFirstUnlockThisDeviceOnly:
            return kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        }
    }
}

/// Thread-safe singleton class managing secure storage and retrieval of sensitive data
public final class KeychainManager {
    
    // MARK: - Singleton Instance
    
    /// Shared singleton instance
    public static let shared = KeychainManager()
    
    // MARK: - Private Properties
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Service identifier for keychain operations
    private let serviceIdentifier: String
    
    /// Access group for shared keychain access
    private let accessGroup: String
    
    // MARK: - Initialization
    
    private init() {
        self.queue = DispatchQueue(label: "com.phrsat.keychain", qos: .userInitiated)
        self.serviceIdentifier = SecurityConstants.Keychain.kKeychainServiceIdentifier
        self.accessGroup = SecurityConstants.Keychain.kKeychainAccessGroup
    }
    
    // MARK: - Public Methods
    
    /// Securely saves data to the keychain with proper encryption
    /// - Parameters:
    ///   - data: The data to be stored
    ///   - key: Unique identifier for the stored data
    ///   - accessibility: Keychain accessibility option
    /// - Returns: Result indicating success or specific error
    public func saveData(_ data: Data, 
                        forKey key: String, 
                        withAccessibility accessibility: KeychainAccessibility = .whenUnlockedThisDeviceOnly) -> Result<Void, KeychainError> {
        
        return queue.sync {
            guard !key.isEmpty else {
                return .failure(.invalidInput)
            }
            
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceIdentifier,
                kSecAttrAccessGroup as String: accessGroup,
                kSecAttrAccount as String: key,
                kSecValueData as String: data,
                kSecAttrAccessible as String: accessibility.secAccessibility,
                kSecUseDataProtectionKeychain as String: true
            ]
            
            let status = SecItemAdd(query as CFDictionary, nil)
            
            switch status {
            case errSecSuccess:
                return .success(())
            case errSecDuplicateItem:
                return updateData(data, forKey: key, withAccessibility: accessibility)
            default:
                return .failure(.unexpectedStatus(status))
            }
        }
    }
    
    /// Retrieves data from the keychain with proper decryption
    /// - Parameter key: Unique identifier for the stored data
    /// - Returns: Result containing retrieved data or specific error
    public func loadData(forKey key: String) -> Result<Data, KeychainError> {
        return queue.sync {
            guard !key.isEmpty else {
                return .failure(.invalidInput)
            }
            
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceIdentifier,
                kSecAttrAccessGroup as String: accessGroup,
                kSecAttrAccount as String: key,
                kSecReturnData as String: true,
                kSecUseDataProtectionKeychain as String: true
            ]
            
            var result: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            
            switch status {
            case errSecSuccess:
                guard let data = result as? Data else {
                    return .failure(.dataConversionError)
                }
                return .success(data)
            case errSecItemNotFound:
                return .failure(.itemNotFound)
            default:
                return .failure(.unexpectedStatus(status))
            }
        }
    }
    
    /// Securely deletes data from the keychain
    /// - Parameter key: Unique identifier for the stored data
    /// - Returns: Result indicating success or specific error
    public func deleteData(forKey key: String) -> Result<Void, KeychainError> {
        return queue.sync {
            guard !key.isEmpty else {
                return .failure(.invalidInput)
            }
            
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceIdentifier,
                kSecAttrAccessGroup as String: accessGroup,
                kSecAttrAccount as String: key
            ]
            
            let status = SecItemDelete(query as CFDictionary)
            
            switch status {
            case errSecSuccess, errSecItemNotFound:
                return .success(())
            default:
                return .failure(.unexpectedStatus(status))
            }
        }
    }
    
    /// Updates existing data in the keychain with atomic operation
    /// - Parameters:
    ///   - data: The new data to store
    ///   - key: Unique identifier for the stored data
    ///   - accessibility: Keychain accessibility option
    /// - Returns: Result indicating success or specific error
    public func updateData(_ data: Data, 
                          forKey key: String, 
                          withAccessibility accessibility: KeychainAccessibility = .whenUnlockedThisDeviceOnly) -> Result<Void, KeychainError> {
        
        return queue.sync {
            guard !key.isEmpty else {
                return .failure(.invalidInput)
            }
            
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceIdentifier,
                kSecAttrAccessGroup as String: accessGroup,
                kSecAttrAccount as String: key
            ]
            
            let attributes: [String: Any] = [
                kSecValueData as String: data,
                kSecAttrAccessible as String: accessibility.secAccessibility
            ]
            
            let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            
            switch status {
            case errSecSuccess:
                return .success(())
            case errSecItemNotFound:
                return saveData(data, forKey: key, withAccessibility: accessibility)
            default:
                return .failure(.unexpectedStatus(status))
            }
        }
    }
}