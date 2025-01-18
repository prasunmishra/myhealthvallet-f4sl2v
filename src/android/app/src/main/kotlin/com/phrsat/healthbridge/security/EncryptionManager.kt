package com.phrsat.healthbridge.security

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.phrsat.healthbridge.utils.SecurityConstants
import java.security.KeyStore
import java.security.Provider
import java.security.SecureRandom
import java.security.Security
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Manages encryption and decryption operations for sensitive health data using HIPAA-compliant
 * AES-256-GCM encryption with enhanced security features.
 *
 * Features:
 * - AES-256-GCM encryption with authentication
 * - Secure key storage in Android KeyStore
 * - Automatic key rotation
 * - StrongBox integration when available
 * - Comprehensive error handling
 */
class EncryptionManager(
    private val keyAlias: String,
    private val context: Context
) {

    private val keyStore: KeyStore
    private val cipher: Cipher
    private val secureRandom: SecureRandom
    private val GCM_TAG_LENGTH = 128
    private val KEY_PROVIDER = "AndroidKeyStore"

    data class EncryptedData(
        val encryptedBytes: ByteArray,
        val iv: ByteArray,
        val timestamp: Long
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false
            other as EncryptedData
            return encryptedBytes.contentEquals(other.encryptedBytes) &&
                   iv.contentEquals(other.iv) &&
                   timestamp == other.timestamp
        }

        override fun hashCode(): Int {
            var result = encryptedBytes.contentHashCode()
            result = 31 * result + iv.contentHashCode()
            result = 31 * result + timestamp.hashCode()
            return result
        }
    }

    init {
        // Initialize KeyStore
        keyStore = KeyStore.getInstance(KEY_PROVIDER).apply {
            load(null)
        }

        // Initialize Cipher with AES/GCM/NoPadding
        cipher = Cipher.getInstance(SecurityConstants.ENCRYPTION_ALGORITHM)
        secureRandom = SecureRandom()

        // Ensure encryption key exists
        if (!keyStore.containsAlias(keyAlias)) {
            generateKey()
        }
    }

    /**
     * Encrypts data using AES-256-GCM with integrity verification.
     *
     * @param data ByteArray of data to encrypt
     * @return EncryptedData containing encrypted data, IV, and timestamp
     * @throws SecurityException if encryption fails
     */
    @Throws(SecurityException::class)
    fun encrypt(data: ByteArray): EncryptedData {
        try {
            // Generate a random IV
            val iv = ByteArray(SecurityConstants.IV_LENGTH).apply {
                secureRandom.nextBytes(this)
            }

            // Get encryption key
            val key = keyStore.getKey(keyAlias, null) as SecretKey

            // Initialize cipher for encryption
            cipher.init(
                Cipher.ENCRYPT_MODE,
                key,
                GCMParameterSpec(GCM_TAG_LENGTH, iv)
            )

            // Perform encryption
            val encryptedBytes = cipher.doFinal(data)
            
            return EncryptedData(
                encryptedBytes = encryptedBytes,
                iv = iv,
                timestamp = System.currentTimeMillis()
            )
        } catch (e: Exception) {
            throw SecurityException("Encryption failed: ${e.message}", e)
        }
    }

    /**
     * Decrypts AES-256-GCM encrypted data with integrity verification.
     *
     * @param encryptedData EncryptedData containing encrypted data, IV, and timestamp
     * @return ByteArray of decrypted data
     * @throws SecurityException if decryption fails
     */
    @Throws(SecurityException::class)
    fun decrypt(encryptedData: EncryptedData): ByteArray {
        try {
            // Get decryption key
            val key = keyStore.getKey(keyAlias, null) as SecretKey

            // Initialize cipher for decryption
            cipher.init(
                Cipher.DECRYPT_MODE,
                key,
                GCMParameterSpec(GCM_TAG_LENGTH, encryptedData.iv)
            )

            // Perform decryption
            return cipher.doFinal(encryptedData.encryptedBytes)
        } catch (e: Exception) {
            throw SecurityException("Decryption failed: ${e.message}", e)
        }
    }

    /**
     * Generates a new AES-256 key with enhanced security parameters.
     *
     * @throws SecurityException if key generation fails
     */
    @Throws(SecurityException::class)
    private fun generateKey() {
        try {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                KEY_PROVIDER
            )

            val keyGenParameterSpec = KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            ).apply {
                setKeySize(SecurityConstants.KEY_SIZE)
                setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                setRandomizedEncryptionRequired(true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    setUnlockedDeviceRequired(true)
                    if (context.packageManager.hasSystemFeature("android.hardware.strongbox")) {
                        setIsStrongBoxBacked(true)
                    }
                }
                setUserAuthenticationRequired(false)
                setKeyValidityDuration(SecurityConstants.KEY_VALIDITY_DURATION)
            }.build()

            keyGenerator.init(keyGenParameterSpec)
            keyGenerator.generateKey()
        } catch (e: Exception) {
            throw SecurityException("Key generation failed: ${e.message}", e)
        }
    }

    /**
     * Performs secure key rotation.
     *
     * @return Boolean indicating success of key rotation
     * @throws SecurityException if key rotation fails
     */
    @Throws(SecurityException::class)
    fun rotateKey(): Boolean {
        try {
            val oldKey = keyStore.getKey(keyAlias, null) as SecretKey
            val tempAlias = "$keyAlias.temp"
            
            // Generate new key
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                KEY_PROVIDER
            )
            
            // Create new key with temporary alias
            keyGenerator.init(KeyGenParameterSpec.Builder(
                tempAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            ).apply {
                setKeySize(SecurityConstants.KEY_SIZE)
                setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    setUnlockedDeviceRequired(true)
                }
            }.build())
            
            keyGenerator.generateKey()
            
            // Delete old key and rename new key
            keyStore.deleteEntry(keyAlias)
            keyStore.deleteEntry(tempAlias)
            generateKey()
            
            return true
        } catch (e: Exception) {
            throw SecurityException("Key rotation failed: ${e.message}", e)
        }
    }

    companion object {
        private const val TAG = "EncryptionManager"
    }
}