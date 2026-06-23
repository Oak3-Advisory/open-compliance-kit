/**
 * ID Generation
 * Exports a simple alias for UUID generation used throughout the app
 */

import { generateUUID } from './helpers';

export function generateId(): string {
  return generateUUID();
}
