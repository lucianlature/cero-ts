import { Money } from '../../../domain/order/value-objects/money.js';

/**
 * Payment result
 */
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Payment Gateway Port
 * Defines the contract for payment processing
 */
export interface PaymentGateway {
  charge(params: {
    amount: Money;
    customerId: string;
    orderId: string;
    paymentMethodId: string;
    description?: string;
  }): Promise<PaymentResult>;

  refund(transactionId: string, amount?: Money): Promise<PaymentResult>;
}

// Symbol for dependency injection
export const PAYMENT_GATEWAY = Symbol('PaymentGateway');
