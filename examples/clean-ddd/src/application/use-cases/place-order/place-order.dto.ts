/**
 * Input DTO for PlaceOrder use case
 */
export interface PlaceOrderInput {
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethodId: string;
  notes?: string;
}

/**
 * Output DTO for PlaceOrder use case
 */
export interface PlaceOrderOutput {
  orderId: string;
  status: string;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  itemCount: number;
}
