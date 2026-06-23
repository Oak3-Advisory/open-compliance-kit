/**
 * Storage driver abstraction layer.
 * UI components never directly depend on IndexedDB, OPFS, or File System Access.
 */

import type { StoredBinaryRef } from '../types';
import { validateSafeId, validateStoredBinaryRef } from '../schema/validator';

export interface BinaryStorageDriver {
  readonly kind: 'opfs' | 'indexeddb-blob' | 'external-folder';

  isAvailable(): Promise<boolean>;

  writeFile(params: {
    projectId: string;
    documentId: string;
    bytes: Blob | ArrayBuffer;
    metadata?: Record<string, unknown>;
  }): Promise<StoredBinaryRef>;

  readFile(ref: StoredBinaryRef): Promise<Blob>;

  deleteFile(ref: StoredBinaryRef): Promise<void>;

  exists(ref: StoredBinaryRef): Promise<boolean>;

  listProjectFiles(projectId: string): Promise<StoredBinaryRef[]>;

  getStorageEstimate(): Promise<{ usage: number; quota: number }>;
}

/**
 * Runtime storage manager that selects the best available driver.
 */
export class StorageManager {
  private driver: BinaryStorageDriver | null = null;
  private drivers: BinaryStorageDriver[];
  private db: IDBDatabase | null = null;

  constructor(drivers: BinaryStorageDriver[]) {
    this.drivers = drivers;
  }

  async initialize(): Promise<void> {
    // Initialize binary storage driver
    for (const driver of this.drivers) {
      if (await driver.isAvailable()) {
        this.driver = driver;
        console.log(`[StorageManager] Using driver: ${driver.kind}`);
        break;
      }
    }
    
    if (!this.driver) {
      throw new Error('No storage driver available in this browser');
    }

    // Initialize IndexedDB for structured records
    if ('indexedDB' in window) {
      this.db = await this.initializeIndexedDB();
    }
  }

  private initializeIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ock-db', 2);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores for different record types
        const stores = [
          'projects',
          'organizationProfiles',
          'ismScopes',
          'assets',
          'risks',
          'controls',
          'evidenceLinks',
          'evidence',
          'policies',
          'reviews',
          'findings',
          'actions',
          'frameworks',
        ];

        stores.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
      };
    });
  }

  async saveRecord(table: string, record: any): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([table], 'readwrite');
      const store = transaction.objectStore(table);
      const request = store.put(record);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getRecord(table: string, id: string): Promise<any> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([table], 'readonly');
      const store = transaction.objectStore(table);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async queryRecords(table: string, filter: any = {}): Promise<any[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([table], 'readonly');
      const store = transaction.objectStore(table);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const records = request.result;
        
        // Simple in-memory filtering for now
        // In the future, this could use IndexedDB's more advanced query capabilities
        if (Object.keys(filter).length === 0) {
          resolve(records);
        } else {
          const filtered = records.filter((record) => {
            return Object.entries(filter).every(([key, value]) => record[key] === value);
          });
          resolve(filtered);
        }
      };
    });
  }

  async deleteRecord(table: string, id: string): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([table], 'readwrite');
      const store = transaction.objectStore(table);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveEvidence(): Promise<void> {
    // TODO: Implement evidence storage
  }

  async readEvidence(): Promise<any> {
    // TODO: Implement evidence retrieval
  }

  async deleteEvidence(): Promise<void> {
    // TODO: Implement evidence deletion
  }

  async writeBinaryFile(params: {
    projectId: string;
    documentId: string;
    bytes: Blob | ArrayBuffer;
    metadata?: Record<string, unknown>;
  }): Promise<StoredBinaryRef> {
    if (!this.driver) {
      throw new Error('Binary storage driver not initialized');
    }

    const projectId = validateSafeId(params.projectId, 'projectId');
    const documentId = validateSafeId(params.documentId, 'documentId');

    return this.driver.writeFile({
      ...params,
      projectId,
      documentId,
    });
  }

  async readBinaryFile(ref: StoredBinaryRef): Promise<Blob> {
    if (!this.driver) {
      throw new Error('Binary storage driver not initialized');
    }

    return this.driver.readFile(validateStoredBinaryRef(ref));
  }

  async deleteBinaryFile(ref: StoredBinaryRef): Promise<void> {
    if (!this.driver) {
      throw new Error('Binary storage driver not initialized');
    }

    await this.driver.deleteFile(validateStoredBinaryRef(ref));
  }

  getActiveDriverKind(): BinaryStorageDriver['kind'] | null {
    return this.driver?.kind || null;
  }

  async estimateQuota(): Promise<{ usage: number; quota: number }> {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
    return { usage: 0, quota: 0 };
  }

  async requestPersistence(): Promise<boolean> {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
    return false;
  }
}