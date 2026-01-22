/**
 * cero-ts Global Configuration
 */

import type { Status } from './result.js';
import type { LogLevel } from './logging/logger.js';
import type { LogFormatter } from './logging/formatters/types.js';
import type { MiddlewareDefinition, CallbackType, CallbackDefinition } from './task.js';
import type { CoercionFunction } from './attributes/coercions.js';
import type { ValidationFunction } from './attributes/validations.js';

/**
 * Global configuration options
 */
export interface CeroConfiguration {
  // Breakpoints
  taskBreakpoints: Status[];
  workflowBreakpoints: Status[];

  // Rollback
  rollbackOn: Status[];

  // Backtraces
  backtrace: boolean;
  backtraceCleaner?: (backtrace: string[]) => string[];

  // Exception handling
  exceptionHandler?: (task: unknown, exception: Error) => void;

  // Logging
  logger?: {
    output?: NodeJS.WritableStream;
    formatter?: LogFormatter;
    progname?: string;
    level?: LogLevel;
    enabled?: boolean;
  };

  // Registries
  middlewares: MiddlewareRegistry;
  callbacks: CallbackRegistry;
  coercions: CoercionRegistry;
  validators: ValidatorRegistry;
}

/**
 * Middleware registry
 */
export class MiddlewareRegistry {
  private _middlewares: MiddlewareDefinition[] = [];

  get registry(): readonly MiddlewareDefinition[] {
    return this._middlewares;
  }

  register(middleware: MiddlewareDefinition): void {
    this._middlewares.push(middleware);
  }

  deregister(middleware: MiddlewareDefinition): boolean {
    const index = this._middlewares.indexOf(middleware);
    if (index !== -1) {
      this._middlewares.splice(index, 1);
      return true;
    }
    return false;
  }

  clear(): void {
    this._middlewares = [];
  }
}

/**
 * Callback registry
 */
export class CallbackRegistry {
  private _callbacks: Map<CallbackType, CallbackDefinition[]> = new Map();

  get registry(): ReadonlyMap<CallbackType, CallbackDefinition[]> {
    return this._callbacks;
  }

  register(type: CallbackType, callback: CallbackDefinition): void {
    const existing = this._callbacks.get(type) ?? [];
    existing.push(callback);
    this._callbacks.set(type, existing);
  }

  deregister(type: CallbackType, callback: CallbackDefinition): boolean {
    const existing = this._callbacks.get(type);
    if (!existing) return false;

    const index = existing.indexOf(callback);
    if (index !== -1) {
      existing.splice(index, 1);
      return true;
    }
    return false;
  }

  get(type: CallbackType): CallbackDefinition[] {
    return this._callbacks.get(type) ?? [];
  }

  clear(): void {
    this._callbacks.clear();
  }
}

/**
 * Coercion registry
 */
export class CoercionRegistry {
  private _coercions: Map<string, CoercionFunction> = new Map();

  get registry(): ReadonlyMap<string, CoercionFunction> {
    return this._coercions;
  }

  register(name: string, fn: CoercionFunction): void {
    this._coercions.set(name, fn);
  }

  deregister(name: string): boolean {
    return this._coercions.delete(name);
  }

  get(name: string): CoercionFunction | undefined {
    return this._coercions.get(name);
  }

  clear(): void {
    this._coercions.clear();
  }
}

/**
 * Validator registry
 */
export class ValidatorRegistry {
  private _validators: Map<string, ValidationFunction> = new Map();

  get registry(): ReadonlyMap<string, ValidationFunction> {
    return this._validators;
  }

  register(name: string, fn: ValidationFunction): void {
    this._validators.set(name, fn);
  }

  deregister(name: string): boolean {
    return this._validators.delete(name);
  }

  get(name: string): ValidationFunction | undefined {
    return this._validators.get(name);
  }

  clear(): void {
    this._validators.clear();
  }
}

/**
 * Default configuration
 */
function createDefaultConfiguration(): CeroConfiguration {
  return {
    taskBreakpoints: ['failed'],
    workflowBreakpoints: ['skipped', 'failed'],
    rollbackOn: ['failed'],
    backtrace: false,
    middlewares: new MiddlewareRegistry(),
    callbacks: new CallbackRegistry(),
    coercions: new CoercionRegistry(),
    validators: new ValidatorRegistry(),
  };
}

/**
 * Global configuration instance
 */
let configuration: CeroConfiguration = createDefaultConfiguration();

/**
 * Get the current configuration
 */
export function getConfiguration(): CeroConfiguration {
  return configuration;
}

/**
 * Configure cero-ts globally
 */
export function configure(
  fn: (config: CeroConfiguration) => void
): void {
  fn(configuration);
}

/**
 * Reset configuration to defaults
 */
export function resetConfiguration(): void {
  configuration = createDefaultConfiguration();
}

/**
 * Cero namespace for global operations
 */
export const Cero = {
  /**
   * Get the current configuration
   */
  get configuration(): CeroConfiguration {
    return configuration;
  },

  /**
   * Configure cero-ts globally
   */
  configure,

  /**
   * Reset configuration to defaults
   */
  resetConfiguration,
};

/** @deprecated Use Cero instead */
export const CMDx = Cero;

export default Cero;
