// ---------------------------------------------------------------------------
// PaymentWorkflow — Pipeline workflow for payment processing
// ---------------------------------------------------------------------------
// cero-ts features: Workflow (pipeline mode)
// ---------------------------------------------------------------------------

import { Workflow } from 'cero-ts';
import { CapturePaymentTask } from '../tasks/capture-payment.task.js';
import type { CapturePaymentContext } from '../tasks/capture-payment.task.js';

export class PaymentWorkflow extends Workflow<CapturePaymentContext> {
  static override tasks = [CapturePaymentTask];
}
