import { z } from 'zod';

/**
 * Request validation schema for cancelling an order
 */
export const CancelOrderRequestSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be 500 characters or less'),
});

export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;
