/**
 * Chain Tests
 */

import { describe, it, expect } from 'vitest';
import { Chain, createChain } from './chain.js';

describe('Chain', () => {
  describe('creation', () => {
    it('should create a chain with auto-generated ID', () => {
      const chain = createChain();

      expect(chain.id).toBeDefined();
      expect(typeof chain.id).toBe('string');
      expect(chain.id.length).toBeGreaterThan(0);
    });

    it('should create a chain with custom ID', () => {
      const chain = createChain({ id: 'custom-chain-id' });

      expect(chain.id).toBe('custom-chain-id');
    });

    it('should start with index 0', () => {
      const chain = createChain();

      expect(chain.index).toBe(0);
    });

    it('should create chain using constructor', () => {
      const chain = new Chain({ id: 'test-id' });

      expect(chain.id).toBe('test-id');
    });
  });

  describe('index management', () => {
    it('should get next index with incrementing', () => {
      const chain = createChain();

      const index1 = chain.nextIndex();
      const index2 = chain.nextIndex();

      expect(index1).toBe(0);
      expect(index2).toBe(1);
      expect(chain.index).toBe(2);
    });
  });

  describe('results tracking', () => {
    it('should start with empty results', () => {
      const chain = createChain();

      expect(chain.results).toEqual([]);
      expect(chain.size).toBe(0);
    });

    it('should add results', () => {
      const chain = createChain();
      const mockResult = { success: true } as any;

      chain.addResult(mockResult);

      expect(chain.results).toHaveLength(1);
      expect(chain.results[0]).toBe(mockResult);
      expect(chain.size).toBe(1);
    });

    it('should track multiple results', () => {
      const chain = createChain();
      const result1 = { id: 1 } as any;
      const result2 = { id: 2 } as any;
      const result3 = { id: 3 } as any;

      chain.addResult(result1);
      chain.addResult(result2);
      chain.addResult(result3);

      expect(chain.results).toHaveLength(3);
      expect(chain.size).toBe(3);
    });

    it('should return readonly results array', () => {
      const chain = createChain();
      const results = chain.results;

      expect(Array.isArray(results)).toBe(true);
    });

    it('should get result by index', () => {
      const chain = createChain();
      const result1 = { id: 1 } as any;
      const result2 = { id: 2 } as any;

      chain.addResult(result1);
      chain.addResult(result2);

      expect(chain.getResult(0)).toBe(result1);
      expect(chain.getResult(1)).toBe(result2);
      expect(chain.getResult(99)).toBeUndefined();
    });
  });

  describe('lastResult', () => {
    it('should return undefined when no results', () => {
      const chain = createChain();

      expect(chain.lastResult).toBeUndefined();
    });

    it('should return the most recent result', () => {
      const chain = createChain();
      const result1 = { id: 1 } as any;
      const result2 = { id: 2 } as any;

      chain.addResult(result1);
      expect(chain.lastResult).toBe(result1);

      chain.addResult(result2);
      expect(chain.lastResult).toBe(result2);
    });
  });

  describe('hasFailed', () => {
    it('should return false when no results', () => {
      const chain = createChain();

      expect(chain.hasFailed).toBe(false);
    });

    it('should return false when all results are successful', () => {
      const chain = createChain();

      chain.addResult({ failed: false } as any);
      chain.addResult({ failed: false } as any);

      expect(chain.hasFailed).toBe(false);
    });

    it('should return true when any result failed', () => {
      const chain = createChain();

      chain.addResult({ failed: false } as any);
      chain.addResult({ failed: true } as any);
      chain.addResult({ failed: false } as any);

      expect(chain.hasFailed).toBe(true);
    });
  });

  describe('allSucceeded', () => {
    it('should return true when no results', () => {
      const chain = createChain();

      expect(chain.allSucceeded).toBe(true);
    });

    it('should return true when all results are successful', () => {
      const chain = createChain();

      chain.addResult({ success: true } as any);
      chain.addResult({ success: true } as any);

      expect(chain.allSucceeded).toBe(true);
    });

    it('should return false when any result is not successful', () => {
      const chain = createChain();

      chain.addResult({ success: true } as any);
      chain.addResult({ success: false } as any);

      expect(chain.allSucceeded).toBe(false);
    });
  });

  describe('firstFailure', () => {
    it('should return undefined when no failures', () => {
      const chain = createChain();

      chain.addResult({ failed: false } as any);

      expect(chain.firstFailure).toBeUndefined();
    });

    it('should return first failed result', () => {
      const chain = createChain();
      const success = { failed: false, id: 1 } as any;
      const failure1 = { failed: true, id: 2 } as any;
      const failure2 = { failed: true, id: 3 } as any;

      chain.addResult(success);
      chain.addResult(failure1);
      chain.addResult(failure2);

      expect(chain.firstFailure).toBe(failure1);
    });
  });

  describe('parent/child chains', () => {
    it('should create child chain', () => {
      const parent = createChain({ id: 'parent' });
      const child = parent.createChild();

      expect(child.parent).toBe(parent);
      expect(child.id).not.toBe(parent.id);
    });

    it('should track depth', () => {
      const root = createChain();
      const child = root.createChild();
      const grandchild = child.createChild();

      expect(root.depth).toBe(0);
      expect(child.depth).toBe(1);
      expect(grandchild.depth).toBe(2);
    });

    it('should find root chain', () => {
      const root = createChain({ id: 'root' });
      const child = root.createChild();
      const grandchild = child.createChild();

      expect(grandchild.root).toBe(root);
      expect(child.root).toBe(root);
      expect(root.root).toBe(root);
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const chain = createChain({ id: 'json-test' });
      chain.nextIndex();
      chain.nextIndex();

      const json = chain.toJSON();

      expect(json.id).toBe('json-test');
      expect(json.index).toBe(2);
      expect(json.size).toBe(0);
      expect(json.depth).toBe(0);
    });

    it('should include parentId for child chains', () => {
      const parent = createChain({ id: 'parent-id' });
      const child = parent.createChild();

      const json = child.toJSON();

      expect(json.parentId).toBe('parent-id');
    });
  });
});
