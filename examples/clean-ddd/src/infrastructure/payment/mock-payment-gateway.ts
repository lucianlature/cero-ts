import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../domain/order/value-objects/money.js';
import { PaymentGateway, PaymentResult } from '../../application/ports/services/payment-gateway.js';

/**
 * Mock Payment Gateway
 * Simulates payment processing for demonstration
 */
export class MockPaymentGateway implements PaymentGateway {
  // Simulate specific card behaviors
  private readonly declinedCards = new Set(['pm_declined', 'pm_insufficient_funds']);
  private readonly expiredCards = new Set(['pm_expired']);

  async charge(params: {
    amount: Money;
    customerId: string;
    orderId: string;
    paymentMethodId: string;
    description?: string;
  }): Promise<PaymentResult> {
    // Simulate network delay
    await this.simulateDelay();

    // Check for declined cards
    if (this.declinedCards.has(params.paymentMethodId)) {
      return {
        success: false,
        errorCode: 'card_declined',
        errorMessage: 'Your card was declined. Please try a different payment method.',
      };
    }

    // Check for expired cards
    if (this.expiredCards.has(params.paymentMethodId)) {
      return {
        success: false,
        errorCode: 'expired_card',
        errorMessage: 'Your card has expired. Please use a different card.',
      };
    }

    // Simulate random failures (5% chance)
    if (Math.random() < 0.05) {
      return {
        success: false,
        errorCode: 'processing_error',
        errorMessage: 'An error occurred while processing your payment. Please try again.',
      };
    }

    // Success
    console.log(`[PaymentGateway] Charged ${params.amount.getCurrency()} ${params.amount.getAmount()} for order ${params.orderId}`);

    return {
      success: true,
      transactionId: `txn_${uuidv4()}`,
    };
  }

  async refund(transactionId: string, amount?: Money): Promise<PaymentResult> {
    await this.simulateDelay();

    console.log(`[PaymentGateway] Refunded transaction ${transactionId}${amount ? ` for ${amount.getCurrency()} ${amount.getAmount()}` : ''}`);

    return {
      success: true,
      transactionId: `ref_${uuidv4()}`,
    };
  }

  private simulateDelay(): Promise<void> {
    const delay = Math.floor(Math.random() * 100) + 50; // 50-150ms
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}
