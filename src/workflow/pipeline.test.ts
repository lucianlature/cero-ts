/**
 * Workflow Pipeline Tests - Pipeline mode, Signals, Queries, Conditions
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Task } from '../task.js';
import { Workflow } from './pipeline.js';
import { defineSignal, defineQuery } from './messages.js';
import { WorkflowHandle } from './handle.js';

/** Helper: flush microtasks so async workflow code can progress */
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

// ============================================
// Test Tasks
// ============================================

class StepOneTask extends Task {
  override async work() {
    this.context.set('step1', true);
  }
}

class StepTwoTask extends Task {
  override async work() {
    this.context.set('step2', true);
  }
}

class FailingTask extends Task {
  override async work() {
    this.fail('Task failed', { code: 'ERR' });
  }
}


// ============================================
// Pipeline Mode Tests (backward compatibility)
// ============================================

describe('Workflow - Pipeline Mode', () => {
  it('should execute tasks sequentially', async () => {
    class SequentialWorkflow extends Workflow {
      static override tasks = [StepOneTask, StepTwoTask];
    }

    const result = await SequentialWorkflow.execute();

    expect(result.success).toBe(true);
    expect(result.context.get('step1')).toBe(true);
    expect(result.context.get('step2')).toBe(true);
  });

  it('should stop on failure breakpoint', async () => {
    class FailWorkflow extends Workflow {
      static override tasks = [StepOneTask, FailingTask, StepTwoTask];
    }

    const result = await FailWorkflow.execute();

    expect(result.failed).toBe(true);
    expect(result.context.get('step1')).toBe(true);
    expect(result.context.get('step2')).toBeUndefined();
  });

  it('should support conditional tasks', async () => {
    class ConditionalWorkflow extends Workflow {
      static override tasks = [
        StepOneTask,
        { task: StepTwoTask, if: 'shouldRunTwo' },
      ];

      shouldRunTwo() {
        return false;
      }
    }

    const result = await ConditionalWorkflow.execute();

    expect(result.success).toBe(true);
    expect(result.context.get('step1')).toBe(true);
    expect(result.context.get('step2')).toBeUndefined();
  });

  it('should support parallel task groups', async () => {
    class ParallelWorkflow extends Workflow {
      static override tasks = [
        { tasks: [StepOneTask, StepTwoTask], strategy: 'parallel' as const },
      ];
    }

    const result = await ParallelWorkflow.execute();

    expect(result.success).toBe(true);
  });

  it('should expose task results', async () => {
    class MultiWorkflow extends Workflow {
      static override tasks = [StepOneTask, StepTwoTask];
    }

    const result = await MultiWorkflow.execute();
    expect(result.success).toBe(true);
  });
});

// ============================================
// Signal Definitions
// ============================================

const approvalSignal = defineSignal<[{ approved: boolean; approver: string }]>('approval');
const cancelSignal = defineSignal('cancel');
const statusQuery = defineQuery<string>('status');

// ============================================
// Interactive Mode - Signals & Queries
// ============================================

describe('Workflow - Interactive Mode (Signals & Queries)', () => {
  it('should return a WorkflowHandle from start()', () => {
    class SimpleInteractive extends Workflow {
      override async work() {
        this.context.set('done', true);
      }
    }

    const handle = SimpleInteractive.start();

    expect(handle).toBeInstanceOf(WorkflowHandle);
    expect(handle.workflowId).toBeDefined();
  });

  it('should resolve handle.result() when workflow completes', async () => {
    class SimpleInteractive extends Workflow {
      override async work() {
        this.context.set('done', true);
      }
    }

    const handle = SimpleInteractive.start();
    const result = await handle.result();

    expect(result.success).toBe(true);
    expect(result.context.get('done')).toBe(true);
    expect(handle.completed).toBe(true);
  });

  it('should support queries on running workflow', async () => {
    class QueryWorkflow extends Workflow {
      override async work() {
        this.setHandler(statusQuery, () => 'running');
      }
    }

    const handle = QueryWorkflow.start();

    // Wait for workflow to start and register handlers
    await flushMicrotasks();

    const status = handle.query(statusQuery);
    expect(status).toBe('running');

    await handle.result();
  });

  it('should throw on unknown query', async () => {
    class NoHandlerWorkflow extends Workflow {
      override async work() {
        // No handlers registered
      }
    }

    const handle = NoHandlerWorkflow.start();

    await flushMicrotasks();

    const unknownQuery = defineQuery('unknown');
    expect(() => handle.query(unknownQuery)).toThrow(
      "No handler registered for query 'unknown'",
    );
  });

  it('should receive signals and mutate state', async () => {
    class SignalWorkflow extends Workflow {
      override async work() {
        let status = 'pending';

        this.setHandler(approvalSignal, (input) => {
          status = input.approved ? 'approved' : 'rejected';
        });
        this.setHandler(statusQuery, () => status);

        await this.condition(() => status !== 'pending');
        this.context.set('finalStatus', status);
      }
    }

    const handle = SignalWorkflow.start();

    // Let handlers register
    await flushMicrotasks();

    expect(handle.query(statusQuery)).toBe('pending');

    handle.signal(approvalSignal, { approved: true, approver: 'alice' });

    const result = await handle.result();
    expect(result.success).toBe(true);
    expect(result.context.get('finalStatus')).toBe('approved');
  });

  it('should handle rejection signal', async () => {
    class RejectionWorkflow extends Workflow {
      override async work() {
        let decision: { approved: boolean; approver: string } | undefined;

        this.setHandler(approvalSignal, (input) => {
          decision = input;
        });

        await this.condition(() => decision !== undefined);

        if (!decision?.approved) {
          this.skip('Request rejected', { approver: decision?.approver });
        }
      }
    }

    const handle = RejectionWorkflow.start();
    await flushMicrotasks();

    handle.signal(approvalSignal, { approved: false, approver: 'bob' });

    const result = await handle.result();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Request rejected');
  });

  it('should throw when signaling a completed workflow', async () => {
    class QuickWorkflow extends Workflow {
      override async work() {
        this.context.set('done', true);
      }
    }

    const handle = QuickWorkflow.start();
    await handle.result();

    expect(() => handle.signal(cancelSignal)).toThrow(
      "Cannot send signal 'cancel' to completed workflow",
    );
  });

  it('should allow queries after workflow completes', async () => {
    class QueryAfterComplete extends Workflow {
      override async work() {
        this.setHandler(statusQuery, () => 'completed');
      }
    }

    const handle = QueryAfterComplete.start();
    await handle.result();

    // Queries should still work after completion
    expect(handle.query(statusQuery)).toBe('completed');
  });

  it('should support queries with arguments', async () => {
    const itemQuery = defineQuery<string | undefined, [id: number]>('getItem');

    class QueryArgsWorkflow extends Workflow {
      override async work() {
        const items = new Map<number, string>([[1, 'apple'], [2, 'banana']]);

        this.setHandler(itemQuery, (id) => items.get(id));
      }
    }

    const handle = QueryArgsWorkflow.start();
    await flushMicrotasks();

    expect(handle.query(itemQuery, 1)).toBe('apple');
    expect(handle.query(itemQuery, 2)).toBe('banana');
    expect(handle.query(itemQuery, 3)).toBeUndefined();

    await handle.result();
  });
});

// ============================================
// Condition
// ============================================

describe('Workflow - condition()', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should resolve immediately when predicate is true', async () => {
    class ImmediateCondition extends Workflow {
      override async work() {
        const result = await this.condition(() => true);
        this.context.set('conditionResult', result);
      }
    }

    const handle = ImmediateCondition.start();
    const result = await handle.result();

    expect(result.success).toBe(true);
    expect(result.context.get('conditionResult')).toBe(true);
  });

  it('should resolve when signal satisfies condition', async () => {
    class WaitForSignal extends Workflow {
      override async work() {
        let approved = false;

        this.setHandler(cancelSignal, () => {
          approved = true;
        });

        const received = await this.condition(() => approved);
        this.context.set('received', received);
      }
    }

    const handle = WaitForSignal.start();
    await flushMicrotasks();

    handle.signal(cancelSignal);

    const result = await handle.result();
    expect(result.success).toBe(true);
    expect(result.context.get('received')).toBe(true);
  });

  it('should resolve with false on timeout', async () => {
    vi.useFakeTimers();

    class TimeoutCondition extends Workflow {
      override async work() {
        const received = await this.condition(() => false, 100);
        this.context.set('received', received);
      }
    }

    const handle = TimeoutCondition.start();

    await vi.advanceTimersByTimeAsync(100);

    const result = await handle.result();
    expect(result.success).toBe(true);
    expect(result.context.get('received')).toBe(false);
  });

  it('should support string duration for timeout', async () => {
    vi.useFakeTimers();

    class StringTimeout extends Workflow {
      override async work() {
        const received = await this.condition(() => false, '1s');
        this.context.set('received', received);
      }
    }

    const handle = StringTimeout.start();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await handle.result();
    expect(result.context.get('received')).toBe(false);
  });

  it('should support multiple concurrent conditions', async () => {
    const signalA = defineSignal('a');
    const signalB = defineSignal('b');

    class MultiCondition extends Workflow {
      override async work() {
        let a = false;
        let b = false;

        this.setHandler(signalA, () => { a = true; });
        this.setHandler(signalB, () => { b = true; });

        // Wait for both (concurrently)
        const [resultA, resultB] = await Promise.all([
          this.condition(() => a),
          this.condition(() => b),
        ]);

        this.context.set('a', resultA);
        this.context.set('b', resultB);
      }
    }

    const handle = MultiCondition.start();
    await flushMicrotasks();

    handle.signal(signalA);
    handle.signal(signalB);

    const result = await handle.result();
    expect(result.success).toBe(true);
    expect(result.context.get('a')).toBe(true);
    expect(result.context.get('b')).toBe(true);
  });

  it('should fail workflow when condition times out and fail() is called', async () => {
    vi.useFakeTimers();

    class FailOnTimeout extends Workflow {
      override async work() {
        const received = await this.condition(() => false, 100);
        if (!received) {
          this.fail('Timed out waiting');
        }
      }
    }

    const handle = FailOnTimeout.start();

    await vi.advanceTimersByTimeAsync(100);

    const result = await handle.result();
    expect(result.failed).toBe(true);
    expect(result.reason).toBe('Timed out waiting');
  });
});

// ============================================
// Signal Buffering
// ============================================

describe('Workflow - Signal Buffering', () => {
  it('should buffer signals received before handler registration', async () => {
    const earlySignal = defineSignal<[string]>('early');
    const registerSignal = defineSignal('register');

    class BufferedWorkflow extends Workflow {
      override async work() {
        let shouldRegister = false;

        // First, set up a gate — we'll wait until told to register
        this.setHandler(registerSignal, () => {
          shouldRegister = true;
        });

        // Wait for the register signal
        await this.condition(() => shouldRegister);

        // NOW register the early signal handler — after the signal was already sent
        let received: string | undefined;
        this.setHandler(earlySignal, (msg) => {
          received = msg;
        });

        // The buffered signal should have been flushed by setHandler
        this.context.set('received', received);
      }
    }

    const handle = BufferedWorkflow.start();
    await flushMicrotasks();

    // Send the early signal BEFORE its handler is registered
    handle.signal(earlySignal, 'hello');

    // Now trigger handler registration
    handle.signal(registerSignal);

    const result = await handle.result();
    expect(result.context.get('received')).toBe('hello');
  });
});

// ============================================
// Mixed Mode (Pipeline + Interactive)
// ============================================

describe('Workflow - Mixed Mode (runTasks + Signals)', () => {
  it('should run tasks then wait for signals', async () => {
    class MixedWorkflow extends Workflow {
      static override tasks = [StepOneTask, StepTwoTask];

      override async work() {
        let approved = false;

        this.setHandler(cancelSignal, () => {
          approved = true;
        });
        this.setHandler(statusQuery, () =>
          approved ? 'approved' : 'waiting',
        );

        // Run the pipeline first
        await this.runTasks();

        // Then wait for interactive input
        await this.condition(() => approved);
        this.context.set('approved', true);
      }
    }

    const handle = MixedWorkflow.start();
    await flushMicrotasks();

    // Tasks should have run
    expect(handle.query(statusQuery)).toBe('waiting');

    // Send signal
    handle.signal(cancelSignal);

    const result = await handle.result();
    expect(result.success).toBe(true);
    expect(result.context.get('step1')).toBe(true);
    expect(result.context.get('step2')).toBe(true);
    expect(result.context.get('approved')).toBe(true);
  });

  it('should fail mixed workflow if tasks fail', async () => {
    class FailMixedWorkflow extends Workflow {
      static override tasks = [StepOneTask, FailingTask];

      override async work() {
        this.setHandler(statusQuery, () => 'running');
        await this.runTasks(); // FailingTask will cause failure
      }
    }

    const handle = FailMixedWorkflow.start();
    const result = await handle.result();

    expect(result.failed).toBe(true);
  });
});

// ============================================
// WorkflowHandle
// ============================================

describe('WorkflowHandle', () => {
  it('should expose workflowId', () => {
    class IdWorkflow extends Workflow {
      override async work() {}
    }

    const handle = IdWorkflow.start();
    expect(handle.workflowId).toBeDefined();
    expect(typeof handle.workflowId).toBe('string');
  });

  it('should track completion state', async () => {
    class CompletionWorkflow extends Workflow {
      override async work() {}
    }

    const handle = CompletionWorkflow.start();
    expect(handle.completed).toBe(false);
    expect(handle.finalResult).toBeUndefined();

    const result = await handle.result();
    expect(handle.completed).toBe(true);
    expect(handle.finalResult).toBe(result);
  });

  it('should have correct toStringTag', () => {
    class TagWorkflow extends Workflow {
      override async work() {}
    }

    const handle = TagWorkflow.start();
    expect(Object.prototype.toString.call(handle)).toBe('[object WorkflowHandle]');
  });
});

// ============================================
// Real-world Scenario: Approval Flow
// ============================================

describe('Workflow - Real-world: Approval Flow', () => {
  it('should model a complete approval workflow', async () => {
    type ApprovalStatus = 'validating' | 'pending' | 'approved' | 'rejected' | 'timeout';

    const approveSignal = defineSignal<[{ approved: boolean; reason?: string }]>('approve');
    const approvalStatusQuery = defineQuery<ApprovalStatus>('approvalStatus');

    class ValidateRequestTask extends Task {
      override async work() {
        this.context.set('validated', true);
      }
    }

    class NotifyApproversTask extends Task {
      override async work() {
        this.context.set('notified', true);
      }
    }

    class ApprovalWorkflow extends Workflow {
      static override tasks = [ValidateRequestTask, NotifyApproversTask];

      override async work() {
        let status: ApprovalStatus = 'validating';
        let decision: { approved: boolean; reason?: string } | undefined;

        this.setHandler(approveSignal, (input) => {
          decision = input;
          status = input.approved ? 'approved' : 'rejected';
        });
        this.setHandler(approvalStatusQuery, () => status);

        // Phase 1: Run validation and notification tasks
        await this.runTasks();
        status = 'pending';

        // Phase 2: Wait for human decision
        const received = await this.condition(
          () => decision !== undefined,
          '5s', // Short timeout for test
        );

        if (!received) {
          status = 'timeout';
          this.fail('Approval timed out');
        }

        if (decision && !decision.approved) {
          this.skip('Request rejected', { reason: decision.reason });
        }

        this.context.set('approvedBy', 'workflow');
      }
    }

    // === Happy Path ===
    const handle = ApprovalWorkflow.start({ requestId: 'REQ-001' });
    await flushMicrotasks();

    // Verify state progression
    expect(handle.query(approvalStatusQuery)).toBe('pending');

    // Approve
    handle.signal(approveSignal, { approved: true });

    const result = await handle.result();
    expect(result.success).toBe(true);
    expect(result.context.get('validated')).toBe(true);
    expect(result.context.get('notified')).toBe(true);
    expect(result.context.get('approvedBy')).toBe('workflow');
  });

  it('should handle rejection in approval workflow', async () => {
    const rejectSignal = defineSignal<[{ approved: boolean; reason?: string }]>('reject');
    const rejectStatusQuery = defineQuery<string>('rejectStatus');

    class RejectableWorkflow extends Workflow {
      override async work() {
        let decision: { approved: boolean; reason?: string } | undefined;

        this.setHandler(rejectSignal, (input) => {
          decision = input;
        });
        this.setHandler(rejectStatusQuery, () =>
          decision ? (decision.approved ? 'approved' : 'rejected') : 'pending',
        );

        await this.condition(() => decision !== undefined);

        if (decision && !decision.approved) {
          this.skip('Rejected', { reason: decision.reason });
        }
      }
    }

    const handle = RejectableWorkflow.start();
    await flushMicrotasks();

    handle.signal(rejectSignal, { approved: false, reason: 'Budget exceeded' });

    const result = await handle.result();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Rejected');
    expect(result.metadata.reason).toBe('Budget exceeded');
  });
});

// ============================================================
// Real-world Scenario: Order Delivery (Temporal blog example)
// ============================================================

describe('Workflow - Real-world: Order Delivery', () => {
  it('should model a delivery flow with pickup and delivery signals', async () => {
    type OrderState = 'charging' | 'paid' | 'picked_up' | 'delivered';

    const pickedUpSignal = defineSignal('pickedUp');
    const deliveredSignal = defineSignal('delivered');
    const orderStatusQuery = defineQuery<OrderState>('orderStatus');

    class ChargeCustomerTask extends Task {
      override async work() {
        this.context.set('charged', true);
      }
    }

    class OrderWorkflow extends Workflow {
      static override tasks = [ChargeCustomerTask];

      override async work() {
        let state: OrderState = 'charging';

        this.setHandler(pickedUpSignal, () => {
          if (state === 'paid') state = 'picked_up';
        });
        this.setHandler(deliveredSignal, () => {
          if (state === 'picked_up') state = 'delivered';
        });
        this.setHandler(orderStatusQuery, () => state);

        // Charge customer
        await this.runTasks();
        state = 'paid';

        // Wait for pickup
        const pickedUp = await this.condition(
          () => state === 'picked_up',
          '2s',
        );
        if (!pickedUp) {
          this.fail('Not picked up in time');
        }

        // Wait for delivery
        const delivered = await this.condition(
          () => state === 'delivered',
          '2s',
        );
        if (!delivered) {
          this.fail('Not delivered in time');
        }

        this.context.set('orderComplete', true);
      }
    }

    const handle = OrderWorkflow.start({ productId: 42 });
    await flushMicrotasks();

    // Verify progression
    expect(handle.query(orderStatusQuery)).toBe('paid');

    // Driver picks up
    handle.signal(pickedUpSignal);
    await flushMicrotasks();
    expect(handle.query(orderStatusQuery)).toBe('picked_up');

    // Driver delivers
    handle.signal(deliveredSignal);

    const result = await handle.result();
    expect(result.success).toBe(true);
    expect(result.context.get('charged')).toBe(true);
    expect(result.context.get('orderComplete')).toBe(true);
  });
});
