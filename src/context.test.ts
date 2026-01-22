/**
 * Context Tests
 */

import { describe, it, expect } from 'vitest';
import { Context, createContext } from './context.js';

describe('Context', () => {
  describe('creation', () => {
    it('should create an empty context', () => {
      const ctx = createContext();

      expect(ctx).toBeDefined();
      expect(ctx.size).toBe(0);
    });

    it('should create context with initial data', () => {
      const ctx = createContext({ foo: 'bar', num: 42 });

      expect(ctx.foo).toBe('bar');
      expect(ctx.num).toBe(42);
      expect(ctx.size).toBe(2);
    });

    it('should create context using constructor', () => {
      const ctx = new Context({ key: 'value' });

      expect(ctx.get('key')).toBe('value');
    });
  });

  describe('get/set operations', () => {
    it('should set and get values', () => {
      const ctx = createContext<{ name?: string }>();

      ctx.set('name', 'Alice');

      expect(ctx.get('name')).toBe('Alice');
      expect(ctx.name).toBe('Alice');
    });

    it('should return undefined for missing keys', () => {
      const ctx = createContext();

      expect(ctx.get('missing')).toBeUndefined();
    });

    it('should allow direct property assignment', () => {
      const ctx = createContext<{ value?: number }>();

      ctx.value = 123;

      expect(ctx.value).toBe(123);
      expect(ctx.get('value')).toBe(123);
    });

    it('should handle nested objects', () => {
      interface NestedContext extends Record<string, unknown> {
        user?: { name: string; age: number };
      }

      const ctx = createContext<NestedContext>();
      ctx.user = { name: 'Bob', age: 30 };

      expect(ctx.user?.name).toBe('Bob');
      expect(ctx.user?.age).toBe(30);
    });
  });

  describe('has()', () => {
    it('should return true for existing keys', () => {
      const ctx = createContext({ exists: true });

      expect(ctx.has('exists')).toBe(true);
    });

    it('should return false for missing keys', () => {
      const ctx = createContext();

      expect(ctx.has('missing')).toBe(false);
    });

    it('should return true for keys with falsy values', () => {
      const ctx = createContext({ zero: 0, empty: '', falsy: false, nil: null });

      expect(ctx.has('zero')).toBe(true);
      expect(ctx.has('empty')).toBe(true);
      expect(ctx.has('falsy')).toBe(true);
      expect(ctx.has('nil')).toBe(true);
    });
  });

  describe('delete()', () => {
    it('should delete existing keys', () => {
      const ctx = createContext({ toDelete: 'value' });

      expect(ctx.has('toDelete')).toBe(true);

      ctx.delete('toDelete');

      expect(ctx.has('toDelete')).toBe(false);
      expect(ctx.get('toDelete')).toBeUndefined();
    });

    it('should return false when deleting non-existent keys', () => {
      const ctx = createContext();

      expect(ctx.delete('nonexistent')).toBe(false);
    });
  });

  describe('keys()', () => {
    it('should return keys iterator', () => {
      const ctx = createContext({ a: 1, b: 2, c: 3 });

      const keys = Array.from(ctx.keys());

      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
      expect(keys.length).toBe(3);
    });

    it('should return empty iterator for empty context', () => {
      const ctx = createContext();

      const keys = Array.from(ctx.keys());

      expect(keys).toEqual([]);
    });
  });

  describe('toObject()', () => {
    it('should return plain object representation', () => {
      const ctx = createContext({ x: 1, y: 2 });

      const obj = ctx.toObject();

      expect(obj).toEqual({ x: 1, y: 2 });
    });

    it('should return a copy, not a reference', () => {
      const ctx = createContext({ mutable: 'original' });
      const obj = ctx.toObject();

      obj.mutable = 'modified';

      expect(ctx.get('mutable')).toBe('original');
    });
  });

  describe('clone()', () => {
    it('should create a shallow copy', () => {
      const ctx = createContext({ value: 1 });

      const cloned = ctx.clone();

      expect(cloned.get('value')).toBe(1);
    });
  });

  describe('deepClone()', () => {
    it('should create a deep copy', () => {
      interface NestedContext extends Record<string, unknown> {
        nested?: { value: number };
      }

      const ctx = createContext<NestedContext>({ nested: { value: 1 } });
      const cloned = ctx.deepClone();

      // Modify clone
      if (cloned.nested) {
        cloned.nested.value = 999;
      }

      // Original should be unchanged
      expect(ctx.nested?.value).toBe(1);
    });
  });

  describe('merge()', () => {
    it('should merge data into context', () => {
      const ctx = createContext<Record<string, number>>({ a: 1 });

      ctx.merge({ b: 2, c: 3 });

      expect(ctx.get('a')).toBe(1);
      expect(ctx.get('b')).toBe(2);
      expect(ctx.get('c')).toBe(3);
    });

    it('should overwrite existing keys', () => {
      const ctx = createContext({ key: 'old' });

      ctx.merge({ key: 'new' });

      expect(ctx.get('key')).toBe('new');
    });
  });

  describe('iteration', () => {
    it('should be iterable with for...of', () => {
      const ctx = createContext({ a: 1, b: 2 });

      const entries: [string, unknown][] = [];
      for (const entry of ctx) {
        entries.push(entry);
      }

      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
    });
  });
});
