/**
 * Import/Export for encrypted project backups.
 * Handles full-project serialization, encryption, and restoration.
 */

import {
  createCryptoEnvelope,
  decryptCryptoEnvelope,
  fromBase64,
  sha256Hash,
  toBase64,
} from '../crypto/primitives';
import {
  sanitizeObject,
  validateExportPackage,
  validateFileSize,
  validateVaultPayload,
  ValidationError,
} from '../schema/validator';
import type {
  ExportPackage,
  Project,
  DocumentManifest,
  OrganizationProfile,
  ISmsScope,
  Asset,
  Risk,
  Control,
  ControlReview,
  EvidenceLink,
  Policy,
  Finding,
  ActionItem,
} from '../types';

export interface VaultPayload {
  project: Project;
  organizationProfile: OrganizationProfile | null;
  ismScope: ISmsScope | null;
  assets: Asset[];
  risks: Risk[];
  controls: Control[];
  reviews: ControlReview[];
  policies: Policy[];
  findings: Finding[];
  actions: ActionItem[];
  evidenceLinks: EvidenceLink[];
  documents: DocumentManifest[];
  binariesByDocumentId: Record<string, string>; // base64 bytes
}

const MAX_PROJECT_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_VAULT_IMPORT_BYTES = 250 * 1024 * 1024;

function parseJson(text: string, field: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError(`Invalid ${field} JSON`, field);
  }
}

/**
 * Export a project as an encrypted backup.
 */
export async function exportProjectEncrypted(
  project: Project,
  documents: DocumentManifest[],
  passphrase: string
): Promise<Blob> {
  // Create export package
  const pkg: ExportPackage = {
    version: '0.1.0',
    appVersion: '0.1.0',
    timestamp: new Date().toISOString(),
    project,
    documents,
    encrypted: true,
  };

  const plaintext = new TextEncoder().encode(JSON.stringify(pkg));
  const plainBuffer = plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength);
  const envelope = await createCryptoEnvelope(plainBuffer, passphrase);

  // Add integrity hash
  const hashInput = new TextEncoder().encode(envelope.ciphertext);
  const integrityHash = await sha256Hash(new Uint8Array(hashInput));

  const finalPkg: ExportPackage = {
    version: '0.1.0',
    appVersion: '0.1.0',
    timestamp: new Date().toISOString(),
    encrypted: true,
    crypto: envelope,
    integrityHash,
    projectSummary: {
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      documentCount: documents.length,
    },
  };

  // Serialize to JSON
  const json = JSON.stringify(finalPkg, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Import an encrypted project backup.
 */
export async function importProjectEncrypted(
  file: File,
  passphrase: string
): Promise<{ project: Project; documents: DocumentManifest[] }> {
  validateFileSize(file.size, MAX_PROJECT_IMPORT_BYTES);
  const text = await file.text();
  const outerPackage = validateExportPackage(sanitizeObject(parseJson(text, 'backup')));

  if (!outerPackage.crypto) {
    throw new Error('Invalid or corrupted backup file');
  }

  if (outerPackage.integrityHash) {
    const hashInput = new TextEncoder().encode(outerPackage.crypto.ciphertext);
    const computed = await sha256Hash(new Uint8Array(hashInput));
    if (computed !== outerPackage.integrityHash) {
      throw new Error('Backup integrity check failed');
    }
  }

  try {
    const plaintext = await decryptCryptoEnvelope(outerPackage.crypto, passphrase);
    const decryptedPackage = validateExportPackage(sanitizeObject(parseJson(new TextDecoder().decode(plaintext), 'decrypted backup')));

    if (!decryptedPackage.project) {
      throw new ValidationError('Backup is missing project data', 'project');
    }

    return {
      project: decryptedPackage.project,
      documents: decryptedPackage.documents ?? [],
    };
  } catch {
    throw new Error('Failed to decrypt backup: wrong passphrase or corrupted data');
  }
}

/**
 * Export project metadata as plain JSON (for diagnostics).
 */
export function exportProjectMetadata(
  project: Project,
  documents: DocumentManifest[]
): Blob {
  const pkg: ExportPackage = {
    version: '0.1.0',
    appVersion: '0.1.0',
    timestamp: new Date().toISOString(),
    project,
    documents,
    encrypted: false,
    integrityHash: '',
  };

  const json = JSON.stringify(pkg, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Export an encrypted local vault with all core project data.
 */
export async function exportVaultEncrypted(
  payload: VaultPayload,
  passphrase: string
): Promise<Blob> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const plainBuffer = plaintext.buffer.slice(
    plaintext.byteOffset,
    plaintext.byteOffset + plaintext.byteLength
  );
  const envelope = await createCryptoEnvelope(plainBuffer, passphrase);

  const hashInput = new TextEncoder().encode(envelope.ciphertext);
  const integrityHash = await sha256Hash(new Uint8Array(hashInput));

  const finalPkg = {
    version: '0.2.0',
    appVersion: '0.2.0',
    timestamp: new Date().toISOString(),
    encrypted: true,
    crypto: envelope,
    integrityHash,
    projectSummary: {
      id: payload.project.id,
      name: payload.project.name,
      updatedAt: payload.project.updatedAt,
      documentCount: payload.documents.length,
    },
  };

  const json = JSON.stringify(finalPkg, null, 2);
  return new Blob([json], { type: 'application/octet-stream' });
}

/**
 * Import an encrypted local vault and return the decrypted payload.
 */
export async function importVaultEncrypted(
  file: File,
  passphrase: string
): Promise<VaultPayload> {
  validateFileSize(file.size, MAX_VAULT_IMPORT_BYTES);
  const text = await file.text();
  const outerPackage = validateExportPackage(sanitizeObject(parseJson(text, 'vault file')));

  if (!outerPackage.crypto) {
    throw new Error('Invalid vault file: missing encrypted payload');
  }

  if (outerPackage.integrityHash) {
    const hashInput = new TextEncoder().encode(outerPackage.crypto.ciphertext);
    const computed = await sha256Hash(new Uint8Array(hashInput));
    if (computed !== outerPackage.integrityHash) {
      throw new Error('Vault integrity check failed');
    }
  }

  try {
    const plaintext = await decryptCryptoEnvelope(outerPackage.crypto, passphrase);
    return validateVaultPayload(sanitizeObject(parseJson(new TextDecoder().decode(plaintext), 'vault payload')));
  } catch {
    throw new Error('Failed to decrypt vault: wrong passphrase or corrupted data');
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return toBase64(new Uint8Array(buffer));
}

export function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = fromBase64(value);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
