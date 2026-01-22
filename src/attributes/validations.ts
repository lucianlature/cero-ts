/**
 * Built-in Validators
 */

import { ValidationError } from '../errors.js';

/**
 * Validation function type
 */
export type ValidationFunction = (
  value: unknown,
  options?: Record<string, unknown>
) => void;

/**
 * Common validation options
 */
export interface BaseValidationOptions {
  allowNil?: boolean;
  if?: string | ((value: unknown) => boolean);
  unless?: string | ((value: unknown) => boolean);
  message?: string;
}

/**
 * Built-in validator registry
 */
export const validators: Record<string, ValidationFunction> = {
  /**
   * Presence validation - value must not be nil, empty string, or whitespace
   */
  presence: (value, options) => {
    const opts = options as BaseValidationOptions | undefined;

    if (opts?.allowNil && (value === null || value === undefined)) {
      return;
    }

    if (
      value === null ||
      value === undefined ||
      value === '' ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      throw new ValidationError(
        'value',
        value,
        'presence',
        opts?.message ?? "can't be blank"
      );
    }
  },

  /**
   * Absence validation - value must be nil, empty string, or whitespace
   */
  absence: (value, options) => {
    const opts = options as BaseValidationOptions | undefined;

    if (opts?.allowNil && (value === null || value === undefined)) {
      return;
    }

    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !(typeof value === 'string' && value.trim() === '')
    ) {
      throw new ValidationError(
        'value',
        value,
        'absence',
        opts?.message ?? 'must be blank'
      );
    }
  },

  /**
   * Format validation - value must match regex pattern
   */
  format: (value, options) => {
    const opts = options as (BaseValidationOptions & {
      with?: RegExp;
      without?: RegExp;
    }) | undefined;

    if (opts?.allowNil && (value === null || value === undefined)) {
      return;
    }

    if (value === null || value === undefined) {
      return;
    }

    const strValue = String(value);

    if (opts?.with && !opts.with.test(strValue)) {
      throw new ValidationError(
        'value',
        value,
        'format',
        opts?.message ?? 'is invalid'
      );
    }

    if (opts?.without && opts.without.test(strValue)) {
      throw new ValidationError(
        'value',
        value,
        'format',
        opts?.message ?? 'is invalid'
      );
    }
  },

  /**
   * Length validation - string/array length constraints
   */
  length: (value, options) => {
    const opts = options as (BaseValidationOptions & {
      min?: number;
      max?: number;
      is?: number;
      isNot?: number;
      within?: [number, number];
      notWithin?: [number, number];
      in?: [number, number];
      notIn?: [number, number];
      minMessage?: string;
      maxMessage?: string;
      isMessage?: string;
      isNotMessage?: string;
      withinMessage?: string;
      notWithinMessage?: string;
      inMessage?: string;
      notInMessage?: string;
    }) | undefined;

    if (opts?.allowNil && (value === null || value === undefined)) {
      return;
    }

    if (value === null || value === undefined) {
      return;
    }

    let len: number;
    if (typeof value === 'string') {
      len = value.length;
    } else if (Array.isArray(value)) {
      len = value.length;
    } else if (typeof value === 'object' && value !== null) {
      len = Object.keys(value).length;
    } else {
      return;
    }

    const within = opts?.within ?? opts?.in;
    const notWithin = opts?.notWithin ?? opts?.notIn;

    if (opts?.min !== undefined && len < opts.min) {
      throw new ValidationError(
        'value',
        value,
        'length',
        opts.minMessage ?? opts.message ?? `is too short (minimum is ${opts.min} characters)`
      );
    }

    if (opts?.max !== undefined && len > opts.max) {
      throw new ValidationError(
        'value',
        value,
        'length',
        opts.maxMessage ?? opts.message ?? `is too long (maximum is ${opts.max} characters)`
      );
    }

    if (opts?.is !== undefined && len !== opts.is) {
      throw new ValidationError(
        'value',
        value,
        'length',
        opts.isMessage ?? opts.message ?? `is the wrong length (should be ${opts.is} characters)`
      );
    }

    if (opts?.isNot !== undefined && len === opts.isNot) {
      throw new ValidationError(
        'value',
        value,
        'length',
        opts.isNotMessage ?? opts.message ?? `length must not be ${opts.isNot}`
      );
    }

    if (within && (len < within[0] || len > within[1])) {
      throw new ValidationError(
        'value',
        value,
        'length',
        opts?.withinMessage ?? opts?.inMessage ?? opts?.message ?? `length must be between ${within[0]} and ${within[1]}`
      );
    }

    if (notWithin && len >= notWithin[0] && len <= notWithin[1]) {
      throw new ValidationError(
        'value',
        value,
        'length',
        opts?.notWithinMessage ?? opts?.notInMessage ?? opts?.message ?? `length must not be between ${notWithin[0]} and ${notWithin[1]}`
      );
    }
  },

  /**
   * Numeric validation - number value constraints
   */
  numeric: (value, options) => {
    const opts = options as (BaseValidationOptions & {
      min?: number;
      max?: number;
      is?: number;
      isNot?: number;
      within?: [number, number];
      notWithin?: [number, number];
      in?: [number, number];
      notIn?: [number, number];
      minMessage?: string;
      maxMessage?: string;
      isMessage?: string;
      isNotMessage?: string;
      withinMessage?: string;
      notWithinMessage?: string;
      inMessage?: string;
      notInMessage?: string;
    }) | undefined;

    if (opts?.allowNil && (value === null || value === undefined)) {
      return;
    }

    if (value === null || value === undefined) {
      return;
    }

    if (typeof value !== 'number') {
      return;
    }

    const within = opts?.within ?? opts?.in;
    const notWithin = opts?.notWithin ?? opts?.notIn;

    if (opts?.min !== undefined && value < opts.min) {
      throw new ValidationError(
        'value',
        value,
        'numeric',
        opts.minMessage ?? opts.message ?? `must be greater than or equal to ${opts.min}`
      );
    }

    if (opts?.max !== undefined && value > opts.max) {
      throw new ValidationError(
        'value',
        value,
        'numeric',
        opts.maxMessage ?? opts.message ?? `must be less than or equal to ${opts.max}`
      );
    }

    if (opts?.is !== undefined && value !== opts.is) {
      throw new ValidationError(
        'value',
        value,
        'numeric',
        opts.isMessage ?? opts.message ?? `must be equal to ${opts.is}`
      );
    }

    if (opts?.isNot !== undefined && value === opts.isNot) {
      throw new ValidationError(
        'value',
        value,
        'numeric',
        opts.isNotMessage ?? opts.message ?? `must not be equal to ${opts.isNot}`
      );
    }

    if (within && (value < within[0] || value > within[1])) {
      throw new ValidationError(
        'value',
        value,
        'numeric',
        opts?.withinMessage ?? opts?.inMessage ?? opts?.message ?? `must be between ${within[0]} and ${within[1]}`
      );
    }

    if (notWithin && value >= notWithin[0] && value <= notWithin[1]) {
      throw new ValidationError(
        'value',
        value,
        'numeric',
        opts?.notWithinMessage ?? opts?.notInMessage ?? opts?.message ?? `must not be between ${notWithin[0]} and ${notWithin[1]}`
      );
    }
  },

  /**
   * Inclusion validation - value must be in list
   */
  inclusion: (value, options) => {
    const opts = options as (BaseValidationOptions & {
      in?: unknown[];
      within?: unknown[];
      ofMessage?: string;
      inMessage?: string;
      withinMessage?: string;
    }) | undefined;

    if (opts?.allowNil && (value === null || value === undefined)) {
      return;
    }

    if (value === null || value === undefined) {
      return;
    }

    const list = opts?.in ?? opts?.within ?? [];

    if (!list.includes(value)) {
      throw new ValidationError(
        'value',
        value,
        'inclusion',
        opts?.ofMessage ?? opts?.inMessage ?? opts?.withinMessage ?? opts?.message ?? 'is not included in the list'
      );
    }
  },

  /**
   * Exclusion validation - value must not be in list
   */
  exclusion: (value, options) => {
    const opts = options as (BaseValidationOptions & {
      in?: unknown[];
      within?: unknown[];
      ofMessage?: string;
      inMessage?: string;
      withinMessage?: string;
    }) | undefined;

    if (opts?.allowNil && (value === null || value === undefined)) {
      return;
    }

    if (value === null || value === undefined) {
      return;
    }

    const list = opts?.in ?? opts?.within ?? [];

    if (list.includes(value)) {
      throw new ValidationError(
        'value',
        value,
        'exclusion',
        opts?.ofMessage ?? opts?.inMessage ?? opts?.withinMessage ?? opts?.message ?? 'is reserved'
      );
    }
  },
};

/**
 * Validate a value using a validator
 */
export function validate(
  attribute: string,
  value: unknown,
  validatorName: string,
  options?: Record<string, unknown>
): void {
  const validator = validators[validatorName];
  if (!validator) {
    throw new Error(`Unknown validator: ${validatorName}`);
  }

  try {
    validator(value, options);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError(attribute, value, validatorName, error.message);
    }
    throw error;
  }
}

/**
 * Register a custom validator
 */
export function registerValidator(name: string, fn: ValidationFunction): void {
  validators[name] = fn;
}

/**
 * Deregister a validator
 */
export function deregisterValidator(name: string): boolean {
  if (name in validators) {
    delete validators[name];
    return true;
  }
  return false;
}
