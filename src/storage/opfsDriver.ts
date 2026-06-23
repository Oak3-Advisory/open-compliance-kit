/**
 * OPFS (Origin Private File System) driver for binary storage.
 * TODO: Complete implementation when app matures.
 */

import type { BinaryStorageDriver } from './storageDriver';
import type { StoredBinaryRef } from '../types';
import { validateSafeId, validateStoredBinaryRef } from '../schema/validator';

export class OpfsDriver implements BinaryStorageDriver {
  readonly kind = 'opfs' as const;
  private root: FileSystemDirectoryHandle | null = null;

  async isAvailable(): Promise<boolean> {
    if (!navigator.storage?.getDirectory) {
      return false;
    }
    try {
      await navigator.storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  }

  private async getRoot(): Promise<FileSystemDirectoryHandle> {
    if (this.root) return this.root;

    const root = await navigator.storage!.getDirectory();
    const ockDir = await root.getDirectoryHandle('ock-storage', {
      create: true,
    });
    this.root = ockDir;
    return this.root;
  }

  async writeFile(params: {
    projectId: string;
    documentId: string;
    bytes: Blob | ArrayBuffer;
    metadata?: Record<string, unknown>;
  }): Promise<StoredBinaryRef> {
    const root = await this.getRoot();
    const projectId = validateSafeId(params.projectId, 'projectId');
    const documentId = validateSafeId(params.documentId, 'documentId');
    const projectDir = await root.getDirectoryHandle(projectId, {
      create: true,
    });

    const fileName = `${documentId}.bin`;
    const fileHandle = await projectDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    const arrayBuffer =
      params.bytes instanceof Blob
        ? await params.bytes.arrayBuffer()
        : params.bytes;

    await writable.write(arrayBuffer);
    await writable.close();

    return {
      projectId,
      documentId,
      driver: 'opfs',
      ref: `${projectId}/${fileName}`,
    };
  }

  async readFile(ref: StoredBinaryRef): Promise<Blob> {
    const root = await this.getRoot();
    const safeRef = validateStoredBinaryRef(ref);
    const parts = safeRef.ref.split('/');
    const projectId = parts[0];
    const fileName = parts[1];

    const projectDir = await root.getDirectoryHandle(projectId);
    const fileHandle = await projectDir.getFileHandle(fileName);
    return fileHandle.getFile();
  }

  async deleteFile(ref: StoredBinaryRef): Promise<void> {
    const root = await this.getRoot();
    const safeRef = validateStoredBinaryRef(ref);
    const parts = safeRef.ref.split('/');
    const projectId = parts[0];
    const fileName = parts[1];

    const projectDir = await root.getDirectoryHandle(projectId);
    await projectDir.removeEntry(fileName);
  }

  async exists(ref: StoredBinaryRef): Promise<boolean> {
    try {
      const root = await this.getRoot();
      const safeRef = validateStoredBinaryRef(ref);
      const parts = safeRef.ref.split('/');
      const projectId = parts[0];
      const fileName = parts[1];

      const projectDir = await root.getDirectoryHandle(projectId);
      await projectDir.getFileHandle(fileName);
      return true;
    } catch {
      return false;
    }
  }

  async listProjectFiles(projectId: string): Promise<StoredBinaryRef[]> {
    try {
      const root = await this.getRoot();
      const safeProjectId = validateSafeId(projectId, 'projectId');
      const projectDir = await root.getDirectoryHandle(safeProjectId);

      const refs: StoredBinaryRef[] = [];
      for await (const [name, handle] of projectDir.entries()) {
        if (handle.kind === 'file' && name.endsWith('.bin')) {
          const docId = name.replace('.bin', '');
          refs.push({
            projectId: safeProjectId,
            documentId: docId,
            driver: 'opfs',
            ref: `${safeProjectId}/${name}`,
          });
        }
      }
      return refs;
    } catch {
      return [];
    }
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
