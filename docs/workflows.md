# Workflows

Compose multiple tasks into powerful, sequential or parallel pipelines. Workflows provide a declarative way to build complex business processes with conditional execution, shared context, and flexible error handling.

## Basic Workflow

Tasks run in declaration order, sharing a common context across the pipeline.

> **Note:** Don't override the `work` method in workflows—the base class handles execution automatically.

```typescript
import { Workflow } from 'cero-ts';

class OnboardingWorkflow extends Workflow {
  static override tasks = [
    CreateUserProfile,
    SetupAccountPreferences,
    SendWelcomeEmail,
    CreateDashboard,
  ];
}

const result = await OnboardingWorkflow.execute({ userId: 123 });
```

## Task Groups

Group related tasks to share configuration:

```typescript
class ContentModerationWorkflow extends Workflow {
  static override tasks = [
    // Screening phase - halt on skip
    { tasks: [ScanForProfanity, CheckForSpam, ValidateImages], breakpoints: ['skipped'] },

    // Review phase
    { tasks: [ApplyFilters, ScoreContent, FlagSuspicious] },

    // Decision phase
    { tasks: [PublishContent, QueueForReview, NotifyModerators] },
  ];
}
```

## Conditional Execution

Control which tasks run based on conditions:

```typescript
class OnboardingWorkflow extends Workflow {
  static override tasks = [
    CreateUserProfile,
    SetupAccountPreferences,

    // Conditional task
    { task: SendWelcomeEmail, if: 'emailConfigured' },

    // Conditional with arrow function
    { task: SetupTwoFactor, if: (workflow) => workflow.context.get('user').requiresMfa },

    // Unless condition
    { task: SendSmsNotification, unless: 'emailConfigured' },
  ];

  emailConfigured() {
    return this.context.get('user').emailVerified === true;
  }
}
```

## Parallel Execution

Run tasks concurrently using the `parallel` strategy:

```typescript
class SendNotificationsWorkflow extends Workflow {
  static override tasks = [
    PrepareNotificationContent,

    // These run in parallel
    {
      tasks: [SendEmailNotification, SendSmsNotification, SendPushNotification],
      strategy: 'parallel',
    },

    RecordNotificationsSent,
  ];
}
```

> **Warning:** Context is read-only during parallel execution. Load all required data beforehand.

## Halt Behavior

By default, failed tasks stop the workflow. Skipped tasks continue. Configure breakpoints to customize:

```typescript
class AnalyticsWorkflow extends Workflow {
  static override tasks = [
    CollectMetrics,      // If fails → workflow stops
    FilterOutliers,      // If skipped → workflow continues
    GenerateDashboard,   // Only runs if no failures
  ];
}
```

### Custom Breakpoints

```typescript
class SecurityWorkflow extends Workflow {
  // Halt on both failed AND skipped results
  static override settings = {
    workflowBreakpoints: ['skipped', 'failed'],
  };

  static override tasks = [
    PerformSecurityScan,
    ValidateSecurityRules,
  ];
}

class OptionalTasksWorkflow extends Workflow {
  // Never halt, always continue
  static override settings = {
    workflowBreakpoints: [],
  };

  static override tasks = [
    TryBackupData,
    TryCleanupLogs,
    TryOptimizeCache,
  ];
}
```

### Per-Group Breakpoints

```typescript
class SubscriptionWorkflow extends Workflow {
  static override tasks = [
    // Critical tasks - halt on any interruption
    { tasks: [CreateSubscription, ValidatePayment], breakpoints: ['skipped', 'failed'] },

    // Optional tasks - never halt
    { tasks: [SendConfirmationEmail, UpdateAnalytics], breakpoints: [] },
  ];
}
```

## Nested Workflows

Build hierarchical workflows by composing workflows within workflows:

```typescript
class EmailPreparationWorkflow extends Workflow {
  static override tasks = [
    ValidateRecipients,
    CompileTemplate,
  ];
}

class EmailDeliveryWorkflow extends Workflow {
  static override tasks = [
    SendEmails,
    TrackDeliveries,
  ];
}

class CompleteEmailWorkflow extends Workflow {
  static override tasks = [
    EmailPreparationWorkflow,
    { task: EmailDeliveryWorkflow, if: 'preparationSuccessful' },
    GenerateDeliveryReport,
  ];

  preparationSuccessful() {
    return this.context.get('recipientsValid') && this.context.get('templateCompiled');
  }
}
```

## Context Sharing

All tasks in a workflow share the same context:

```typescript
class OrderWorkflow extends Workflow {
  static override tasks = [
    ValidateOrder,      // Sets context.order
    CalculateTotal,     // Reads context.order, sets context.total
    ProcessPayment,     // Reads context.total, sets context.payment
    SendConfirmation,   // Reads context.order, context.payment
  ];
}

class ValidateOrder extends Task {
  override async work() {
    const order = await Order.findById(this.context.get('orderId'));
    this.context.set('order', order);
  }
}

class CalculateTotal extends Task {
  override async work() {
    const order = this.context.get('order');
    const total = order.items.reduce((sum, item) => sum + item.price, 0);
    this.context.set('total', total);
  }
}
```

## Functional API

Use `defineWorkflow` for a more functional approach:

```typescript
import { defineWorkflow } from 'cero-ts';

const OnboardingWorkflow = defineWorkflow([
  CreateUserProfile,
  SetupAccountPreferences,
  { task: SendWelcomeEmail, if: (w) => w.context.get('emailEnabled') },
], {
  workflowBreakpoints: ['failed'],
});

const result = await OnboardingWorkflow.execute({ userId: 123 });
```

## Error Handling

When a task fails, the workflow stops and returns the failure:

```typescript
const result = await OrderWorkflow.execute({ orderId: 123 });

if (result.failed) {
  console.log(`Workflow failed at: ${result.metadata.failedTask}`);
  console.log(`Reason: ${result.reason}`);

  // Access the chain of executed tasks
  console.log(`Completed tasks: ${result.metadata.completedTasks}`);
}
```

## Workflow Results

Workflow results include additional metadata:

```typescript
const result = await OnboardingWorkflow.execute({ userId: 123 });

result.success;        // true if all tasks succeeded
result.failed;         // true if any task failed
result.skipped;        // true if workflow was skipped
result.context;        // Shared context with all task outputs
result.metadata;       // { taskCount: 4, runtime: 1234 }
```

## Best Practices

1. **Single Responsibility**: Each task should do one thing well
2. **Idempotency**: Tasks should be safe to retry
3. **Context Keys**: Use consistent naming for context keys
4. **Error Messages**: Provide meaningful failure reasons
5. **Breakpoints**: Configure breakpoints based on business requirements

```typescript
// Good: Clear task names, single responsibility
class CalculateOrderTotal extends Task { }
class ApplyDiscounts extends Task { }
class ValidateInventory extends Task { }

// Bad: Task doing too much
class ProcessEntireOrder extends Task { }
```
