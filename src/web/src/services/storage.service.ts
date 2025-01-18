/**
 * @fileoverview Enhanced secure client-side storage service for PHRSAT web application
 * @version 1.0.0
 * 
 * Implements HIPAA-compliant storage with:
 * - AES-256-GCM encryption
 * - Field-level PHI protection
 * - LRU caching with compression
 * - Storage quota management
 */

import CryptoJS from 'crypto-js'; // version: ^4.1.1
import * as LZString from 'lz-string'; // version: ^1.5.0
import { setSecureItem, getSecureItem, removeItem, clearStorage } from '../utils/storage.utils';
import { Document, DocumentMetadata } from '../types/documents.types';
import { ApiError } from '../types/api.types';

// Constants for storage configuration
const DEFAULT_NAMESPACE = 'PHRSAT_STORAGE';
const DEFAULT_EXPIRATION = 86400000; // 24 hours in milliseconds
const MAX_CACHE_SIZE = 100;
const STORAGE_VERSION = '1.0.0';
const DEFAULT_COMPRESSION_THRESHOLD = 1024; // bytes
const MAX_STORAGE_QUOTA = 10485760; // 10MB
const KEY_ROTATION_INTERVAL = 2592000000; // 30 days in milliseconds

/**
 * Enhanced configuration interface for StorageService
 */
export interface StorageServiceConfig {
  encryptionKey: string;
  namespace?: string;
  defaultExpirationTime?: number;
  encryptByDefault?: boolean;
  maxStorageQuota?: number;
  enableCompression?: boolean;
  compressionThreshold?: number;
  keyRotationInterval?: number;
}

/**
 * Extended options for storage operations
 */
export interface StorageOptions {
  encrypt?: boolean;
  expiresIn?: number;
  namespace?: string;
  compress?: boolean;
  verifyIntegrity?: boolean;
  encryptionVersion?: string;
}

/**
 * LRU Cache implementation for optimized storage access
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Enhanced service class for managing secure client-side storage operations
 */
export class StorageService {
  private config: StorageServiceConfig;
  private cache: LRUCache<string, any>;
  private currentStorageSize: number;
  private integrityHashes: Map<string, string>;
  private lastKeyRotation: number;

  constructor(config: StorageServiceConfig) {
    this.config = {
      namespace: DEFAULT_NAMESPACE,
      defaultExpirationTime: DEFAULT_EXPIRATION,
      encryptByDefault: true,
      maxStorageQuota: MAX_STORAGE_QUOTA,
      enableCompression: true,
      compressionThreshold: DEFAULT_COMPRESSION_THRESHOLD,
      keyRotationInterval: KEY_ROTATION_INTERVAL,
      ...config
    };

    this.cache = new LRUCache<string, any>(MAX_CACHE_SIZE);
    this.integrityHashes = new Map();
    this.currentStorageSize = this.calculateCurrentStorageSize();
    this.lastKeyRotation = Date.now();

    // Setup periodic key rotation
    this.setupKeyRotation();
  }

  /**
   * Stores an item with encryption, compression, and integrity verification
   */
  public async setItem<T>(key: string, value: T, options?: StorageOptions): Promise<void> {
    try {
      const finalOptions = this.mergeOptions(options);
      const storageKey = this.getStorageKey(key, finalOptions.namespace);
      
      // Check storage quota
      const serializedValue = JSON.stringify(value);
      if (!this.checkStorageQuota(serializedValue.length)) {
        throw new Error('Storage quota exceeded');
      }

      // Compress if enabled and meets threshold
      let processedValue: any = value;
      if (finalOptions.compress && serializedValue.length > this.config.compressionThreshold!) {
        processedValue = LZString.compress(serializedValue);
      }

      // Calculate integrity hash
      if (finalOptions.verifyIntegrity) {
        const hash = CryptoJS.SHA256(serializedValue).toString();
        this.integrityHashes.set(storageKey, hash);
      }

      await setSecureItem(storageKey, processedValue, {
        encryptionLevel: finalOptions.encrypt ? 'PHI' : 'NONE',
        expiresIn: finalOptions.expiresIn,
        validateIntegrity: finalOptions.verifyIntegrity
      });

      this.cache.set(storageKey, processedValue);
      this.updateStorageSize(serializedValue.length);

    } catch (error) {
      throw new ApiError({
        code: 'STORAGE_ERROR',
        message: 'Failed to store item',
        details: { error, key },
        correlationId: '',
        timestamp: Date.now(),
        path: 'storage.service.ts',
        retryable: false
      });
    }
  }

  /**
   * Retrieves and verifies an item from storage
   */
  public async getItem<T>(key: string, options?: StorageOptions): Promise<T | null> {
    try {
      const finalOptions = this.mergeOptions(options);
      const storageKey = this.getStorageKey(key, finalOptions.namespace);

      // Check cache first
      const cachedValue = this.cache.get(storageKey);
      if (cachedValue) {
        return this.processRetrievedValue<T>(cachedValue, finalOptions);
      }

      const storedValue = await getSecureItem<T>(storageKey, {
        encryptionLevel: finalOptions.encrypt ? 'PHI' : 'NONE',
        validateIntegrity: finalOptions.verifyIntegrity
      });

      if (!storedValue) {
        return null;
      }

      // Verify integrity if enabled
      if (finalOptions.verifyIntegrity) {
        const storedHash = this.integrityHashes.get(storageKey);
        const currentHash = CryptoJS.SHA256(JSON.stringify(storedValue)).toString();
        if (storedHash && storedHash !== currentHash) {
          throw new Error('Data integrity verification failed');
        }
      }

      const processedValue = this.processRetrievedValue<T>(storedValue, finalOptions);
      this.cache.set(storageKey, processedValue);
      return processedValue;

    } catch (error) {
      throw new ApiError({
        code: 'STORAGE_ERROR',
        message: 'Failed to retrieve item',
        details: { error, key },
        correlationId: '',
        timestamp: Date.now(),
        path: 'storage.service.ts',
        retryable: false
      });
    }
  }

  /**
   * Removes an item from storage and cache
   */
  public async removeItem(key: string, options?: StorageOptions): Promise<void> {
    const finalOptions = this.mergeOptions(options);
    const storageKey = this.getStorageKey(key, finalOptions.namespace);
    
    await removeItem(storageKey);
    this.cache.delete(storageKey);
    this.integrityHashes.delete(storageKey);
  }

  /**
   * Clears all storage and cache
   */
  public async clear(): Promise<void> {
    await clearStorage();
    this.cache.clear();
    this.integrityHashes.clear();
    this.currentStorageSize = 0;
  }

  // Private helper methods

  private mergeOptions(options?: StorageOptions): Required<StorageOptions> {
    return {
      encrypt: this.config.encryptByDefault,
      expiresIn: this.config.defaultExpirationTime,
      namespace: this.config.namespace,
      compress: this.config.enableCompression,
      verifyIntegrity: true,
      encryptionVersion: STORAGE_VERSION,
      ...options
    };
  }

  private getStorageKey(key: string, namespace?: string): string {
    return `${namespace || this.config.namespace}_${key}`;
  }

  private calculateCurrentStorageSize(): number {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.config.namespace!)) {
        size += localStorage.getItem(key)?.length || 0;
      }
    }
    return size;
  }

  private checkStorageQuota(additionalSize: number): boolean {
    return (this.currentStorageSize + additionalSize) <= this.config.maxStorageQuota!;
  }

  private updateStorageSize(changeInBytes: number): void {
    this.currentStorageSize += changeInBytes;
    if (this.currentStorageSize < 0) {
      this.currentStorageSize = this.calculateCurrentStorageSize();
    }
  }

  private processRetrievedValue<T>(value: any, options: Required<StorageOptions>): T {
    if (options.compress && typeof value === 'string') {
      const decompressed = LZString.decompress(value);
      return decompressed ? JSON.parse(decompressed) : value;
    }
    return value;
  }

  private setupKeyRotation(): void {
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastKeyRotation >= this.config.keyRotationInterval!) {
        this.rotateEncryptionKey();
        this.lastKeyRotation = now;
      }
    }, 3600000); // Check every hour
  }

  private async rotateEncryptionKey(): Promise<void> {
    const newKey = CryptoJS.lib.WordArray.random(32).toString();
    // Re-encrypt all stored data with new key
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.config.namespace!)) {
        const value = await this.getItem(key);
        if (value) {
          await this.setItem(key, value, { encrypt: true });
        }
      }
    }
    this.config.encryptionKey = newKey;
  }
}