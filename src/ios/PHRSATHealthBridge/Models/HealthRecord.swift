//
// HealthRecord.swift
// PHRSATHealthBridge
//
// Core model class representing health records with FHIR compatibility
// and secure storage management
//
// Version: 1.0
// iOS Deployment Target: 14.0+
//

import Foundation // Latest

// MARK: - Document Types Enumeration

@objc public enum DocumentTypes: Int, CaseIterable {
    case LAB_REPORT
    case PRESCRIPTION
    case IMAGING
    case CLINICAL_NOTES
    case VACCINATION
    case GENETIC_DATA
    case WELLNESS_DATA
    case OTHER
    
    public var description: String {
        switch self {
        case .LAB_REPORT: return "Laboratory Report"
        case .PRESCRIPTION: return "Prescription"
        case .IMAGING: return "Medical Imaging"
        case .CLINICAL_NOTES: return "Clinical Notes"
        case .VACCINATION: return "Vaccination Record"
        case .GENETIC_DATA: return "Genetic Data"
        case .WELLNESS_DATA: return "Wellness Data"
        case .OTHER: return "Other Document"
        }
    }
}

// MARK: - Date Formatter

private let iso8601Formatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds, .withTimeZone]
    return formatter
}()

// MARK: - HealthRecord Class

@objc @objcMembers public class HealthRecord: NSObject {
    
    // MARK: - Properties
    
    public let id: UUID
    public let title: String
    public let documentType: DocumentTypes
    public let recordDate: Date
    public let uploadDate: Date
    public private(set) var storageUrl: String
    public let sourceProvider: String?
    public private(set) var metadata: [String: Any]
    public private(set) var tags: [String]
    public let fhirResourceType: String?
    public let fhirVersion: String?
    public private(set) var isEncrypted: Bool
    public private(set) var lastAccessDate: Date?
    public let mimeType: String?
    
    // MARK: - Initialization
    
    public init(title: String,
                documentType: DocumentTypes,
                recordDate: Date,
                storageUrl: String,
                sourceProvider: String? = nil,
                metadata: [String: Any] = [:],
                tags: [String] = [],
                fhirResourceType: String? = nil,
                mimeType: String? = nil) throws {
        
        // Validate title
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              title.count <= 256 else {
            throw NSError(domain: "com.phrsat.healthbridge", code: 1001,
                         userInfo: [NSLocalizedDescriptionKey: "Invalid title length or format"])
        }
        
        // Validate record date
        guard recordDate <= Date() else {
            throw NSError(domain: "com.phrsat.healthbridge", code: 1002,
                         userInfo: [NSLocalizedDescriptionKey: "Record date cannot be in the future"])
        }
        
        // Validate storage URL
        guard let validatedUrl = try? EncryptionManager.shared.validateStorageUrl(storageUrl) else {
            throw NSError(domain: "com.phrsat.healthbridge", code: 1003,
                         userInfo: [NSLocalizedDescriptionKey: "Invalid storage URL"])
        }
        
        self.id = UUID()
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.documentType = documentType
        self.recordDate = recordDate
        self.uploadDate = Date()
        self.storageUrl = validatedUrl
        self.sourceProvider = sourceProvider?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.metadata = metadata
        self.tags = tags.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.fhirResourceType = fhirResourceType
        self.fhirVersion = fhirResourceType != nil ? "4.0.1" : nil
        self.isEncrypted = false
        self.lastAccessDate = nil
        self.mimeType = mimeType
        
        super.init()
        
        // Validate metadata against FHIR specifications if applicable
        if fhirResourceType != nil {
            guard validateMetadata(metadata) else {
                throw NSError(domain: "com.phrsat.healthbridge", code: 1004,
                             userInfo: [NSLocalizedDescriptionKey: "Invalid FHIR metadata format"])
            }
        }
    }
    
    // MARK: - Public Methods
    
    /// Converts the health record to a FHIR-compatible dictionary representation
    public func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "resourceType": fhirResourceType ?? "DocumentReference",
            "id": id.uuidString,
            "title": title,
            "documentType": documentType.description,
            "recordDate": iso8601Formatter.string(from: recordDate),
            "uploadDate": iso8601Formatter.string(from: uploadDate),
            "storageUrl": storageUrl
        ]
        
        // Add optional properties
        if let sourceProvider = sourceProvider {
            dict["sourceProvider"] = sourceProvider
        }
        
        if !metadata.isEmpty {
            dict["metadata"] = metadata
        }
        
        if !tags.isEmpty {
            dict["tags"] = tags
        }
        
        if let mimeType = mimeType {
            dict["mimeType"] = mimeType
        }
        
        if let lastAccessDate = lastAccessDate {
            dict["lastAccessDate"] = iso8601Formatter.string(from: lastAccessDate)
        }
        
        // Add security metadata
        dict["security"] = [
            "isEncrypted": isEncrypted,
            "encryptionMethod": "AES-256-GCM"
        ]
        
        return dict
    }
    
    /// Encrypts sensitive record data using EncryptionManager
    public func encrypt() -> Bool {
        guard !isEncrypted else { return true }
        
        do {
            // Create sensitive data package
            let sensitiveData = try JSONSerialization.data(withJSONObject: [
                "storageUrl": storageUrl,
                "metadata": metadata
            ])
            
            // Encrypt using EncryptionManager
            if case .success(let encryptedData) = EncryptionManager.shared.encrypt(sensitiveData) {
                // Update storage URL with encrypted version
                self.storageUrl = encryptedData.base64EncodedString()
                self.isEncrypted = true
                return true
            }
            return false
        } catch {
            return false
        }
    }
    
    /// Validates metadata against FHIR specifications
    public func validateMetadata(_ metadata: [String: Any]) -> Bool {
        guard fhirResourceType != nil else { return true }
        
        // Required FHIR fields for DocumentReference
        let requiredFields = ["status", "docStatus", "type"]
        
        // Check required fields
        for field in requiredFields {
            guard metadata[field] != nil else { return false }
        }
        
        // Validate status field
        if let status = metadata["status"] as? String {
            let validStatuses = ["current", "superseded", "entered-in-error"]
            guard validStatuses.contains(status) else { return false }
        }
        
        // Validate docStatus field
        if let docStatus = metadata["docStatus"] as? String {
            let validDocStatuses = ["preliminary", "final", "amended", "entered-in-error"]
            guard validDocStatuses.contains(docStatus) else { return false }
        }
        
        return true
    }
}