import XCTest
import Foundation
import CryptoKit
@testable import PHRSATHealthBridge

final class EncryptionManagerTests: XCTestCase {
    // MARK: - Properties
    
    private var sut: EncryptionManager!
    private var testData: Data!
    private var sensitiveTestData: Data!
    private var concurrentQueue: DispatchQueue!
    
    // MARK: - Test Lifecycle
    
    override func setUp() {
        super.setUp()
        
        // Initialize system under test with secure configuration
        sut = EncryptionManager()
        
        // Create test data with proper memory protection
        let secureString = "HIPAA compliant test data"
        testData = secureString.data(using: .utf8)
        
        // Initialize sensitive test data with PHI
        sensitiveTestData = "Patient: John Doe, DOB: 01/01/1970".data(using: .utf8)
        
        // Set up concurrent testing queue
        concurrentQueue = DispatchQueue(label: "com.phrsat.encryption.tests",
                                      qos: .userInitiated,
                                      attributes: .concurrent)
    }
    
    override func tearDown() {
        // Securely clear sensitive test data
        testData = Data(repeating: 0, count: testData.count)
        sensitiveTestData = Data(repeating: 0, count: sensitiveTestData.count)
        
        // Release encryption resources
        sut = nil
        concurrentQueue = nil
        
        super.tearDown()
    }
    
    // MARK: - Compliance Tests
    
    func testEncryptionCompliance() throws {
        // Test AES-256-GCM implementation
        let encryptedData = try sut.encrypt(data: testData)
        XCTAssertNotNil(encryptedData, "Encryption should produce valid output")
        
        // Verify key size compliance (256-bit)
        let keySize = try sut.getCurrentKeySize()
        XCTAssertEqual(keySize, 256, "Encryption key must be 256-bit for HIPAA compliance")
        
        // Validate encryption strength
        let decryptedData = try sut.decrypt(data: encryptedData)
        XCTAssertEqual(decryptedData, testData, "Decryption should restore original data")
        
        // Verify nonce uniqueness
        let secondEncryption = try sut.encrypt(data: testData)
        XCTAssertNotEqual(encryptedData, secondEncryption, "Each encryption should use unique nonce")
    }
    
    func testConcurrentEncryption() throws {
        let operationCount = 100
        let expectation = XCTestExpectation(description: "Concurrent encryption operations")
        expectation.expectedFulfillmentCount = operationCount
        
        var encryptedResults: [Data] = []
        let resultsQueue = DispatchQueue(label: "com.phrsat.results")
        
        // Execute parallel encryption tasks
        for _ in 0..<operationCount {
            concurrentQueue.async {
                do {
                    let encrypted = try self.sut.encrypt(data: self.testData)
                    resultsQueue.async {
                        encryptedResults.append(encrypted)
                        expectation.fulfill()
                    }
                } catch {
                    XCTFail("Concurrent encryption failed: \(error)")
                }
            }
        }
        
        wait(for: [expectation], timeout: 10.0)
        
        // Verify thread safety results
        XCTAssertEqual(encryptedResults.count, operationCount, "All encryption operations should complete")
        
        // Verify uniqueness of encryptions
        let uniqueResults = Set(encryptedResults)
        XCTAssertEqual(uniqueResults.count, operationCount, "Each encryption should be unique")
    }
    
    func testSecureKeyRotation() throws {
        // Encrypt data with current key
        let encryptedData = try sut.encrypt(data: testData)
        
        // Perform key rotation
        try sut.rotateKey()
        
        // Verify data can still be decrypted after rotation
        let decryptedData = try sut.decrypt(data: encryptedData)
        XCTAssertEqual(decryptedData, testData, "Data should be accessible after key rotation")
        
        // Verify old key is securely destroyed
        let oldKeyExists = sut.hasOldKey()
        XCTAssertFalse(oldKeyExists, "Old key should be securely destroyed")
        
        // Verify audit log of key rotation
        let rotationLog = sut.getKeyRotationLog()
        XCTAssertNotNil(rotationLog.last, "Key rotation should be logged")
    }
    
    func testErrorHandling() throws {
        // Test invalid data handling
        let invalidData = Data([0xFF, 0xFF, 0xFF])
        
        XCTAssertThrowsError(try sut.decrypt(data: invalidData)) { error in
            XCTAssertTrue(error is EncryptionError, "Should throw EncryptionError for invalid data")
        }
        
        // Test corruption detection
        var corruptedData = try sut.encrypt(data: testData)
        corruptedData[0] ^= 0xFF // Corrupt first byte
        
        XCTAssertThrowsError(try sut.decrypt(data: corruptedData)) { error in
            XCTAssertTrue(error is EncryptionError, "Should detect data corruption")
        }
        
        // Test memory allocation failure handling
        let largeData = Data(count: Int.max/2)
        XCTAssertThrowsError(try sut.encrypt(data: largeData)) { error in
            XCTAssertTrue(error is EncryptionError, "Should handle memory allocation failures")
        }
    }
    
    // MARK: - Helper Methods
    
    private func verifySecureMemory(_ data: Data) {
        // Ensure sensitive data is in secure memory
        let memoryClass = malloc_get_zone_name(data.withUnsafeBytes { bytes in
            return malloc_zone_from_ptr(bytes.baseAddress!)
        })
        XCTAssertNotNil(memoryClass, "Data should be allocated in secure memory zone")
    }
}