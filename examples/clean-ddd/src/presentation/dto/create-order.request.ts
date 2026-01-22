import { z } from 'zod';

/**
 * Request validation schema for creating an order
 */
export const CreateOrderRequestSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),

  items: z.array(z.object({
    productId: z.string().min(1, 'Product ID is required'),
    quantity: z.number().int().positive('Quantity must be a positive integer'),
  })).min(1, 'Order must have at least one item'),

  shippingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required').default('US'),
  }),

  billingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(1).default('US'),
  }).optional(),

  paymentMethodId: z.string().min(1, 'Payment method is required'),
  notes: z.string().max(500).optional(),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
