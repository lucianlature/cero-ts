// ---------------------------------------------------------------------------
// cero-ts configuration — global middleware, callbacks, breakpoints
// ---------------------------------------------------------------------------

import { configure } from 'cero-ts';
import { createServiceLogger } from '@saga/shared';

const log = createServiceLogger('gateway');
import { RuntimeMiddleware, CorrelateMiddleware } from 'cero-ts/middleware';
import { RabbitAuditMiddleware } from '@saga/shared';

export function configureCeroTs(): void {
  configure((config) => {
    // Breakpoints: stop workflow on failure
    config.taskBreakpoints = ['failed'];
    config.rollbackOn = ['failed'];

    // Global middleware
    config.middlewares.register(RuntimeMiddleware);
    config.middlewares.register(CorrelateMiddleware);
    config.middlewares.register([RabbitAuditMiddleware, { service: 'gateway' }]);

    // Global error handler
    config.exceptionHandler = (_task, error) => {
      log.error('Unhandled exception', { error });
    };

    // Global failure callback for logging
    config.callbacks.register('onFailed', (task) => {
      log.warn('Task failed', { taskName: task.constructor.name, chainId: task.chain.id });
    });
  });
}
