/**
 * Attribute Validation Example
 *
 * This example demonstrates comprehensive attribute validation:
 * - Type coercions
 * - Built-in validators
 * - Custom validators
 * - Nested attributes
 * - Conditional requirements
 */

import { Task, required, optional, configure } from 'cero-ts';

// =============================================================================
// Example 1: Type Coercions
// =============================================================================

class TypeCoercionDemo extends Task {
  static override attributes = {
    // String coercion
    name: required({ type: 'string' }),

    // Integer coercion
    age: required({ type: 'integer' }),

    // Float coercion
    price: required({ type: 'float' }),

    // Boolean coercion
    active: required({ type: 'boolean' }),

    // Date coercion
    birthDate: optional({ type: 'date' }),

    // Datetime coercion
    createdAt: optional({ type: 'datetime' }),

    // Array coercion
    tags: optional({ type: 'array', default: () => [] }),
  };

  declare name: string;
  declare age: number;
  declare price: number;
  declare active: boolean;
  declare birthDate?: Date;
  declare createdAt?: Date;
  declare tags: string[];

  override async work() {
    console.log('Coerced values:');
    console.log('  name:', this.name, typeof this.name);
    console.log('  age:', this.age, typeof this.age);
    console.log('  price:', this.price, typeof this.price);
    console.log('  active:', this.active, typeof this.active);
    console.log('  birthDate:', this.birthDate);
    console.log('  createdAt:', this.createdAt);
    console.log('  tags:', this.tags);
  }
}

async function runCoercionDemo() {
  // Values will be coerced from strings
  const result = await TypeCoercionDemo.execute({
    name: 123, // Will become "123"
    age: '25', // Will become 25
    price: '99.99', // Will become 99.99
    active: 'true', // Will become true
    birthDate: '1990-05-15',
    createdAt: '2026-01-22T10:30:00Z',
    tags: 'a,b,c', // Will become ['a', 'b', 'c']
  });

  if (result.failed) {
    console.error('Coercion failed:', result.metadata.errors);
  }
}

// =============================================================================
// Example 2: Built-in Validators
// =============================================================================

interface UserRegistrationContext {
  userId: string;
}

class UserRegistration extends Task<UserRegistrationContext> {
  static override attributes = {
    // Format validation with regex
    email: required({
      format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    }),

    // Length validation
    username: required({
      length: { min: 3, max: 20 },
      format: /^[a-zA-Z][a-zA-Z0-9_]*$/,
    }),

    // Numeric validation
    age: optional({
      type: 'integer',
      numeric: { min: 13, max: 120 },
    }),

    // Inclusion validation
    role: optional({
      default: 'user',
      inclusion: { in: ['user', 'admin', 'moderator'] },
    }),

    // Exclusion validation
    displayName: optional({
      exclusion: { in: ['admin', 'root', 'system', 'moderator'] },
    }),

    // Presence validation (non-empty)
    bio: optional({
      presence: true, // If provided, must not be empty
    }),

    // Combined validations
    password: required({
      length: { min: 8, max: 128 },
    }),
  };

  declare email: string;
  declare username: string;
  declare age?: number;
  declare role: string;
  declare displayName?: string;
  declare bio?: string;
  declare password: string;

  override async work() {
    // Simulate user creation
    this.context.userId = `user_${Date.now()}`;
    console.log(`Created user: ${this.username} (${this.email})`);
  }
}

async function runValidationDemo() {
  // Valid registration
  console.log('\n--- Valid Registration ---');
  const valid = await UserRegistration.execute({
    email: 'alice@example.com',
    username: 'alice123',
    age: 25,
    password: 'securepass123',
  });

  if (valid.success) {
    console.log('User created:', valid.context.userId);
  }

  // Invalid registration
  console.log('\n--- Invalid Registration ---');
  const invalid = await UserRegistration.execute({
    email: 'not-an-email',
    username: 'ab', // Too short
    age: 10, // Too young
    password: '123', // Too short
    displayName: 'admin', // Reserved
  });

  if (invalid.failed) {
    console.log('Validation errors:');
    const errors = invalid.metadata.errors as { messages: Record<string, string[]> };
    for (const [field, messages] of Object.entries(errors.messages)) {
      console.log(`  ${field}: ${messages.join(', ')}`);
    }
  }
}

// =============================================================================
// Example 3: Custom Validators
// =============================================================================

// Register custom validators
configure((config) => {
  // Credit card validator (Luhn algorithm)
  config.validators.register('creditCard', (value: string) => {
    const cleaned = String(value).replace(/\D/g, '');
    if (cleaned.length < 13 || cleaned.length > 19) {
      return 'must be 13-19 digits';
    }

    let sum = 0;
    let isEven = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0 ? true : 'is not a valid credit card number';
  });

  // Phone number validator
  config.validators.register('phone', (value: string, options?: { country?: string }) => {
    const patterns: Record<string, RegExp> = {
      US: /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/,
      UK: /^\+?44?[-.\s]?[0-9]{10,11}$/,
      DEFAULT: /^\+?[0-9]{10,15}$/,
    };

    const country = options?.country ?? 'DEFAULT';
    const pattern = patterns[country] ?? patterns.DEFAULT;

    return pattern.test(value) ? true : `is not a valid ${country} phone number`;
  });

  // URL validator
  config.validators.register('url', (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return 'is not a valid URL';
    }
  });
});

interface PaymentContext {
  paymentId: string;
}

class ProcessPayment extends Task<PaymentContext> {
  static override attributes = {
    cardNumber: required({ creditCard: true }),
    phone: optional({ phone: { country: 'US' } }),
    callbackUrl: optional({ url: true }),
    amount: required({ type: 'float', numeric: { min: 0.01 } }),
  };

  declare cardNumber: string;
  declare phone?: string;
  declare callbackUrl?: string;
  declare amount: number;

  override async work() {
    this.context.paymentId = `pay_${Date.now()}`;
    console.log(`Processing payment of $${this.amount}`);
  }
}

async function runCustomValidatorDemo() {
  console.log('\n--- Valid Payment ---');
  const valid = await ProcessPayment.execute({
    cardNumber: '4111111111111111', // Valid test card
    phone: '+1-555-123-4567',
    callbackUrl: 'https://example.com/webhook',
    amount: 99.99,
  });

  if (valid.success) {
    console.log('Payment processed:', valid.context.paymentId);
  }

  console.log('\n--- Invalid Payment ---');
  const invalid = await ProcessPayment.execute({
    cardNumber: '1234567890', // Invalid
    phone: 'not-a-phone',
    callbackUrl: 'not-a-url',
    amount: -5,
  });

  if (invalid.failed) {
    console.log('Validation errors:');
    const errors = invalid.metadata.errors as { messages: Record<string, string[]> };
    for (const [field, messages] of Object.entries(errors.messages)) {
      console.log(`  ${field}: ${messages.join(', ')}`);
    }
  }
}

// =============================================================================
// Example 4: Nested Attributes
// =============================================================================

interface ServerConfigContext {
  serverId: string;
}

class ConfigureServer extends Task<ServerConfigContext> {
  static override attributes = {
    serverId: required(),

    // Required nested object
    network: required({
      nested: {
        hostname: required({ format: /^[a-zA-Z0-9.-]+$/ }),
        port: required({ type: 'integer', numeric: { min: 1, max: 65535 } }),
        protocol: optional({ default: 'https', inclusion: { in: ['http', 'https'] } }),
      },
    }),

    // Optional nested object
    ssl: optional({
      nested: {
        certPath: required(),
        keyPath: required(),
        caPath: optional(),
      },
    }),

    // Deeply nested
    monitoring: optional({
      nested: {
        enabled: optional({ type: 'boolean', default: true }),
        alerting: optional({
          nested: {
            email: optional({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
            threshold: optional({ type: 'integer', default: 80 }),
          },
        }),
      },
    }),
  };

  declare serverId: string;
  declare network: { hostname: string; port: number; protocol: string };
  declare ssl?: { certPath: string; keyPath: string; caPath?: string };
  declare monitoring?: {
    enabled: boolean;
    alerting?: { email?: string; threshold: number };
  };

  override async work() {
    console.log('Server configuration:');
    console.log('  ID:', this.serverId);
    console.log('  Network:', this.network);
    console.log('  SSL:', this.ssl);
    console.log('  Monitoring:', this.monitoring);

    this.context.serverId = this.serverId;
  }
}

async function runNestedAttributesDemo() {
  console.log('\n--- Full Configuration ---');
  const full = await ConfigureServer.execute({
    serverId: 'srv-001',
    network: {
      hostname: 'api.example.com',
      port: 443,
    },
    ssl: {
      certPath: '/etc/ssl/cert.pem',
      keyPath: '/etc/ssl/key.pem',
    },
    monitoring: {
      enabled: true,
      alerting: {
        email: 'ops@example.com',
        threshold: 90,
      },
    },
  });

  if (full.success) {
    console.log('Configuration saved');
  }

  console.log('\n--- Minimal Configuration ---');
  const minimal = await ConfigureServer.execute({
    serverId: 'srv-002',
    network: {
      hostname: 'internal.example.com',
      port: 8080,
    },
  });

  if (minimal.success) {
    console.log('Configuration saved');
  }

  console.log('\n--- Invalid Nested Configuration ---');
  const invalid = await ConfigureServer.execute({
    serverId: 'srv-003',
    network: {
      hostname: 'api.example.com',
      port: 99999, // Invalid port
    },
    ssl: {
      certPath: '/etc/ssl/cert.pem',
      // Missing keyPath
    },
  });

  if (invalid.failed) {
    console.log('Validation errors:', invalid.metadata.errors);
  }
}

// =============================================================================
// Example 5: Conditional Requirements
// =============================================================================

interface SubscriptionContext {
  subscriptionId: string;
}

class CreateSubscription extends Task<SubscriptionContext> {
  static override attributes = {
    plan: required({ inclusion: { in: ['free', 'basic', 'premium', 'enterprise'] } }),

    // Payment required only for paid plans
    paymentMethodId: optional({
      if: (task) => task.context.get('plan') !== 'free',
    }),

    // Billing address required for enterprise
    billingAddress: optional({
      if: (task) => task.context.get('plan') === 'enterprise',
      presence: true,
    }),

    // Coupon only for premium and enterprise
    couponCode: optional({
      if: (task) => ['premium', 'enterprise'].includes(task.context.get('plan')),
      format: /^[A-Z0-9]{6,10}$/,
    }),
  };

  declare plan: string;
  declare paymentMethodId?: string;
  declare billingAddress?: string;
  declare couponCode?: string;

  override async work() {
    console.log(`Creating ${this.plan} subscription`);
    this.context.subscriptionId = `sub_${Date.now()}`;
  }
}

async function runConditionalDemo() {
  console.log('\n--- Free Plan (no payment needed) ---');
  const free = await CreateSubscription.execute({ plan: 'free' });
  console.log('Result:', free.success ? 'Success' : `Failed: ${free.reason}`);

  console.log('\n--- Premium Plan (payment required) ---');
  const premiumNoPayment = await CreateSubscription.execute({ plan: 'premium' });
  console.log('Without payment:', premiumNoPayment.success ? 'Success' : 'Failed (expected)');

  const premiumWithPayment = await CreateSubscription.execute({
    plan: 'premium',
    paymentMethodId: 'pm_123',
    couponCode: 'SAVE20PCT',
  });
  console.log('With payment:', premiumWithPayment.success ? 'Success' : 'Failed');

  console.log('\n--- Enterprise Plan (payment + billing required) ---');
  const enterprise = await CreateSubscription.execute({
    plan: 'enterprise',
    paymentMethodId: 'pm_456',
    billingAddress: '123 Business St, Suite 100',
  });
  console.log('Result:', enterprise.success ? 'Success' : `Failed: ${enterprise.reason}`);
}

// =============================================================================
// Run all examples
// =============================================================================

async function main() {
  console.log('=== Example 1: Type Coercions ===');
  await runCoercionDemo();

  console.log('\n=== Example 2: Built-in Validators ===');
  await runValidationDemo();

  console.log('\n=== Example 3: Custom Validators ===');
  await runCustomValidatorDemo();

  console.log('\n=== Example 4: Nested Attributes ===');
  await runNestedAttributesDemo();

  console.log('\n=== Example 5: Conditional Requirements ===');
  await runConditionalDemo();
}

main().catch(console.error);
