/**
 * Web Crypto API primitives for Open Compliance Kit.
 * Handles key derivation, encryption, decryption with AES-GCM and PBKDF2.
 */

import type { CryptoEnvelope } from '../types';

const ALGORITHM = 'AES-GCM';
const KEY_ALGORITHM = 'PBKDF2';
const ITERATIONS = 100000; // NIST recommendation
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (96 bits for GCM)
const SALT_LENGTH = 16; // bytes (128 bits)

/**
 * Derive a symmetric key from a passphrase using PBKDF2-SHA256.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }

  const passphraseBuffer = new TextEncoder().encode(passphrase);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passphraseBuffer,
    KEY_ALGORITHM,
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: KEY_ALGORITHM,
      salt: saltBuffer,
      hash: 'SHA-256',
      iterations: ITERATIONS,
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with AES-GCM.
 */
export async function encryptData(
  key: CryptoKey,
  plaintext: ArrayBuffer,
  iv?: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  iv = iv || crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: ivBuffer },
    key,
    plaintext
  );

  return {
    ciphertext: new Uint8Array(cipherBuffer),
    iv,
  };
}

/**
 * Decrypt data with AES-GCM.
 */
export async function decryptData(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  try {
    const ciphertextBuffer = ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength) as ArrayBuffer;
    const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
    return await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: ivBuffer },
      key,
      ciphertextBuffer
    );
  } catch (err) {
    throw new Error('Decryption failed. Wrong passphrase or corrupted data.');
  }
}

/**
 * Create a crypto envelope for export.
 */
export async function createCryptoEnvelope(
  plaintext: ArrayBuffer,
  passphrase: string
): Promise<CryptoEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(passphrase, salt);
  const { ciphertext, iv } = await encryptData(key, plaintext);

  return {
    version: 1,
    cipher: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    salt: toBase64(salt),
    iv: toBase64(iv),
    iterations: ITERATIONS,
    ciphertext: toBase64(ciphertext),
  };
}

/**
 * Decrypt a crypto envelope.
 */
export async function decryptCryptoEnvelope(
  envelope: CryptoEnvelope,
  passphrase: string
): Promise<ArrayBuffer> {
  if (envelope.version !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope.version}`);
  }

  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);

  const key = await deriveKey(passphrase, salt);
  return decryptData(key, ciphertext, iv);
}

/**
 * Utility: Convert Uint8Array to Base64.
 */
export function toBase64(buffer: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, Array.from(buffer)));
}

/**
 * Utility: Convert Base64 to Uint8Array.
 */
export function fromBase64(str: string): Uint8Array {
  const binaryString = atob(str);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compute SHA-256 hash of data.
 */
export async function sha256Hash(data: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(data.length);
  const view = new Uint8Array(buffer);
  view.set(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
