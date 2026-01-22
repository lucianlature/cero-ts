/**
 * Result Tests
 */

import { describe, it, expect } from 'vitest';
import {
  createResult,
  successResult,
  skippedResult,
  failedResult,
} from './result.js';
import { createContext } from './context.js';
import { createChain } from './chain.js';

describe('Result', () => {
  const mockTask = {
    id: 'task_123',
    constructor: { name: 'MockTask' },
  };

  const defaultContext = createContext({ foo: 'bar' });
  const defaultChain = createChain();

  describe('createResult', () => {
    it('should create a result with all properties', () => {
      const result = createResult({
        task: mockTask as any,
        state: 'complete',
        status: 'success',
        index: 0,
        context: defaultContext,
        chain: defaultChain,
      });

      expect(result.task).toBe(mockTask);
      expect(result.state).toBe('complete');
      expect(result.status).toBe('success');
      expect(result.index).toBe(0);
      expect(result.context).toBe(defaultContext);
    });

    it('should include metadata', () => {
      const result = createResult({
        task: mockTask as any,
        state: 'interrupted',
        status: 'failed',
        index: 0,
        context: defaultContext,
        chain: defaultChain,
        reason: 'Something went wrong',
        metadata: { code: 'ERR_001', details: 'More info' },
      });

      expect(result.reason).toBe('Something went wrong');
      expect(result.metadata.code).toBe('ERR_001');
      expect(result.metadata.details).toBe('More info');
    });
  });

  describe('successResult', () => {
    it('should create a success result', () => {
      const result = successResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
      });

      expect(result.success).toBe(true);
      expect(result.failed).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.complete).toBe(true);
      expect(result.interrupted).toBe(false);
      expect(result.good).toBe(true);
      expect(result.bad).toBe(false);
    });
  });

  describe('skippedResult', () => {
    it('should create a skipped result', () => {
      const result = skippedResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
        reason: 'Not needed',
      });

      expect(result.success).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.complete).toBe(false);
      expect(result.interrupted).toBe(true);
      expect(result.good).toBe(true);
      // Note: skipped is both 'good' and 'bad' in cero-ts
      // good = success || skipped, bad = skipped || failed
      expect(result.bad).toBe(true);
      expect(result.reason).toBe('Not needed');
    });
  });

  describe('failedResult', () => {
    it('should create a failed result', () => {
      const result = failedResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
        reason: 'Error occurred',
        metadata: { code: 500 },
      });

      expect(result.success).toBe(false);
      expect(result.failed).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.complete).toBe(false);
      expect(result.interrupted).toBe(true);
      expect(result.good).toBe(false);
      expect(result.bad).toBe(true);
      expect(result.reason).toBe('Error occurred');
      expect(result.metadata.code).toBe(500);
    });
  });

  describe('on() handler', () => {
    it('should call success handler for success result', () => {
      const result = successResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
      });

      let called = false;
      result.on('success', () => {
        called = true;
      });

      expect(called).toBe(true);
    });

    it('should not call success handler for failed result', () => {
      const result = failedResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
        reason: 'error',
      });

      let called = false;
      result.on('success', () => {
        called = true;
      });

      expect(called).toBe(false);
    });

    it('should call failed handler for failed result', () => {
      const result = failedResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
        reason: 'error',
      });

      let called = false;
      result.on('failed', () => {
        called = true;
      });

      expect(called).toBe(true);
    });

    it('should call skipped handler for skipped result', () => {
      const result = skippedResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
      });

      let called = false;
      result.on('skipped', () => {
        called = true;
      });

      expect(called).toBe(true);
    });

    it('should be chainable', () => {
      const result = successResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
      });

      const calls: string[] = [];

      result
        .on('success', () => { calls.push('success'); })
        .on('failed', () => { calls.push('failed'); })
        .on('skipped', () => { calls.push('skipped'); });

      expect(calls).toEqual(['success']);
    });

    it('should call good handler for success', () => {
      const result = successResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
      });

      let called = false;
      result.on('good', () => {
        called = true;
      });

      expect(called).toBe(true);
    });

    it('should call good handler for skipped', () => {
      const result = skippedResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
      });

      let called = false;
      result.on('good', () => {
        called = true;
      });

      expect(called).toBe(true);
    });

    it('should call bad handler for failed', () => {
      const result = failedResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
        reason: 'error',
      });

      let called = false;
      result.on('bad', () => {
        called = true;
      });

      expect(called).toBe(true);
    });
  });

  describe('immutability', () => {
    it('should have frozen properties', () => {
      const result = successResult({
        task: mockTask as any,
        index: 0,
        context: defaultContext,
        chain: defaultChain,
      });

      // Result properties should not be directly modifiable
      expect(() => {
        (result as any).status = 'failed';
      }).toThrow();
    });
  });
});
