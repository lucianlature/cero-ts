// ---------------------------------------------------------------------------
// InventoryWorkflow — Pipeline: check stock → reserve
// ---------------------------------------------------------------------------
// cero-ts features: Workflow (pipeline mode), sequential tasks
// ---------------------------------------------------------------------------

import { Workflow } from 'cero-ts';
import { CheckStockTask } from '../tasks/check-stock.task.js';
import { ReserveStockTask } from '../tasks/reserve-stock.task.js';
import type { ReserveStockContext } from '../tasks/reserve-stock.task.js';

export class InventoryWorkflow extends Workflow<ReserveStockContext> {
  static override tasks = [CheckStockTask, ReserveStockTask];
}
