/**
 * Task Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Task, required, optional } from './task.js';
import { Context } from './context.js';
import { Fault, SkipFault, FailFault } from './interruptions/faults.js';

// ============================================
// Test Tasks
// ============================================

class SimpleTask extends Task {
  override async work() {
    this.context.set('executed', true);
  }
}

interface GreetContext extends Record<string, unknown> {
  greeting: string;
}

class GreetTask extends Task<GreetContext> {
  static override attributes = {
    name: required(),
    prefix: optional({ default: 'Hello' }),
  };

  declare name: string;
  declare prefix: string;

  override async work() {
    this.context.set('greeting', `${this.prefix}, ${this.name}!`);
  }
}

class ValidationTask extends Task {
  static override attributes = {
    email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
    age: optional({ numeric: { min: 0, max: 150 } }),
  };

  declare email: string;
  declare age?: number;

  override async work() {
    this.context.set('valid', true);
  }
}

class SkipTask extends Task {
  static override attributes = {
    shouldSkip: optional({ default: false }),
  };

  declare shouldSkip: boolean;

  override async work() {
    if (this.shouldSkip) {
      this.skip('Skipping as requested');
    }
    this.context.set('completed', true);
  }
}

class FailTask extends Task {
  static override attributes = {
    shouldFail: optional({ default: false }),
  };

  declare shouldFail: boolean;

  override async work() {
    if (this.shouldFail) {
      this.fail('Failing as requested', { code: 'FAIL_001' });
    }
    this.context.set('completed', true);
  }
}

class CallbackTask extends Task {
  static override attributes = {
    value: required(),
  };

  static override callbacks = {
    beforeExecution: ['setupValue'],
    onSuccess: ['recordSuccess'],
  };

  declare value: number;

  override async work() {
    this.context.set('doubled', this.value * 2);
  }

  private setupValue() {
    this.context.set('setupCalled', true);
  }

  private recordSuccess() {
    this.context.set('successCalled', true);
  }
}

// ============================================
// Tests
// ============================================

describe('Task', () => {
  describe('basic execution', () => {
    it('should execute a simple task', async () => {
      const result = await SimpleTask.execute();

      expect(result.success).toBe(true);
      expect(result.complete).toBe(true);
      expect(result.context.get('executed')).toBe(true);
    });

    it('should have unique task ID', async () => {
      const result1 = await SimpleTask.execute();
      const result2 = await SimpleTask.execute();

      expect(result1.task.id).toBeDefined();
      expect(result2.task.id).toBeDefined();
      expect(result1.task.id).not.toBe(result2.task.id);
    });
  });

  describe('attributes', () => {
    it('should accept required attributes', async () => {
      const result = await GreetTask.execute({ name: 'World' });

      expect(result.success).toBe(true);
      expect(result.context.get('greeting')).toBe('Hello, World!');
    });

    it('should apply default values', async () => {
      const result = await GreetTask.execute({ name: 'World', prefix: 'Hi' });

      expect(result.success).toBe(true);
      expect(result.context.get('greeting')).toBe('Hi, World!');
    });

    it('should fail on missing required attributes', async () => {
      const result = await GreetTask.execute({});

      expect(result.failed).toBe(true);
      expect(result.reason).toBe('Invalid');
      expect(result.metadata.errors).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should validate format', async () => {
      const result = await ValidationTask.execute({ email: 'invalid' });

      expect(result.failed).toBe(true);
      expect(result.metadata.errors?.messages?.email).toContain('is invalid');
    });

    it('should validate numeric ranges', async () => {
      const result = await ValidationTask.execute({ email: 'test@example.com', age: 200 });

      expect(result.failed).toBe(true);
      expect(result.metadata.errors?.messages?.age).toBeDefined();
    });

    it('should pass valid data', async () => {
      const result = await ValidationTask.execute({ email: 'test@example.com', age: 25 });

      expect(result.success).toBe(true);
      expect(result.context.get('valid')).toBe(true);
    });
  });

  describe('interruptions', () => {
    describe('skip', () => {
      it('should skip execution', async () => {
        const result = await SkipTask.execute({ shouldSkip: true });

        expect(result.skipped).toBe(true);
        expect(result.interrupted).toBe(true);
        expect(result.reason).toBe('Skipping as requested');
        expect(result.context.get('completed')).toBeUndefined();
      });

      it('should complete normally without skip', async () => {
        const result = await SkipTask.execute({ shouldSkip: false });

        expect(result.success).toBe(true);
        expect(result.context.get('completed')).toBe(true);
      });
    });

    describe('fail', () => {
      it('should fail execution', async () => {
        const result = await FailTask.execute({ shouldFail: true });

        expect(result.failed).toBe(true);
        expect(result.interrupted).toBe(true);
        expect(result.reason).toBe('Failing as requested');
        expect(result.metadata.code).toBe('FAIL_001');
        expect(result.context.get('completed')).toBeUndefined();
      });

      it('should complete normally without fail', async () => {
        const result = await FailTask.execute({ shouldFail: false });

        expect(result.success).toBe(true);
        expect(result.context.get('completed')).toBe(true);
      });
    });
  });

  describe('executeStrict', () => {
    it('should throw FailFault on failure', async () => {
      await expect(FailTask.executeStrict({ shouldFail: true })).rejects.toThrow(FailFault);
    });

    it('should not throw on success', async () => {
      const result = await FailTask.executeStrict({ shouldFail: false });
      expect(result.success).toBe(true);
    });
  });

  describe('callbacks', () => {
    it('should run callbacks', async () => {
      const result = await CallbackTask.execute({ value: 5 });

      expect(result.success).toBe(true);
      expect(result.context.get('setupCalled')).toBe(true);
      expect(result.context.get('doubled')).toBe(10);
      expect(result.context.get('successCalled')).toBe(true);
    });
  });

  describe('result handlers', () => {
    it('should chain on handlers', async () => {
      let successCalled = false;
      let failedCalled = false;

      const result = await SimpleTask.execute();

      result
        .on('success', () => { successCalled = true; })
        .on('failed', () => { failedCalled = true; });

      expect(successCalled).toBe(true);
      expect(failedCalled).toBe(false);
    });
  });

  describe('context', () => {
    it('should share context across execution', async () => {
      const context = new Context({ initial: 'value' });
      const result = await SimpleTask.execute({}, { context });

      expect(result.context.get('initial')).toBe('value');
      expect(result.context.get('executed')).toBe(true);
    });
  });
});
