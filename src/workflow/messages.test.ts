/**
 * Messages Tests - Signals & Queries
 */

import { describe, it, expect } from 'vitest';
import {
  defineSignal,
  defineQuery,
  isSignalDefinition,
  isQueryDefinition,
} from './messages.js';

// ============================================
// defineSignal
// ============================================

describe('defineSignal', () => {
  it('should create a signal definition with a name', () => {
    const signal = defineSignal('test');

    expect(signal.name).toBe('test');
    expect(signal._brand).toBe('Signal');
  });

  it('should create typed signal definitions', () => {
    const signal = defineSignal<[{ approved: boolean }]>('approve');

    expect(signal.name).toBe('approve');
    expect(signal._brand).toBe('Signal');
  });

  it('should create signal definitions with multiple args', () => {
    const signal = defineSignal<[string, number]>('multi');

    expect(signal.name).toBe('multi');
  });

  it('should create signal definitions with no args', () => {
    const signal = defineSignal('cancel');

    expect(signal.name).toBe('cancel');
  });

  it('should freeze the signal definition', () => {
    const signal = defineSignal('frozen');

    expect(Object.isFrozen(signal)).toBe(true);
  });
});

// ============================================
// defineQuery
// ============================================

describe('defineQuery', () => {
  it('should create a query definition with a name', () => {
    const query = defineQuery('status');

    expect(query.name).toBe('status');
    expect(query._brand).toBe('Query');
  });

  it('should create typed query definitions', () => {
    const query = defineQuery<string>('status');

    expect(query.name).toBe('status');
    expect(query._brand).toBe('Query');
  });

  it('should create query definitions with args', () => {
    const query = defineQuery<string, [id: string]>('getItem');

    expect(query.name).toBe('getItem');
  });

  it('should freeze the query definition', () => {
    const query = defineQuery('frozen');

    expect(Object.isFrozen(query)).toBe(true);
  });
});

// ============================================
// Type Guards
// ============================================

describe('isSignalDefinition', () => {
  it('should return true for signal definitions', () => {
    const signal = defineSignal('test');
    expect(isSignalDefinition(signal)).toBe(true);
  });

  it('should return false for query definitions', () => {
    const query = defineQuery('test');
    expect(isSignalDefinition(query)).toBe(false);
  });

  it('should return false for non-definitions', () => {
    expect(isSignalDefinition(null)).toBe(false);
    expect(isSignalDefinition(undefined)).toBe(false);
    expect(isSignalDefinition('string')).toBe(false);
    expect(isSignalDefinition(42)).toBe(false);
    expect(isSignalDefinition({})).toBe(false);
    expect(isSignalDefinition({ name: 'test' })).toBe(false);
  });
});

describe('isQueryDefinition', () => {
  it('should return true for query definitions', () => {
    const query = defineQuery('test');
    expect(isQueryDefinition(query)).toBe(true);
  });

  it('should return false for signal definitions', () => {
    const signal = defineSignal('test');
    expect(isQueryDefinition(signal)).toBe(false);
  });

  it('should return false for non-definitions', () => {
    expect(isQueryDefinition(null)).toBe(false);
    expect(isQueryDefinition(undefined)).toBe(false);
    expect(isQueryDefinition('string')).toBe(false);
    expect(isQueryDefinition(42)).toBe(false);
    expect(isQueryDefinition({})).toBe(false);
  });
});
