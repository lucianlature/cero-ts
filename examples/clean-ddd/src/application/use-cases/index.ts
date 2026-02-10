export { PlaceOrderUseCase, PlaceOrderInput, PlaceOrderOutput } from './place-order/index.js';
export { GetOrderUseCase } from './get-order/index.js';
export { CancelOrderUseCase } from './cancel-order/index.js';

// Workflows
export { ProcessOrderWorkflow } from '../workflows/process-order.workflow.js';

// Interactive Workflows (Temporal-inspired)
export {
  OrderFulfillmentWorkflow,
  startFulfillment,
  getFulfillmentHandle,
  orderShippedSignal,
  orderDeliveredSignal,
  cancelFulfillmentSignal,
  fulfillmentStatusQuery,
  canCancelQuery,
} from '../workflows/order-fulfillment.workflow.js';
