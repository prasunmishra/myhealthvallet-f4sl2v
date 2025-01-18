//
// BiometricAuthManagerTests.swift
// PHRSATHealthBridgeTests
//
// Comprehensive test suite for BiometricAuthManager verifying biometric authentication,
// security controls, and PHI protection measures
//
// Version: 1.0
// iOS Deployment Target: 14.0+
//

import XCTest // v14.0+
import LocalAuthentication // v14.0+
@testable import PHRSATHealthBridge

final class BiometricAuthManagerTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: BiometricAuthManager!
    private var mockContext: LAContext!
    private var authExpectation: XCTestExpectation!
    private let defaultTimeout: TimeInterval = 5.0
    
    // MARK: - Test Lifecycle
    
    override func setUp() {
        super.setUp()
        sut = BiometricAuthManager.shared
        mockContext = LAContext()
        authExpectation = expectation(description: "Authentication completion")
        sut.resetAuthAttempts()
    }
    
    override func tearDown() {
        sut.invalidateContext()
        mockContext = nil
        authExpectation = nil
        super.tearDown()
    }
    
    // MARK: - Biometric Availability Tests
    
    func testBiometricAvailability() {
        // Test when biometrics are available
        let availabilityResult = sut.canUseBiometrics()
        
        switch availabilityResult {
        case .success(let isAvailable):
            XCTAssertTrue(isAvailable, "Biometrics should be available on simulator/device")
        case .failure(let error):
            XCTFail("Unexpected error checking biometric availability: \(error)")
        }
        
        // Test biometrics not enrolled scenario
        let notEnrolledContext = LAContext()
        notEnrolledContext.setValue(LABiometryState.notEnrolled, forKey: "biometryState")
        
        let notEnrolledResult = sut.canUseBiometrics()
        if case .failure(let error) = notEnrolledResult {
            XCTAssertEqual(error, BiometricError.biometricsNotEnrolled)
        }
        
        // Test biometrics not available scenario
        let unavailableContext = LAContext()
        unavailableContext.setValue(LABiometryState.notAvailable, forKey: "biometryState")
        
        let unavailableResult = sut.canUseBiometrics()
        if case .failure(let error) = unavailableResult {
            XCTAssertEqual(error, BiometricError.biometricsNotAvailable)
        }
    }
    
    // MARK: - Authentication Flow Tests
    
    func testSuccessfulAuthentication() {
        // Configure mock for successful authentication
        mockContext.setValue(true, forKey: "canEvaluatePolicy")
        
        sut.authenticateUser { result in
            switch result {
            case .success(let authenticated):
                XCTAssertTrue(authenticated, "Authentication should succeed")
                XCTAssertEqual(0, self.sut.authAttempts, "Attempts should be reset after success")
            case .failure(let error):
                XCTFail("Authentication should not fail: \(error)")
            }
            self.authExpectation.fulfill()
        }
        
        wait(for: [authExpectation], timeout: defaultTimeout)
    }
    
    func testFailedAuthentication() {
        // Test single failed attempt
        sut.authenticateUser { result in
            switch result {
            case .success:
                XCTFail("Authentication should fail")
            case .failure(let error):
                XCTAssertEqual(error, BiometricError.authenticationFailed)
                XCTAssertEqual(1, self.sut.authAttempts, "Failed attempt should be counted")
            }
            self.authExpectation.fulfill()
        }
        
        wait(for: [authExpectation], timeout: defaultTimeout)
    }
    
    func testMaxAttemptsExceeded() {
        // Simulate maximum failed attempts
        for _ in 1...SecurityConstants.Authentication.kMaxAuthAttempts {
            sut.authenticateUser { _ in }
        }
        
        // Test authentication after max attempts
        let lockoutExpectation = expectation(description: "Lockout verification")
        
        sut.authenticateUser { result in
            switch result {
            case .success:
                XCTFail("Authentication should be locked")
            case .failure(let error):
                XCTAssertEqual(error, BiometricError.maxAttemptsExceeded)
            }
            lockoutExpectation.fulfill()
        }
        
        wait(for: [lockoutExpectation], timeout: defaultTimeout)
        
        // Verify attempt reset after lockout period
        let resetExpectation = expectation(description: "Reset verification")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + SecurityConstants.Authentication.kAuthLockoutDuration) {
            self.sut.authenticateUser { result in
                if case .failure(let error) = result {
                    XCTAssertNotEqual(error, BiometricError.maxAttemptsExceeded)
                }
                resetExpectation.fulfill()
            }
        }
        
        wait(for: [resetExpectation], timeout: SecurityConstants.Authentication.kAuthLockoutDuration + defaultTimeout)
    }
    
    func testContextInvalidation() {
        // Test context invalidation
        sut.invalidateContext()
        
        let invalidationExpectation = expectation(description: "Context invalidation")
        
        sut.authenticateUser { result in
            switch result {
            case .success:
                XCTFail("Authentication should fail with invalid context")
            case .failure(let error):
                XCTAssertEqual(error, BiometricError.contextInvalidated)
            }
            invalidationExpectation.fulfill()
        }
        
        wait(for: [invalidationExpectation], timeout: defaultTimeout)
        
        // Verify new context creation
        let newContextExpectation = expectation(description: "New context verification")
        
        sut.authenticateUser { result in
            if case .failure(let error) = result {
                XCTAssertNotEqual(error, BiometricError.contextInvalidated)
            }
            newContextExpectation.fulfill()
        }
        
        wait(for: [newContextExpectation], timeout: defaultTimeout)
    }
    
    // MARK: - Security State Tests
    
    func testAuthenticationStateManagement() {
        // Test attempt counter persistence
        sut.authenticateUser { _ in }
        XCTAssertEqual(1, sut.authAttempts, "Attempt should be counted")
        
        // Test attempt reset
        sut.resetAuthAttempts()
        XCTAssertEqual(0, sut.authAttempts, "Attempts should be reset")
        
        // Test concurrent authentication requests
        let concurrentExpectation = expectation(description: "Concurrent authentication")
        concurrentExpectation.expectedFulfillmentCount = 3
        
        for _ in 1...3 {
            sut.authenticateUser { _ in
                concurrentExpectation.fulfill()
            }
        }
        
        wait(for: [concurrentExpectation], timeout: defaultTimeout)
    }
    
    func testSecurityTimeout() {
        // Test automatic context invalidation
        let timeoutExpectation = expectation(description: "Timeout verification")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + SecurityConstants.Authentication.kAuthLockoutDuration) {
            self.sut.authenticateUser { result in
                if case .failure(let error) = result {
                    XCTAssertEqual(error, BiometricError.contextInvalidated)
                }
                timeoutExpectation.fulfill()
            }
        }
        
        wait(for: [timeoutExpectation], timeout: SecurityConstants.Authentication.kAuthLockoutDuration + defaultTimeout)
    }
}