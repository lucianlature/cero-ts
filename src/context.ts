/**
 * Context - Shared mutable state container for task execution
 */

import { isPlainObject } from './utils/types.js';

/**
 * Context store that holds shared state across task execution.
 * Provides a flexible key-value store with proxy-based access.
 */
export class Context<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly store: Map<string, unknown>;

  constructor(initial?: Partial<T>) {
    this.store = new Map();

    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        if (value !== undefined) {
          this.store.set(key, value);
        }
      }
    }

    // Return a proxy to allow direct property access
    return new Proxy(this, {
      get(target, prop: string | symbol) {
        if (typeof prop === 'symbol' || prop in target) {
          return Reflect.get(target, prop);
        }
        return target.store.get(prop);
      },
      set(target, prop: string | symbol, value) {
        if (typeof prop === 'symbol') {
          return Reflect.set(target, prop, value);
        }
        target.store.set(prop, value);
        return true;
      },
      has(target, prop: string | symbol) {
        if (typeof prop === 'symbol') {
          return Reflect.has(target, prop);
        }
        return target.store.has(prop) || prop in target;
      },
      deleteProperty(target, prop: string | symbol) {
        if (typeof prop === 'symbol') {
          return Reflect.deleteProperty(target, prop);
        }
        return target.store.delete(prop);
      },
      ownKeys(target) {
        return [...target.store.keys()];
      },
      getOwnPropertyDescriptor(target, prop: string | symbol) {
        if (typeof prop === 'symbol') {
          return Reflect.getOwnPropertyDescriptor(target, prop);
        }
        if (target.store.has(prop)) {
          return {
            value: target.store.get(prop),
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
        return undefined;
      },
    }) as this & T;
  }

  /**
   * Get a value from context
   */
  get<K extends keyof T>(key: K): T[K] | undefined;
  get(key: string): unknown;
  get(key: string): unknown {
    return this.store.get(key);
  }

  /**
   * Set a value in context
   */
  set<K extends keyof T>(key: K, value: T[K]): this;
  set(key: string, value: unknown): this;
  set(key: string, value: unknown): this {
    this.store.set(key, value);
    return this;
  }

  /**
   * Check if context has a key
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Delete a key from context
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Get all keys in context
   */
  keys(): IterableIterator<string> {
    return this.store.keys();
  }

  /**
   * Get all values in context
   */
  values(): IterableIterator<unknown> {
    return this.store.values();
  }

  /**
   * Get all entries in context
   */
  entries(): IterableIterator<[string, unknown]> {
    return this.store.entries();
  }

  /**
   * Get the size of context
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Convert context to a plain object
   */
  toObject(): T {
    return Object.fromEntries(this.store) as T;
  }

  /**
   * Merge another object into context
   */
  merge(data: Partial<T>): this {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        this.store.set(key, value);
      }
    }
    return this;
  }

  /**
   * Create a shallow clone of context
   */
  clone(): Context<T> & T {
    return new Context<T>(this.toObject()) as Context<T> & T;
  }

  /**
   * Create a deep clone of context
   */
  deepClone(): Context<T> & T {
    const cloned: Record<string, unknown> = {};
    for (const [key, value] of this.store) {
      cloned[key] = deepCloneValue(value);
    }
    return new Context<T>(cloned as Partial<T>) as Context<T> & T;
  }

  [Symbol.iterator](): IterableIterator<[string, unknown]> {
    return this.store[Symbol.iterator]();
  }

  [Symbol.toStringTag] = 'Context';
}

/**
 * Deep clone a value
 */
function deepCloneValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(deepCloneValue);
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (value instanceof Map) {
    return new Map(Array.from(value.entries()).map(([k, v]) => [k, deepCloneValue(v)]));
  }

  if (value instanceof Set) {
    return new Set(Array.from(value).map(deepCloneValue));
  }

  if (isPlainObject(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      cloned[key] = deepCloneValue(val);
    }
    return cloned;
  }

  // For other objects, return as-is (classes, etc.)
  return value;
}

/**
 * Create a new context instance
 */
export function createContext<T extends Record<string, unknown> = Record<string, unknown>>(
  initial?: Partial<T>
): Context<T> & T {
  return new Context(initial) as Context<T> & T;
}
