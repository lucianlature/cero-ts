/**
 * Chain - Execution chain for tracking task execution flow
 */

import { generateTimeOrderedUUID } from './utils/uuid.js';
import type { Result } from './result.js';

/**
 * Represents an execution chain that tracks task execution flow.
 * Provides correlation IDs for distributed tracing and result collection.
 */
export class Chain {
  /** Unique identifier for this execution chain */
  readonly id: string;

  /** Results collected during chain execution */
  private readonly _results: Result[] = [];

  /** Current execution index */
  private _index = 0;

  /** Parent chain if this is a nested execution */
  readonly parent?: Chain;

  constructor(options?: { id?: string; parent?: Chain }) {
    this.id = options?.id ?? generateTimeOrderedUUID();
    this.parent = options?.parent;
  }

  /**
   * Get the current execution index
   */
  get index(): number {
    return this._index;
  }

  /**
   * Get all results in this chain
   */
  get results(): readonly Result[] {
    return this._results;
  }

  /**
   * Get the number of results in this chain
   */
  get size(): number {
    return this._results.length;
  }

  /**
   * Get the root chain (topmost parent)
   */
  get root(): Chain {
    return this.parent ? this.parent.root : this;
  }

  /**
   * Get the depth of this chain (0 for root)
   */
  get depth(): number {
    return this.parent ? this.parent.depth + 1 : 0;
  }

  /**
   * Add a result to the chain
   */
  addResult(result: Result): void {
    this._results.push(result);
  }

  /**
   * Get the next index and increment
   */
  nextIndex(): number {
    return this._index++;
  }

  /**
   * Get a result by index
   */
  getResult(index: number): Result | undefined {
    return this._results[index];
  }

  /**
   * Get the last result in the chain
   */
  get lastResult(): Result | undefined {
    return this._results[this._results.length - 1];
  }

  /**
   * Get the first failed result in the chain
   */
  get firstFailure(): Result | undefined {
    return this._results.find((r) => r.failed);
  }

  /**
   * Check if any result in the chain failed
   */
  get hasFailed(): boolean {
    return this._results.some((r) => r.failed);
  }

  /**
   * Check if all results in the chain succeeded
   */
  get allSucceeded(): boolean {
    return this._results.every((r) => r.success);
  }

  /**
   * Create a child chain for nested execution
   */
  createChild(): Chain {
    return new Chain({ parent: this });
  }

  /**
   * Convert chain to a plain object for serialization
   */
  toJSON(): ChainJSON {
    return {
      id: this.id,
      index: this._index,
      size: this.size,
      depth: this.depth,
      parentId: this.parent?.id,
    };
  }

  [Symbol.toStringTag] = 'Chain';
}

/**
 * JSON representation of a chain
 */
export interface ChainJSON {
  id: string;
  index: number;
  size: number;
  depth: number;
  parentId?: string;
}

/**
 * Create a new execution chain
 */
export function createChain(options?: { id?: string; parent?: Chain }): Chain {
  return new Chain(options);
}
