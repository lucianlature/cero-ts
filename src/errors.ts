/**
 * Custom error classes for cero-ts
 */

/**
 * Base error class for all cero-ts errors
 */
export class CeroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CeroError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/** @deprecated Use CeroError instead */
export const CMDxError = CeroError;

/**
 * Error thrown when attribute coercion fails
 */
export class CoercionError extends CeroError {
  readonly attribute: string;
  readonly value: unknown;
  readonly targetType: string;

  constructor(attribute: string, value: unknown, targetType: string, message?: string) {
    super(message ?? `Could not coerce '${attribute}' into ${targetType}`);
    this.name = 'CoercionError';
    this.attribute = attribute;
    this.value = value;
    this.targetType = targetType;
  }
}

/**
 * Error thrown when attribute validation fails
 */
export class ValidationError extends CeroError {
  readonly attribute: string;
  readonly value: unknown;
  readonly rule: string;

  constructor(attribute: string, value: unknown, rule: string, message?: string) {
    super(message ?? `Validation failed for '${attribute}': ${rule}`);
    this.name = 'ValidationError';
    this.attribute = attribute;
    this.value = value;
    this.rule = rule;
  }
}

/**
 * Error thrown when task execution times out
 */
export class TimeoutError extends CeroError {
  readonly limit: number;

  constructor(limit: number, message?: string) {
    super(message ?? `Execution exceeded ${limit} seconds`);
    this.name = 'TimeoutError';
    this.limit = limit;
  }
}

/**
 * Error collection for multiple validation errors
 */
export class ErrorCollection {
  private readonly errors: Map<string, string[]> = new Map();

  add(attribute: string, message: string): void {
    const existing = this.errors.get(attribute) ?? [];
    existing.push(message);
    this.errors.set(attribute, existing);
  }

  has(attribute: string): boolean {
    return this.errors.has(attribute);
  }

  get(attribute: string): string[] {
    return this.errors.get(attribute) ?? [];
  }

  get isEmpty(): boolean {
    return this.errors.size === 0;
  }

  get size(): number {
    return this.errors.size;
  }

  get messages(): Record<string, string[]> {
    return Object.fromEntries(this.errors);
  }

  get fullMessage(): string {
    const parts: string[] = [];
    for (const [attr, msgs] of this.errors) {
      for (const msg of msgs) {
        parts.push(`${attr} ${msg}`);
      }
    }
    return parts.join('. ') + (parts.length > 0 ? '.' : '');
  }

  clear(): void {
    this.errors.clear();
  }

  [Symbol.iterator](): IterableIterator<[string, string[]]> {
    return this.errors[Symbol.iterator]();
  }
}
