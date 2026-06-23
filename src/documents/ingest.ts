/**
 * Document ingest utilities.
 * Handles file import, validation, hashing, and safe storage.
 */

import { sha256Hash } from '../crypto/primitives';
import { validateFileSize } from '../schema/validator';

/**
 * Safe MIME type allowlist for ISMS documents.
 */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Ingest a file: validate, compute hash, and return safe metadata.
 */
export async function ingestFile(file: File): Promise<{
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  safeName: string;
}> {
  // Validate file size
  validateFileSize(file.size);

  // Validate MIME type
  const mimeType = file.type;
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`MIME type not allowed: ${mimeType}`);
  }

  // Read file bytes
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Compute SHA-256
  const sha256 = await sha256Hash(bytes);

  // Create safe display name (strip dangerous characters)
  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 255);

  return {
    sha256,
    sizeBytes: file.size,
    mimeType,
    safeName,
  };
}

/**
 * Generate thumbnail for image files (basic).
 * For production, use canvas/imaging library.
 */
export async function generateThumbnail(
  file: File
): Promise<Blob | null> {
  if (!file.type.startsWith('image/')) {
    return null;
  }

  // Stub: would use Canvas API or imaging library in production
  console.log(`[generateThumbnail] Stub for ${file.name}`);
  return null;
}

/**
 * Check if file appears to be executable (based on extension/magic bytes).
 */
export function isExecutableFile(fileName: string): boolean {
  const executableExtensions = [
    '.exe',
    '.bat',
    '.cmd',
    '.com',
    '.scr',
    '.vbs',
    '.js',
    '.sh',
  ];
  return executableExtensions.some((ext) =>
    fileName.toLowerCase().endsWith(ext)
  );
}

/**
 * Safe file name normalization (prevent path traversal).
 */
export function normalizePath(filePath: string): string {
  // Remove any path separators and dangerous sequences
  return filePath
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '_')
    .replace(/^[.]/, '_')
    .substring(0, 255);
}
