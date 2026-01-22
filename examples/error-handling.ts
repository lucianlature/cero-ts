/**
 * Error Handling Example
 *
 * This example demonstrates error handling patterns in cero-ts:
 * - Using skip() for non-error interruptions
 * - Using fail() for error conditions
 * - Using throw() to propagate child task failures
 * - Handling faults with executeStrict()
 * - Result-based error handling patterns
 */

import {
  Task,
  Workflow,
  required,
  optional,
  FailFault,
  SkipFault,
  Fault,
} from 'cero-ts';

// =============================================================================
// Example 1: Using skip() - Non-Error Interruptions
// =============================================================================

/**
 * Skip is for situations where the task can't proceed but it's not an error.
 * Common use cases: already processed, feature disabled, no work to do.
 */
class ProcessPayment extends Task {
  static override attributes = {
    orderId: required({ type: 'integer' }),
  };

  declare orderId: number;

  override async work() {
    const order = await this.findOrder(this.orderId);

    // Skip if already paid - not an error, just nothing to do
    if (order.isPaid) {
      this.skip('Order already paid', {
        orderId: this.orderId,
        paidAt: order.paidAt,
      });
      return;
    }

    // Skip if cancelled - expected condition
    if (order.isCancelled) {
      this.skip('Order was cancelled', {
        orderId: this.orderId,
        cancelledAt: order.cancelledAt,
      });
      return;
    }

    // Process the payment
    await this.chargePayment(order);
    this.context.set('payment', { orderId: this.orderId, status: 'completed' });
  }

  private async findOrder(id: number) {
    // Simulated order lookup
    return {
      id,
      isPaid: id === 1,
      isCancelled: id === 2,
      paidAt: id === 1 ? new Date() : null,
      cancelledAt: id === 2 ? new Date() : null,
      amount: 99.99,
    };
  }

  private async chargePayment(order: { amount: number }) {
    // Simulated payment processing
    console.log(`Charging ${order.amount}...`);
  }
}

async function demonstrateSkip() {
  console.log('\n=== Skip Examples ===\n');

  // Case 1: Order already paid
  const result1 = await ProcessPayment.execute({ orderId: 1 });
  console.log('Already paid order:');
  console.log('  Status:', result1.status); // "skipped"
  console.log('  Reason:', result1.reason); // "Order already paid"
  console.log('  Metadata:', result1.metadata);

  // Case 2: Cancelled order
  const result2 = await ProcessPayment.execute({ orderId: 2 });
  console.log('\nCancelled order:');
  console.log('  Status:', result2.status); // "skipped"
  console.log('  Reason:', result2.reason); // "Order was cancelled"

  // Case 3: Normal processing
  const result3 = await ProcessPayment.execute({ orderId: 3 });
  console.log('\nNormal order:');
  console.log('  Status:', result3.status); // "success"
  console.log('  Payment:', result3.context.get('payment'));
}

// =============================================================================
// Example 2: Using fail() - Error Conditions
// =============================================================================

/**
 * Fail is for actual error conditions that prevent task completion.
 * Common use cases: validation errors, external service failures, business rule violations.
 */
class ValidateDocument extends Task {
  static override attributes = {
    document: required(),
  };

  declare document: {
    content: string;
    type: string;
    size: number;
  };

  override async work() {
    const errors: string[] = [];

    // Validate document type
    const allowedTypes = ['pdf', 'docx', 'txt'];
    if (!allowedTypes.includes(this.document.type)) {
      errors.push(`Invalid document type: ${this.document.type}`);
    }

    // Validate content
    if (!this.document.content || this.document.content.trim().length === 0) {
      errors.push('Document content is empty');
    }

    // Validate size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (this.document.size > maxSize) {
      errors.push(`Document too large: ${this.document.size} bytes (max: ${maxSize})`);
    }

    // If validation errors, fail the task
    if (errors.length > 0) {
      this.fail('Document validation failed', {
        errorCount: errors.length,
        errors,
        documentType: this.document.type,
      });
      return;
    }

    this.context.set('validated', true);
    this.context.set('documentId', `doc_${Date.now()}`);
  }
}

async function demonstrateFail() {
  console.log('\n=== Fail Examples ===\n');

  // Case 1: Invalid document type
  const result1 = await ValidateDocument.execute({
    document: { content: 'Hello', type: 'exe', size: 1000 },
  });
  console.log('Invalid type:');
  console.log('  Status:', result1.status); // "failed"
  console.log('  Reason:', result1.reason); // "Document validation failed"
  console.log('  Errors:', result1.metadata.errors);

  // Case 2: Multiple validation errors
  const result2 = await ValidateDocument.execute({
    document: { content: '', type: 'exe', size: 20 * 1024 * 1024 },
  });
  console.log('\nMultiple errors:');
  console.log('  Error count:', result2.metadata.errorCount);
  console.log('  Errors:', result2.metadata.errors);

  // Case 3: Valid document
  const result3 = await ValidateDocument.execute({
    document: { content: 'Valid content', type: 'pdf', size: 5000 },
  });
  console.log('\nValid document:');
  console.log('  Status:', result3.status); // "success"
  console.log('  Document ID:', result3.context.get('documentId'));
}

// =============================================================================
// Example 3: Using throw() - Propagating Child Task Failures
// =============================================================================

/**
 * Throw is for propagating failures from child tasks.
 * It preserves the original error chain for debugging.
 */
class ChargeCard extends Task {
  static override attributes = {
    amount: required({ type: 'float' }),
    cardId: required(),
  };

  declare amount: number;
  declare cardId: string;

  override async work() {
    // Simulate card charging
    if (this.cardId === 'card_declined') {
      this.fail('Card declined', {
        code: 'CARD_DECLINED',
        cardId: this.cardId,
      });
      return;
    }

    if (this.cardId === 'card_expired') {
      this.fail('Card expired', {
        code: 'CARD_EXPIRED',
        cardId: this.cardId,
      });
      return;
    }

    this.context.set('transactionId', `txn_${Date.now()}`);
    this.context.set('chargedAmount', this.amount);
  }
}

class RefundPayment extends Task {
  static override attributes = {
    transactionId: required(),
    amount: required({ type: 'float' }),
  };

  declare transactionId: string;
  declare amount: number;

  override async work() {
    // Simulate refund
    this.context.set('refundId', `ref_${Date.now()}`);
    this.context.set('refundedAmount', this.amount);
  }
}

class ProcessOrderPayment extends Task {
  static override attributes = {
    orderId: required({ type: 'integer' }),
    amount: required({ type: 'float' }),
    cardId: required(),
  };

  declare orderId: number;
  declare amount: number;
  declare cardId: string;

  override async work() {
    // Step 1: Charge the card
    const chargeResult = await ChargeCard.execute({
      amount: this.amount,
      cardId: this.cardId,
    });

    // Propagate failure if charging failed
    if (chargeResult.failed) {
      this.throw(chargeResult, {
        stage: 'payment',
        orderId: this.orderId,
      });
      return;
    }

    // Step 2: Record the successful payment
    this.context.set('transactionId', chargeResult.context.get('transactionId'));
    this.context.set('orderId', this.orderId);
    this.context.set('status', 'paid');
  }
}

async function demonstrateThrow() {
  console.log('\n=== Throw Examples ===\n');

  // Case 1: Card declined
  const result1 = await ProcessOrderPayment.execute({
    orderId: 123,
    amount: 99.99,
    cardId: 'card_declined',
  });
  console.log('Card declined:');
  console.log('  Status:', result1.status); // "failed"
  console.log('  Reason:', result1.reason); // "Card declined"
  console.log('  Original code:', result1.metadata.code); // "CARD_DECLINED"
  console.log('  Stage:', result1.metadata.stage); // "payment"

  // Case 2: Successful payment
  const result2 = await ProcessOrderPayment.execute({
    orderId: 456,
    amount: 149.99,
    cardId: 'card_valid',
  });
  console.log('\nSuccessful payment:');
  console.log('  Status:', result2.status); // "success"
  console.log('  Transaction:', result2.context.get('transactionId'));
}

// =============================================================================
// Example 4: Using executeStrict() with try/catch
// =============================================================================

/**
 * executeStrict() throws faults instead of returning failed results.
 * Use this for exception-based error handling.
 */
async function demonstrateExecuteStrict() {
  console.log('\n=== executeStrict Examples ===\n');

  // Handle specific fault types
  try {
    await ValidateDocument.executeStrict({
      document: { content: '', type: 'exe', size: 100 },
    });
    console.log('Document validated successfully');
  } catch (error) {
    if (error instanceof FailFault) {
      console.log('Validation failed:');
      console.log('  Reason:', error.result.reason);
      console.log('  Errors:', error.result.metadata.errors);
    } else {
      throw error;
    }
  }

  // Handle skip faults
  try {
    await ProcessPayment.executeStrict({ orderId: 1 });
    console.log('Payment processed');
  } catch (error) {
    if (error instanceof SkipFault) {
      console.log('\nPayment skipped:');
      console.log('  Reason:', error.result.reason);
      console.log('  This is not an error, just nothing to do');
    } else if (error instanceof FailFault) {
      console.log('Payment failed:', error.result.reason);
    } else {
      throw error;
    }
  }

  // Catch all faults
  try {
    await ChargeCard.executeStrict({
      amount: 99.99,
      cardId: 'card_expired',
    });
  } catch (error) {
    if (error instanceof Fault) {
      console.log('\nTask interrupted:');
      console.log('  Task:', error.task.constructor.name);
      console.log('  Status:', error.result.status);
      console.log('  Reason:', error.result.reason);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Example 5: Result-Based Error Handling Patterns
// =============================================================================

/**
 * Different patterns for handling results without exceptions.
 */
async function demonstrateResultPatterns() {
  console.log('\n=== Result-Based Patterns ===\n');

  // Pattern 1: Boolean checks
  const result1 = await ProcessPayment.execute({ orderId: 3 });
  if (result1.success) {
    console.log('Pattern 1 - Success:', result1.context.get('payment'));
  } else if (result1.skipped) {
    console.log('Pattern 1 - Skipped:', result1.reason);
  } else if (result1.failed) {
    console.log('Pattern 1 - Failed:', result1.reason);
  }

  // Pattern 2: Switch on status
  const result2 = await ValidateDocument.execute({
    document: { content: 'Test', type: 'pdf', size: 100 },
  });
  switch (result2.status) {
    case 'success':
      console.log('\nPattern 2 - Success');
      break;
    case 'skipped':
      console.log('\nPattern 2 - Skipped:', result2.reason);
      break;
    case 'failed':
      console.log('\nPattern 2 - Failed:', result2.reason);
      break;
  }

  // Pattern 3: Fluent handlers
  console.log('\nPattern 3 - Fluent handlers:');
  await ValidateDocument.execute({
    document: { content: '', type: 'pdf', size: 100 },
  }).then((result) =>
    result
      .on('success', () => console.log('  Document valid'))
      .on('failed', (r) => console.log('  Validation failed:', r.reason))
  );

  // Pattern 4: Good/Bad classification
  const result4 = await ProcessPayment.execute({ orderId: 1 });
  if (result4.good) {
    // Success OR skipped - not an error
    console.log('\nPattern 4 - Good outcome (success or skip)');
  }
  if (result4.bad) {
    // Failed - error condition
    console.log('\nPattern 4 - Bad outcome (failed)');
  }

  // Pattern 5: Early return
  async function handleOrder(orderId: number) {
    const result = await ProcessPayment.execute({ orderId });

    if (!result.success) {
      return { error: result.reason, code: result.metadata.code };
    }

    return { payment: result.context.get('payment') };
  }

  console.log('\nPattern 5 - Early return:', await handleOrder(3));
}

// =============================================================================
// Example 6: Error Handling in Workflows
// =============================================================================

/**
 * Workflows with error handling and breakpoints.
 */

class ValidateOrder extends Task {
  static override attributes = {
    orderId: required({ type: 'integer' }),
  };

  declare orderId: number;

  override async work() {
    if (this.orderId < 0) {
      this.fail('Invalid order ID', { orderId: this.orderId });
      return;
    }
    this.context.set('orderValid', true);
  }
}

class CheckInventory extends Task {
  override async work() {
    const orderId = this.context.get('orderId') as number;

    // Simulate out of stock
    if (orderId === 999) {
      this.skip('Item out of stock', { orderId });
      return;
    }

    this.context.set('inventoryChecked', true);
  }
}

class CreateShipment extends Task {
  override async work() {
    this.context.set('shipmentId', `ship_${Date.now()}`);
  }
}

class OrderFulfillmentWorkflow extends Workflow {
  static override tasks = [
    ValidateOrder,
    CheckInventory,
    CreateShipment,
  ];

  // Default: only 'failed' stops the workflow
  // 'skipped' tasks continue
}

class StrictOrderWorkflow extends Workflow {
  static override settings = {
    // Stop on both failed AND skipped
    workflowBreakpoints: ['failed', 'skipped'],
  };

  static override tasks = [
    ValidateOrder,
    CheckInventory,
    CreateShipment,
  ];
}

async function demonstrateWorkflowErrors() {
  console.log('\n=== Workflow Error Handling ===\n');

  // Case 1: Validation failure stops workflow
  const result1 = await OrderFulfillmentWorkflow.execute({ orderId: -1 });
  console.log('Invalid order:');
  console.log('  Status:', result1.status); // "failed"
  console.log('  Reason:', result1.reason);

  // Case 2: Skip continues in default workflow
  const result2 = await OrderFulfillmentWorkflow.execute({ orderId: 999 });
  console.log('\nOut of stock (default workflow):');
  console.log('  Status:', result2.status); // Depends on implementation
  console.log('  Inventory checked:', result2.context.get('inventoryChecked'));

  // Case 3: Skip stops in strict workflow
  const result3 = await StrictOrderWorkflow.execute({ orderId: 999 });
  console.log('\nOut of stock (strict workflow):');
  console.log('  Status:', result3.status);
  console.log('  Shipment created:', result3.context.get('shipmentId'));

  // Case 4: Successful workflow
  const result4 = await OrderFulfillmentWorkflow.execute({ orderId: 123 });
  console.log('\nSuccessful workflow:');
  console.log('  Status:', result4.status); // "success"
  console.log('  Shipment:', result4.context.get('shipmentId'));
}

// =============================================================================
// Example 7: Custom Error Codes and Structured Errors
// =============================================================================

/**
 * Using structured error codes for API responses.
 */
class CreateUserAccount extends Task {
  static override attributes = {
    email: required(),
    password: required(),
  };

  declare email: string;
  declare password: string;

  override async work() {
    // Check for existing user
    if (await this.emailExists(this.email)) {
      this.fail('Email already registered', {
        code: 'EMAIL_EXISTS',
        field: 'email',
        httpStatus: 409,
      });
      return;
    }

    // Validate password strength
    const passwordErrors = this.validatePassword(this.password);
    if (passwordErrors.length > 0) {
      this.fail('Password does not meet requirements', {
        code: 'WEAK_PASSWORD',
        field: 'password',
        requirements: passwordErrors,
        httpStatus: 400,
      });
      return;
    }

    // Create the user
    this.context.set('user', {
      id: `user_${Date.now()}`,
      email: this.email,
    });
  }

  private async emailExists(email: string): Promise<boolean> {
    return email === 'existing@example.com';
  }

  private validatePassword(password: string): string[] {
    const errors: string[] = [];
    if (password.length < 8) errors.push('Must be at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('Must contain uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Must contain lowercase letter');
    if (!/\d/.test(password)) errors.push('Must contain a number');
    return errors;
  }
}

async function demonstrateStructuredErrors() {
  console.log('\n=== Structured Error Codes ===\n');

  // Existing email
  const result1 = await CreateUserAccount.execute({
    email: 'existing@example.com',
    password: 'Test1234',
  });
  console.log('Existing email:');
  console.log('  Code:', result1.metadata.code);
  console.log('  HTTP Status:', result1.metadata.httpStatus);

  // Weak password
  const result2 = await CreateUserAccount.execute({
    email: 'new@example.com',
    password: '123',
  });
  console.log('\nWeak password:');
  console.log('  Code:', result2.metadata.code);
  console.log('  Requirements:', result2.metadata.requirements);

  // Convert to API response
  function toApiResponse(result: Awaited<ReturnType<typeof CreateUserAccount.execute>>) {
    if (result.success) {
      return {
        status: 201,
        body: { user: result.context.get('user') },
      };
    }
    return {
      status: result.metadata.httpStatus || 500,
      body: {
        error: {
          code: result.metadata.code || 'UNKNOWN_ERROR',
          message: result.reason,
          field: result.metadata.field,
          details: result.metadata.requirements,
        },
      },
    };
  }

  console.log('\nAPI Response:', JSON.stringify(toApiResponse(result2), null, 2));
}

// =============================================================================
// Run All Examples
// =============================================================================

async function main() {
  try {
    await demonstrateSkip();
    await demonstrateFail();
    await demonstrateThrow();
    await demonstrateExecuteStrict();
    await demonstrateResultPatterns();
    await demonstrateWorkflowErrors();
    await demonstrateStructuredErrors();

    console.log('\n✓ All error handling examples completed\n');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Uncomment to run:
// main();

export {
  ProcessPayment,
  ValidateDocument,
  ChargeCard,
  ProcessOrderPayment,
  CreateUserAccount,
  OrderFulfillmentWorkflow,
  StrictOrderWorkflow,
};
