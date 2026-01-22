/**
 * Shared type utilities for cero-ts
 */

/** Any function type */
export type AnyFunction = (...args: unknown[]) => unknown;

/** Any async function type */
export type AsyncFunction = (...args: unknown[]) => Promise<unknown>;

/** Constructor type */
export type Constructor<T = unknown> = new (...args: unknown[]) => T;

/** Makes specified keys optional */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Makes specified keys required */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** Extract keys with values of a specific type */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/** Deep partial type */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

/** Callable type - function or object with call method */
export type Callable<TArgs extends unknown[] = unknown[], TReturn = unknown> =
  | ((...args: TArgs) => TReturn)
  | { call: (...args: TArgs) => TReturn };

/** Resolve a callable to its return type */
export function resolveCallable<TArgs extends unknown[], TReturn>(
  callable: Callable<TArgs, TReturn>,
  ...args: TArgs
): TReturn {
  if (typeof callable === 'function') {
    return callable(...args);
  }
  return callable.call(...args);
}

/** Check if value is a plain object */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/** Check if value is a promise */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    value instanceof Promise ||
    (typeof value === 'object' &&
      value !== null &&
      'then' in value &&
      typeof (value as { then: unknown }).then === 'function')
  );
}

/** Merge objects deeply */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = { ...target };

  for (const source of sources) {
    if (!source) continue;

    for (const key of Object.keys(source) as (keyof T)[]) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[keyof T];
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue as T[keyof T];
      }
    }
  }

  return result;
}
