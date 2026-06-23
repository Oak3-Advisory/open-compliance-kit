/**
 * IndexedDB fallback driver for binary storage.
 * Used when OPFS is unavailable.
 */

import type { BinaryStorageDriver } from './storageDriver';
import type { StoredBinaryRef } from '../types';
import { validateSafeId, validateStoredBinaryRef } from '../schema/validator';

const DB_NAME = 'ock-storage';
const STORE_NAME = 'binaries';
const DB_VERSION = 1;

export class IndexedDbBlobDriver implements BinaryStorageDriver {
  readonly kind = 'indexeddb-blob' as const;
  private db: IDBDatabase | null = null;

  async isAvailable(): Promise<boolean> {
    return 'indexedDB' in window;
  }

  private async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('projectId', 'projectId', { unique: false });
        }
      };
    });
  }

  async writeFile(params: {
    projectId: string;
    documentId: string;
    bytes: Blob | ArrayBuffer;
    metadata?: Record<string, unknown>;
  }): Promise<StoredBinaryRef> {
    const db = await this.getDb();
    const projectId = validateSafeId(params.projectId, 'projectId');
    const documentId = validateSafeId(params.documentId, 'documentId');
    const key = `${projectId}/${documentId}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record = {
        key,
        projectId,
        documentId,
        blob: params.bytes,
        metadata: params.metadata || {},
        timestamp: Date.now(),
      };

      const req = store.put(record);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        resolve({
          projectId,
          documentId,
          driver: 'indexeddb-blob',
          ref: key,
        });
      };
    });
  }

  async readFile(ref: StoredBinaryRef): Promise<Blob> {
    const db = await this.getDb();
    const safeRef = validateStoredBinaryRef(ref);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(safeRef.ref);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) {
          reject(new Error(`File not found: ${safeRef.ref}`));
          return;
        }
        resolve(record.blob);
      };
    });
  }

  async deleteFile(ref: StoredBinaryRef): Promise<void> {
    const db = await this.getDb();
    const safeRef = validateStoredBinaryRef(ref);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(safeRef.ref);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async exists(ref: StoredBinaryRef): Promise<boolean> {
    const db = await this.getDb();
    const safeRef = validateStoredBinaryRef(ref);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(safeRef.ref);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        resolve(!!req.result);
      };
    });
  }

  async listProjectFiles(projectId: string): Promise<StoredBinaryRef[]> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('projectId');
      const req = index.getAll(projectId);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const records = req.result;
        const refs: StoredBinaryRef[] = records.map((r) => ({
          projectId: r.projectId,
          documentId: r.documentId,
          driver: 'indexeddb-blob',
          ref: r.key,
        }));
        resolve(refs);
      };
    });
  }

  async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    if (!navigator.storage?.estimate) {
      return { usage: 0, quota: 0 };
    }

    const est = await navigator.storage.estimate();
    return {
      usage: est.usage || 0,
      quota: est.quota || 0,
    };
  }
}
