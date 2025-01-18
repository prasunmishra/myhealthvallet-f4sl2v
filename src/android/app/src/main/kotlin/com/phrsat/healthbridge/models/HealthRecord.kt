package com.phrsat.healthbridge.models

import android.os.Parcelable
import com.google.gson.annotations.SerializedName
import com.phrsat.healthbridge.security.annotations.Encrypted
import com.phrsat.healthbridge.security.EncryptionUtils
import com.phrsat.healthbridge.utils.DateUtils
import kotlinx.parcelize.Parcelize
import java.util.Date
import java.util.UUID

/**
 * Document types supported by the health record system.
 */
enum class DocumentType {
    LAB_REPORT,
    PRESCRIPTION,
    IMAGING,
    CLINICAL_NOTES,
    VACCINATION,
    INSURANCE,
    OTHER
}

/**
 * Status tracking for OCR processing of health records.
 */
enum class OcrStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED
}

/**
 * Audit actions for HIPAA compliance tracking.
 */
enum class AuditAction {
    CREATE,
    READ,
    UPDATE,
    DELETE,
    SHARE,
    UNSHARE
}

/**
 * Data class representing an audit entry for HIPAA compliance.
 */
@Parcelize
data class AuditEntry(
    val timestamp: Date,
    val action: AuditAction,
    val userId: String,
    val notes: String?,
    @SerializedName("ip_address") val ipAddress: String?
) : Parcelable

/**
 * Data model representing a health record with metadata and content information.
 * Implements field-level encryption for sensitive data and HIPAA compliance.
 *
 * @property id Unique identifier for the health record
 * @property userId Owner of the health record
 * @property documentType Type classification of the health record
 * @property title Encrypted title of the health record
 * @property storageUrl Secure storage location of the document
 * @property documentDate Date of the health record
 */
@Parcelize
data class HealthRecord(
    @SerializedName("id") val id: String = UUID.randomUUID().toString(),
    @SerializedName("user_id") val userId: String,
    @SerializedName("document_type") val documentType: DocumentType,
    @Encrypted @SerializedName("title") val title: String,
    @SerializedName("storage_url") val storageUrl: String,
    @SerializedName("document_date") val documentDate: Date,
    @SerializedName("tags") val tags: List<String> = emptyList(),
    @Encrypted @SerializedName("metadata") val metadata: Map<String, Any> = emptyMap(),
    @SerializedName("ocr_status") val ocrStatus: OcrStatus = OcrStatus.PENDING,
    @Encrypted @SerializedName("ocr_results") val ocrResults: Map<String, String> = emptyMap(),
    @SerializedName("classification") val classification: String? = null,
    @SerializedName("classification_confidence") val classificationConfidence: Float = 0f,
    @SerializedName("is_favorite") val isFavorite: Boolean = false,
    @SerializedName("shared_with") val sharedWith: List<String> = emptyList(),
    @SerializedName("created_at") val createdAt: Date = Date(),
    @SerializedName("updated_at") val updatedAt: Date = Date(),
    @SerializedName("created_by") val createdBy: String,
    @SerializedName("last_modified_by") val lastModifiedBy: String,
    @SerializedName("audit_trail") val auditTrail: MutableList<AuditEntry> = mutableListOf(),
    @SerializedName("version") val version: Int = 1,
    @SerializedName("retention_date") val retentionDate: Date = calculateRetentionDate(documentDate, documentType),
    @SerializedName("is_backed_up") val isBackedUp: Boolean = false
) : Parcelable {

    init {
        require(title.isNotBlank()) { "Title cannot be blank" }
        require(storageUrl.isNotBlank()) { "Storage URL cannot be blank" }
        require(documentDate.time <= Date().time) { "Document date cannot be in the future" }
        
        // Log initial audit entry
        logAuditEvent(AuditAction.CREATE, createdBy, "Record created")
    }

    /**
     * Converts the health record to a JSON string with encrypted fields.
     */
    fun toJson(): String {
        return try {
            val encryptedData = mapOf(
                "id" to id,
                "user_id" to userId,
                "document_type" to documentType.name,
                "title" to EncryptionUtils.encrypt(title),
                "storage_url" to storageUrl,
                "document_date" to DateUtils.formatISODate(documentDate),
                "tags" to tags,
                "metadata" to EncryptionUtils.encryptMap(metadata),
                "ocr_status" to ocrStatus.name,
                "ocr_results" to EncryptionUtils.encryptMap(ocrResults),
                "classification" to classification,
                "classification_confidence" to classificationConfidence,
                "is_favorite" to isFavorite,
                "shared_with" to sharedWith,
                "created_at" to DateUtils.formatISODate(createdAt),
                "updated_at" to DateUtils.formatISODate(updatedAt),
                "created_by" to createdBy,
                "last_modified_by" to lastModifiedBy,
                "audit_trail" to auditTrail,
                "version" to version,
                "retention_date" to DateUtils.formatISODate(retentionDate),
                "is_backed_up" to isBackedUp
            )
            com.google.gson.Gson().toJson(encryptedData)
        } catch (e: Exception) {
            throw IllegalStateException("Failed to serialize HealthRecord to JSON", e)
        }
    }

    /**
     * Records an audit event for HIPAA compliance tracking.
     */
    fun logAuditEvent(action: AuditAction, userId: String, notes: String?) {
        val auditEntry = AuditEntry(
            timestamp = Date(),
            action = action,
            userId = userId,
            notes = notes,
            ipAddress = null // IP address should be added by the system layer
        )
        auditTrail.add(auditEntry)
    }

    companion object {
        /**
         * Creates a HealthRecord instance from a JSON string with decryption of sensitive fields.
         */
        @JvmStatic
        fun fromJson(jsonString: String): HealthRecord {
            try {
                val jsonData = com.google.gson.Gson().fromJson(jsonString, Map::class.java)
                
                return HealthRecord(
                    id = jsonData["id"] as String,
                    userId = jsonData["user_id"] as String,
                    documentType = DocumentType.valueOf(jsonData["document_type"] as String),
                    title = EncryptionUtils.decrypt(jsonData["title"] as String),
                    storageUrl = jsonData["storage_url"] as String,
                    documentDate = DateUtils.parseISODate(jsonData["document_date"] as String)
                        ?: throw IllegalArgumentException("Invalid document date format"),
                    tags = (jsonData["tags"] as? List<String>) ?: emptyList(),
                    metadata = EncryptionUtils.decryptMap(jsonData["metadata"] as Map<String, String>),
                    ocrStatus = OcrStatus.valueOf(jsonData["ocr_status"] as String),
                    ocrResults = EncryptionUtils.decryptMap(jsonData["ocr_results"] as Map<String, String>),
                    classification = jsonData["classification"] as? String,
                    classificationConfidence = (jsonData["classification_confidence"] as? Double)?.toFloat() ?: 0f,
                    isFavorite = jsonData["is_favorite"] as Boolean,
                    sharedWith = (jsonData["shared_with"] as? List<String>) ?: emptyList(),
                    createdAt = DateUtils.parseISODate(jsonData["created_at"] as String)
                        ?: throw IllegalArgumentException("Invalid created_at date format"),
                    updatedAt = DateUtils.parseISODate(jsonData["updated_at"] as String)
                        ?: throw IllegalArgumentException("Invalid updated_at date format"),
                    createdBy = jsonData["created_by"] as String,
                    lastModifiedBy = jsonData["last_modified_by"] as String,
                    version = (jsonData["version"] as? Double)?.toInt() ?: 1,
                    isBackedUp = jsonData["is_backed_up"] as Boolean
                )
            } catch (e: Exception) {
                throw IllegalArgumentException("Failed to deserialize HealthRecord from JSON", e)
            }
        }

        /**
         * Calculates the retention date based on document type and creation date.
         */
        private fun calculateRetentionDate(documentDate: Date, documentType: DocumentType): Date {
            val calendar = java.util.Calendar.getInstance()
            calendar.time = documentDate
            
            when (documentType) {
                DocumentType.LAB_REPORT -> calendar.add(java.util.Calendar.YEAR, 2)
                DocumentType.PRESCRIPTION -> calendar.add(java.util.Calendar.YEAR, 3)
                DocumentType.IMAGING -> calendar.add(java.util.Calendar.YEAR, 7)
                DocumentType.CLINICAL_NOTES -> calendar.add(java.util.Calendar.YEAR, 10)
                DocumentType.VACCINATION -> calendar.add(java.util.Calendar.YEAR, 10)
                DocumentType.INSURANCE -> calendar.add(java.util.Calendar.YEAR, 7)
                DocumentType.OTHER -> calendar.add(java.util.Calendar.YEAR, 7)
            }
            
            return calendar.time
        }
    }
}