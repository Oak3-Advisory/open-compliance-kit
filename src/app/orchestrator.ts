/**
 * App orchestrator: coordinates router, store, and storage initialization.
 */

import { globalStore } from '../state/store';
import { router } from './router';
import { StorageManager } from '../storage/storageDriver';
import { IndexedDbBlobDriver } from '../storage/indexedDbDriver';
import { ProjectStore } from '../state/projectStore';
import type { BrowserCapabilities } from '../types';

export class AppOrchestrator {
  private storageManager: StorageManager | null = null;
  private projectStore: ProjectStore | null = null;
  private capabilities: BrowserCapabilities | null = null;

  async initialize(): Promise<void> {
    // Check browser capabilities
    this.capabilities = this.detectCapabilities();
    console.log('[AppOrchestrator] Browser capabilities:', this.capabilities);

    if (!this.capabilities.supportsIndexedDB) {
      throw new Error(
        'This browser does not support IndexedDB. Open Compliance Kit requires modern browser storage.'
      );
    }

    if (!this.capabilities.supportsWebCrypto) {
      console.warn(
        '[AppOrchestrator] Web Crypto API not available. Encryption features will be disabled.'
      );
      globalStore.setEncryptionEnabled(false);
    } else {
      globalStore.setEncryptionEnabled(true);
    }

    // Initialize storage manager
    const drivers = [new IndexedDbBlobDriver()];
    // TODO: Add OPFS driver when available
    // TODO: Add external folder driver when available

    this.storageManager = new StorageManager(drivers);
    await this.storageManager.initialize();

    // Initialize project store
    this.projectStore = new ProjectStore(this.storageManager);

    console.log('[AppOrchestrator] Initialized');
  }

  private detectCapabilities(): BrowserCapabilities {
    return {
      supportsIndexedDB: 'indexedDB' in window,
      supportsWebCrypto: !!crypto?.subtle,
      supportsOPFS: !!navigator.storage?.getDirectory,
      supportsFileSystemAccess: 'showDirectoryPicker' in window,
    };
  }

  getCapabilities(): BrowserCapabilities {
    if (!this.capabilities) {
      throw new Error('Orchestrator not initialized');
    }
    return this.capabilities;
  }

  getStorageManager(): StorageManager {
    if (!this.storageManager) {
      throw new Error('StorageManager not initialized');
    }
    return this.storageManager;
  }

  getProjectStore(): ProjectStore {
    if (!this.projectStore) {
      throw new Error('ProjectStore not initialized');
    }
    return this.projectStore;
  }

  getStore() {
    return globalStore;
  }

  getRouter() {
    return router;
  }
}

export const appOrchestrator = new AppOrchestrator();
