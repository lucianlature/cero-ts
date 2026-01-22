# Callbacks

Run custom logic at specific points during task execution. Callbacks have full access to task context and results, making them perfect for logging, notifications, cleanup, and more.

> **Note:** Callbacks execute in declaration order (FIFO). Multiple callbacks of the same type run sequentially.

## Available Callbacks

Callbacks execute in a predictable lifecycle order:

```
1. beforeValidation      # Pre-validation setup
2. beforeExecution       # Prepare for execution

   --- Task.work() executes ---

3. onComplete/onInterrupted   # State-based (execution lifecycle)
4. onExecuted                 # Always runs after work completes
5. onSuccess/onSkipped/onFailed  # Status-based (business outcome)
6. onGood/onBad              # Outcome-based (success/skip vs fail)
```

## Declarations

### Symbol References

Reference instance methods by name for simple callback logic:

```typescript
class ProcessBooking extends Task {
  static override callbacks = {
    beforeExecution: ['findReservation'],
    onComplete: ['notifyGuest', 'updateAvailability'],
  };

  override async work() {
    // Your logic here...
  }

  private findReservation() {
    this.reservation = await Reservation.findById(this.context.get('reservationId'));
  }

  private notifyGuest() {
    GuestNotifier.notify(this.context.get('guest'), this.result);
  }

  private updateAvailability() {
    AvailabilityService.update(this.context.get('roomIds'), this.result);
  }
}
```

### Arrow Functions

Use arrow functions for inline callback logic:

```typescript
class ProcessBooking extends Task {
  static override callbacks = {
    onInterrupted: [() => ReservationSystem.pause()],
    onComplete: [() => ReservationSystem.resume()],
  };
}
```

### Class or Object Callbacks

Implement reusable callback logic in dedicated classes:

```typescript
class BookingConfirmationCallback {
  call(task: Task) {
    if (task.result?.success) {
      MessagingApi.sendConfirmation(task.context.get('guest'));
    } else {
      MessagingApi.sendIssueAlert(task.context.get('manager'));
    }
  }
}

class ProcessBooking extends Task {
  static override callbacks = {
    onSuccess: [new BookingConfirmationCallback()],
  };
}
```

## Callback Types

### beforeValidation

Runs before attribute validation. Use for setup that must happen before validation.

```typescript
class ImportData extends Task {
  static override callbacks = {
    beforeValidation: ['normalizeInput'],
  };

  private normalizeInput() {
    // Normalize data before validation runs
    const raw = this.context.get('rawData');
    this.context.set('data', normalizeData(raw));
  }
}
```

### beforeExecution

Runs after validation but before `work()`. Use for setup that depends on validated attributes.

```typescript
class ProcessOrder extends Task {
  static override attributes = {
    orderId: required(),
  };

  declare orderId: string;

  static override callbacks = {
    beforeExecution: ['loadOrder'],
  };

  private async loadOrder() {
    this.order = await Order.findById(this.orderId);
  }

  override async work() {
    // this.order is available here
  }
}
```

### onSuccess / onFailed / onSkipped

Run based on the task's status after execution.

```typescript
class ChargePayment extends Task {
  static override callbacks = {
    onSuccess: ['sendReceipt', 'updateLedger'],
    onFailed: ['notifySupport', 'logFailure'],
    onSkipped: ['logSkip'],
  };
}
```

### onComplete / onInterrupted

Run based on the task's state (complete vs interrupted).

```typescript
class ProcessBatch extends Task {
  static override callbacks = {
    onComplete: ['cleanupResources'],
    onInterrupted: ['rollbackChanges'],
  };
}
```

### onExecuted

Always runs after `work()` completes, regardless of outcome. Use for cleanup.

```typescript
class DatabaseOperation extends Task {
  static override callbacks = {
    onExecuted: ['releaseConnection'],
  };

  private releaseConnection() {
    this.connection?.release();
  }
}
```

### onGood / onBad

Run based on outcome classification:
- `onGood`: success or skipped
- `onBad`: failed

```typescript
class ProcessRequest extends Task {
  static override callbacks = {
    onGood: ['recordSuccess'],
    onBad: ['alertOnCall'],
  };
}
```

## Global Callbacks

Register callbacks that run for all tasks:

```typescript
import { configure } from 'cero-ts';

configure((config) => {
  config.callbacks.register('onFailed', (task) => {
    Sentry.captureException(task.result?.cause);
  });

  config.callbacks.register('onSuccess', (task) => {
    Metrics.increment('task.success', { task: task.constructor.name });
  });
});
```

## Callback Execution Order

1. Global callbacks registered via `configure()`
2. Task-level callbacks in declaration order

```typescript
// Global callback runs first
configure((config) => {
  config.callbacks.register('onSuccess', globalHandler);
});

// Then task-level callbacks in order
class MyTask extends Task {
  static override callbacks = {
    onSuccess: ['first', 'second', 'third'],
  };
}
```
