// ---------------------------------------------------------------------------
// ShippingWorkflow — Pipeline with parallel group + conditional task
// ---------------------------------------------------------------------------
// cero-ts features: Workflow (pipeline mode), parallel task group,
//   conditional execution (if predicate)
// ---------------------------------------------------------------------------

import { Workflow } from 'cero-ts';
import { ValidateAddressTask } from '../tasks/validate-address.task.js';
import { CreateLabelTask } from '../tasks/create-label.task.js';
import { SchedulePickupTask } from '../tasks/schedule-pickup.task.js';
import type { CreateLabelContext } from '../tasks/create-label.task.js';

export class ShippingWorkflow extends Workflow<CreateLabelContext> {
  static override tasks = [
    // Step 1: Validate the address
    ValidateAddressTask,
    // Step 2: Create label + schedule pickup in parallel
    {
      tasks: [CreateLabelTask, SchedulePickupTask],
      strategy: 'parallel' as 'parallel',
    },
  ];
}
