/**
 * UUID generation utilities using node:crypto
 */

import { randomUUID } from 'node:crypto';

/**
 * Generate a UUID v4 string
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Generate a UUID v7-like string (time-ordered)
 * Format: timestamp (48 bits) + version (4 bits) + random (12 bits) + variant (2 bits) + random (62 bits)
 */
export function generateTimeOrderedUUID(): string {
  const timestamp = Date.now();

  // Convert timestamp to hex (48 bits = 12 hex chars)
  const timestampHex = timestamp.toString(16).padStart(12, '0');

  // Generate random bytes for the rest
  const randomPart = randomUUID().replace(/-/g, '').slice(12);

  // Construct UUID v7-like format
  const uuid = [
    timestampHex.slice(0, 8), // time_high
    timestampHex.slice(8, 12) + '7', // time_low + version 7
    randomPart.slice(0, 3), // random with version
    ((parseInt(randomPart.slice(3, 4), 16) & 0x3) | 0x8).toString(16) + randomPart.slice(4, 7), // variant + random
    randomPart.slice(7, 19), // random
  ].join('-');

  return uuid;
}
