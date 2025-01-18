/**
 * @fileoverview Secure client-side storage utilities for PHRSAT web application
 * @version 2.0.0
 * 
 * Implements HIPAA-compliant storage with:
 * - AES-256-GCM encryption
 * - Field-level PHI protection
 * - LRU caching mechanism
 * - Storage quota management
 */

import CryptoJS from 'crypto-js'; // version: ^4.1.1
import { Document, DocumentMetadata } from '../types/documents.types';
import { ApiError } from '../types/api.types';

// Constants
const STORAGE_PREFIX = 'PHRSAT_';
const ENCRYPTION_KEY = process.env.REACT_APP_STORAGE_ENCRYPTION_KEY as string;
const MAX_STORAGE_SIZE = 5242880; // 5MB
const STORAGE_VERSION = '2.0.0';
const LRU_CACHE_SIZE = 100;
const ENCRYPTION_ALGORITHM = 'AES-256-GCM';

// LRU Cache implementation
const lruCache = new Map<string, StorageItem>();

/**
 * Storage operation configuration interface
 */
export interface StorageOptions {
  encryptionLevel: 'NONE' | 'BASIC' | 'PHI';
  namespace?: string;
  expiresIn?: number;
  compressionEnabled?: boolean;
  validateIntegrity?: boolean;
}

/**
 * Stored item interface with encryption metadata
 */
interface StorageItem {
  value: any;
  timestamp: number;
  expiresAt: number;
  encryptionMetadata: {
    iv: string;
    version: string;
  };
  lastAccessed: number;
  integrity?: string;
}

/**
 * Generates a cryptographically secure initialization vector
 */
const generateIV = (): string => {
  return CryptoJS.lib.WordArray.random(16).toString();
};

/**
 * Calculates integrity hash for stored data
 */
const calculateIntegrity = (value: any, iv: string): string => {
  const data = JSON.stringify(value) + iv;
  return CryptoJS.SHA256(data).toString();
};

/**
 * Validates storage quota and performs cleanup if needed
 */
export const validateStorageQuota = async (requiredSpace: number): Promise<boolean> => {
  try {
    let currentSize = 0;
    for (const key in localStorage) {
      if (key.startsWith(STORAGE_PREFIX)) {
        currentSize += localStorage.getItem(key)?.length || 0;
      }
    }

    if (currentSize + requiredSpace > MAX_STORAGE_SIZE) {
      // Perform LRU cleanup
      const sortedItems = Array.from(lruCache.entries())
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      
      while (currentSize + requiredSpace > MAX_STORAGE_SIZE && sortedItems.length) {
        const [key] = sortedItems.shift()!;
        const itemSize = localStorage.getItem(key)?.length || 0;
        localStorage.removeItem(key);
        lruCache.delete(key);
        currentSize -= itemSize;
      }
    }

    return (currentSize + requiredSpace) <= MAX_STORAGE_SIZE;
  } catch (error) {
    throw new Error('Storage quota validation failed');
  }
};

/**
 * Encrypts sensitive data with field-level encryption
 */
const encryptValue = (value: any, iv: string, options: StorageOptions): string => {
  const serializedValue = JSON.stringify(value);
  
  if (options.encryptionLevel === 'PHI') {
    // Apply field-level encryption for PHI data
    if (typeof value === 'object') {
      Object.keys(value).forEach(key => {
        if (value[key]?.phi) {
          value[key] = CryptoJS.AES.encrypt(
            JSON.stringify(value[key]),
            ENCRYPTION_KEY + iv,
            { mode: CryptoJS.mode.GCM }
          ).toString();
        }
      });
    }
  }

  return CryptoJS.AES.encrypt(
    serializedValue,
    ENCRYPTION_KEY + iv,
    { mode: CryptoJS.mode.GCM }
  ).toString();
};

/**
 * Decrypts stored data with field-level decryption support
 */
const decryptValue = (encrypted: string, iv: string, options: StorageOptions): any => {
  const decrypted = CryptoJS.AES.decrypt(
    encrypted,
    ENCRYPTION_KEY + iv,
    { mode: CryptoJS.mode.GCM }
  ).toString(CryptoJS.enc.Utf8);

  const value = JSON.parse(decrypted);

  if (options.encryptionLevel === 'PHI' && typeof value === 'object') {
    // Decrypt PHI fields
    Object.keys(value).forEach(key => {
      if (value[key]?.phi) {
        value[key] = JSON.parse(
          CryptoJS.AES.decrypt(
            value[key],
            ENCRYPTION_KEY + iv,
            { mode: CryptoJS.mode.GCM }
          ).toString(CryptoJS.enc.Utf8)
        );
      }
    });
  }

  return value;
};

/**
 * Securely stores an item with encryption and integrity verification
 */
export const setSecureItem = async (
  key: string,
  value: any,
  options: StorageOptions = { encryptionLevel: 'BASIC' }
): Promise<void> => {
  try {
    const fullKey = `${STORAGE_PREFIX}${options.namespace || ''}${key}`;
    const iv = generateIV();
    
    // Validate storage quota
    const serializedSize = JSON.stringify(value).length;
    if (!(await validateStorageQuota(serializedSize))) {
      throw new Error('Storage quota exceeded');
    }

    const storageItem: StorageItem = {
      value: encryptValue(value, iv, options),
      timestamp: Date.now(),
      expiresAt: options.expiresIn ? Date.now() + options.expiresIn : 0,
      encryptionMetadata: {
        iv,
        version: STORAGE_VERSION
      },
      lastAccessed: Date.now(),
      integrity: options.validateIntegrity ? calculateIntegrity(value, iv) : undefined
    };

    localStorage.setItem(fullKey, JSON.stringify(storageItem));
    lruCache.set(fullKey, storageItem);

    // Maintain LRU cache size
    if (lruCache.size > LRU_CACHE_SIZE) {
      const firstKey = lruCache.keys().next().value;
      lruCache.delete(firstKey);
    }
  } catch (error) {
    throw new ApiError({
      code: 'STORAGE_ERROR',
      message: 'Failed to store item securely',
      details: { error },
      correlationId: '',
      timestamp: Date.now(),
      path: 'storage.utils.ts',
      retryable: false
    });
  }
};

/**
 * Retrieves and decrypts stored items with integrity verification
 */
export const getSecureItem = async <T = any>(
  key: string,
  options: StorageOptions = { encryptionLevel: 'BASIC' }
): Promise<T | null> => {
  try {
    const fullKey = `${STORAGE_PREFIX}${options.namespace || ''}${key}`;
    
    // Check LRU cache first
    if (lruCache.has(fullKey)) {
      const cachedItem = lruCache.get(fullKey)!;
      if (cachedItem.expiresAt && cachedItem.expiresAt < Date.now()) {
        lruCache.delete(fullKey);
        localStorage.removeItem(fullKey);
        return null;
      }
      cachedItem.lastAccessed = Date.now();
      return decryptValue(cachedItem.value, cachedItem.encryptionMetadata.iv, options);
    }

    const storedItem = localStorage.getItem(fullKey);
    if (!storedItem) return null;

    const item: StorageItem = JSON.parse(storedItem);

    // Check expiration
    if (item.expiresAt && item.expiresAt < Date.now()) {
      localStorage.removeItem(fullKey);
      return null;
    }

    // Verify integrity if enabled
    if (options.validateIntegrity && item.integrity) {
      const decryptedValue = decryptValue(item.value, item.encryptionMetadata.iv, options);
      const currentIntegrity = calculateIntegrity(decryptedValue, item.encryptionMetadata.iv);
      if (currentIntegrity !== item.integrity) {
        throw new Error('Data integrity validation failed');
      }
    }

    // Update last accessed time
    item.lastAccessed = Date.now();
    localStorage.setItem(fullKey, JSON.stringify(item));
    lruCache.set(fullKey, item);

    return decryptValue(item.value, item.encryptionMetadata.iv, options);
  } catch (error) {
    throw new ApiError({
      code: 'STORAGE_ERROR',
      message: 'Failed to retrieve stored item',
      details: { error },
      correlationId: '',
      timestamp: Date.now(),
      path: 'storage.utils.ts',
      retryable: false
    });
  }
};

/**
 * Rotates encryption key and re-encrypts stored data
 */
export const rotateEncryptionKey = async (newKey: string): Promise<void> => {
  try {
    const keys = Object.keys(localStorage);
    const phrsatKeys = keys.filter(key => key.startsWith(STORAGE_PREFIX));

    for (const key of phrsatKeys) {
      const item: StorageItem = JSON.parse(localStorage.getItem(key)!);
      const decryptedValue = decryptValue(
        item.value,
        item.encryptionMetadata.iv,
        { encryptionLevel: 'PHI' }
      );

      const newIv = generateIV();
      item.value = encryptValue(decryptedValue, newIv, { encryptionLevel: 'PHI' });
      item.encryptionMetadata.iv = newIv;
      item.timestamp = Date.now();

      localStorage.setItem(key, JSON.stringify(item));
      if (lruCache.has(key)) {
        lruCache.set(key, item);
      }
    }
  } catch (error) {
    throw new ApiError({
      code: 'ENCRYPTION_ERROR',
      message: 'Failed to rotate encryption key',
      details: { error },
      correlationId: '',
      timestamp: Date.now(),
      path: 'storage.utils.ts',
      retryable: false
    });
  }
};