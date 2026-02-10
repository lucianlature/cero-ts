/**
 * Built-in Type Coercions
 */

import { CoercionError } from '../errors.js';

/**
 * Coercion function type
 */
export type CoercionFunction = (
  value: unknown,
  options?: Record<string, unknown>
) => unknown;

/**
 * Built-in coercion registry
 */
export const coercions: Record<string, CoercionFunction> = {
  /**
   * Coerce to string
   */
  string: (value) => {
    if (value === null || value === undefined) return value;
    return String(value);
  },

  /**
   * Coerce to integer
   */
  integer: (value) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new CoercionError('value', value, 'integer', 'Value is not finite');
      }
      return Math.trunc(value);
    }

    if (typeof value === 'string') {
      const str = value.trim();

      // Handle hex
      if (str.startsWith('0x') || str.startsWith('0X')) {
        const parsed = parseInt(str, 16);
        if (Number.isNaN(parsed)) {
          throw new CoercionError('value', value, 'integer');
        }
        return parsed;
      }

      // Handle octal
      if (str.startsWith('0o') || str.startsWith('0O')) {
        const parsed = parseInt(str.slice(2), 8);
        if (Number.isNaN(parsed)) {
          throw new CoercionError('value', value, 'integer');
        }
        return parsed;
      }

      // Handle binary
      if (str.startsWith('0b') || str.startsWith('0B')) {
        const parsed = parseInt(str.slice(2), 2);
        if (Number.isNaN(parsed)) {
          throw new CoercionError('value', value, 'integer');
        }
        return parsed;
      }

      // Standard integer
      const parsed = parseInt(str, 10);
      if (Number.isNaN(parsed)) {
        throw new CoercionError('value', value, 'integer');
      }
      return parsed;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    throw new CoercionError('value', value, 'integer');
  },

  /**
   * Coerce to float
   */
  float: (value) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new CoercionError('value', value, 'float', 'Value is not finite');
      }
      return value;
    }

    if (typeof value === 'string') {
      const parsed = parseFloat(value.trim());
      if (Number.isNaN(parsed)) {
        throw new CoercionError('value', value, 'float');
      }
      return parsed;
    }

    if (typeof value === 'boolean') {
      return value ? 1.0 : 0.0;
    }

    throw new CoercionError('value', value, 'float');
  },

  /**
   * Coerce to boolean
   */
  boolean: (value) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'boolean') return value;

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value === 'string') {
      const str = value.toLowerCase().trim();
      const truthy = ['true', 'yes', 'on', '1', 't', 'y'];
      const falsy = ['false', 'no', 'off', '0', 'f', 'n', ''];

      if (truthy.includes(str)) return true;
      if (falsy.includes(str)) return false;

      throw new CoercionError('value', value, 'boolean');
    }

    throw new CoercionError('value', value, 'boolean');
  },

  /**
   * Coerce to Date
   */
  date: (value, options) => {
    if (value === null || value === undefined) return value;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new CoercionError('value', value, 'date', 'Invalid date');
      }
      return value;
    }

    if (typeof value === 'string') {
      const strptime = options?.strptime as string | undefined;
      let date: Date;

      if (strptime) {
        date = parseWithFormat(value, strptime);
      } else {
        date = new Date(value);
      }

      if (Number.isNaN(date.getTime())) {
        throw new CoercionError('value', value, 'date');
      }

      // Return date-only (strip time)
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    if (typeof value === 'number') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new CoercionError('value', value, 'date');
      }
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    throw new CoercionError('value', value, 'date');
  },

  /**
   * Coerce to DateTime
   */
  datetime: (value, options) => {
    if (value === null || value === undefined) return value;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new CoercionError('value', value, 'datetime', 'Invalid datetime');
      }
      return value;
    }

    if (typeof value === 'string') {
      const strptime = options?.strptime as string | undefined;
      let date: Date;

      if (strptime) {
        date = parseWithFormat(value, strptime);
      } else {
        date = new Date(value);
      }

      if (Number.isNaN(date.getTime())) {
        throw new CoercionError('value', value, 'datetime');
      }

      return date;
    }

    if (typeof value === 'number') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new CoercionError('value', value, 'datetime');
      }
      return date;
    }

    throw new CoercionError('value', value, 'datetime');
  },

  /**
   * Coerce to Time (Date with time component)
   */
  time: (value, options) => {
    return coercions.datetime!(value, options);
  },

  /**
   * Coerce to array
   */
  array: (value) => {
    if (value === null || value === undefined) return value;

    if (Array.isArray(value)) return value;

    if (typeof value === 'string') {
      const str = value.trim();

      // Try JSON parse for array strings
      if (str.startsWith('[')) {
        try {
          const parsed = JSON.parse(str);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Not valid JSON, fall through
        }
      }

      // Single value as array
      return [value];
    }

    // Wrap single value in array
    return [value];
  },

  /**
   * Coerce to hash/object
   */
  hash: (value) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const str = value.trim();

      // Try JSON parse for object strings
      if (str.startsWith('{')) {
        try {
          const parsed = JSON.parse(str);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          // Not valid JSON
        }
      }

      throw new CoercionError('value', value, 'hash');
    }

    throw new CoercionError('value', value, 'hash');
  },

  /**
   * Alias for hash
   */
  object: (value) => coercions.hash!(value),

  /**
   * Coerce to symbol (string as identifier)
   */
  symbol: (value) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'symbol') return value;

    if (typeof value === 'string') {
      return Symbol.for(value);
    }

    return Symbol.for(String(value));
  },

  /**
   * Coerce to BigInt (bigDecimal equivalent)
   */
  bigDecimal: (value, options) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'bigint') return value;

    if (typeof value === 'number') {
      if (!Number.isInteger(value)) {
        // For decimal numbers, scale up based on precision
        const precision = (options?.precision as number) ?? 0;
        if (precision > 0) {
          return BigInt(Math.round(value * Math.pow(10, precision)));
        }
      }
      return BigInt(Math.trunc(value));
    }

    if (typeof value === 'string') {
      const str = value.trim();
      try {
        // Handle decimal strings by removing decimal point
        if (str.includes('.')) {
          const precision = (options?.precision as number) ?? 0;
          const [whole, frac] = str.split('.');
          const fracPadded = (frac ?? '').padEnd(precision, '0').slice(0, precision);
          return BigInt(whole + fracPadded);
        }
        return BigInt(str);
      } catch {
        throw new CoercionError('value', value, 'bigDecimal');
      }
    }

    throw new CoercionError('value', value, 'bigDecimal');
  },

  /**
   * Coerce to complex number (as object {real, imag})
   */
  complex: (value) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'object' && value !== null && 'real' in value && 'imag' in value) {
      return value;
    }

    if (typeof value === 'number') {
      return { real: value, imag: 0 };
    }

    if (typeof value === 'string') {
      // Parse complex string like "1+2i" or "3-4i"
      const match = value.match(/^([+-]?\d*\.?\d+)?([+-]\d*\.?\d+)?i$/);
      if (match) {
        const real = match[1] ? parseFloat(match[1]) : 0;
        const imag = match[2] ? parseFloat(match[2]) : (match[1] ? 0 : 1);
        return { real, imag };
      }

      // Just imaginary like "2i"
      const imagMatch = value.match(/^([+-]?\d*\.?\d+)i$/);
      if (imagMatch) {
        return { real: 0, imag: parseFloat(imagMatch[1] ?? '1') };
      }

      throw new CoercionError('value', value, 'complex');
    }

    throw new CoercionError('value', value, 'complex');
  },

  /**
   * Coerce to rational number (as object {numerator, denominator})
   */
  rational: (value) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'object' && value !== null && 'numerator' in value && 'denominator' in value) {
      return value;
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { numerator: value, denominator: 1 };
      }
      // Convert float to rational approximation
      const precision = 1000000;
      const numerator = Math.round(value * precision);
      const denominator = precision;
      const gcd = greatestCommonDivisor(numerator, denominator);
      return { numerator: numerator / gcd, denominator: denominator / gcd };
    }

    if (typeof value === 'string') {
      // Parse rational string like "1/2"
      const match = value.match(/^([+-]?\d+)\/(\d+)$/);
      if (match) {
        const numerator = parseInt(match[1]!, 10);
        const denominator = parseInt(match[2]!, 10);
        if (denominator === 0) {
          throw new CoercionError('value', value, 'rational', 'Denominator cannot be zero');
        }
        return { numerator, denominator };
      }

      // Try as float
      const float = parseFloat(value);
      if (!Number.isNaN(float)) {
        return coercions.rational!(float);
      }

      throw new CoercionError('value', value, 'rational');
    }

    throw new CoercionError('value', value, 'rational');
  },
};

/**
 * Parse date with strptime-like format
 */
function parseWithFormat(value: string, format: string): Date {
  // Simple format parsing (subset of strptime)
  const formatMap: Record<string, string> = {
    '%Y': '(\\d{4})',
    '%m': '(\\d{2})',
    '%d': '(\\d{2})',
    '%H': '(\\d{2})',
    '%M': '(\\d{2})',
    '%S': '(\\d{2})',
  };

  let pattern = format;
  const groups: string[] = [];

  for (const [token, regex] of Object.entries(formatMap)) {
    if (pattern.includes(token)) {
      pattern = pattern.replace(token, regex);
      groups.push(token);
    }
  }

  const match = value.match(new RegExp(`^${pattern}$`));
  if (!match) {
    throw new CoercionError('value', value, 'date', `Does not match format ${format}`);
  }

  const parts: Record<string, number> = {
    year: 1970,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  };

  for (let i = 0; i < groups.length; i++) {
    const val = parseInt(match[i + 1]!, 10);
    switch (groups[i]) {
      case '%Y': parts.year = val; break;
      case '%m': parts.month = val; break;
      case '%d': parts.day = val; break;
      case '%H': parts.hour = val; break;
      case '%M': parts.minute = val; break;
      case '%S': parts.second = val; break;
    }
  }

  return new Date(
    parts.year!,
    parts.month! - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
}

/**
 * Calculate greatest common divisor
 */
function greatestCommonDivisor(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Coerce a value using one or more coercion types
 */
export function coerce(
  attribute: string,
  value: unknown,
  types: string | string[],
  options?: Record<string, unknown>
): unknown {
  const typeArray = Array.isArray(types) ? types : [types];

  for (const type of typeArray) {
    const coercion = coercions[type];
    if (!coercion) {
      throw new CoercionError(attribute, value, type, `Unknown coercion type: ${type}`);
    }

    try {
      return coercion(value, options);
    } catch (error) {
      // Try next type
      if (typeArray.indexOf(type) === typeArray.length - 1) {
        // Last type, throw error
        if (error instanceof CoercionError) {
          throw new CoercionError(
            attribute,
            value,
            typeArray.length > 1 ? `one of: ${typeArray.join(', ')}` : type,
            error.message
          );
        }
        throw error;
      }
    }
  }

  return value;
}

/**
 * Register a custom coercion
 */
export function registerCoercion(name: string, fn: CoercionFunction): void {
  coercions[name] = fn;
}

/**
 * Deregister a coercion
 */
export function deregisterCoercion(name: string): boolean {
  if (name in coercions) {
    delete coercions[name];
    return true;
  }
  return false;
}
