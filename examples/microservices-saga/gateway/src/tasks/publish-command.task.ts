// ---------------------------------------------------------------------------
// PublishCommandTask — Reusable task to emit a RabbitMQ command
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), Context, callbacks
// DDD Boundary #3: Commit first, publish after — this task is used AFTER
//   the aggregate has been persisted in a previous pipeline step.
// DDD Boundary #4: No transactions across services — we publish a command
//   and await the async signal response via the saga workflow.
// ---------------------------------------------------------------------------

import { Task, required } from 'cero-ts';
import { publishCommand, createServiceLogger } from '@saga/shared';

const log = createServiceLogger('gateway');

export interface PublishCommandContext extends Record<string, unknown> {
  commandRoutingKey?: string;
  commandPayload?: unknown;
}

export class PublishCommandTask extends Task<PublishCommandContext> {
  static override attributes = {
    commandRoutingKey: required({ type: 'string' }),
    commandPayload: required(),
  };

  declare commandRoutingKey: string;
  declare commandPayload: unknown;

  override async work(): Promise<void> {
    publishCommand(this.commandRoutingKey, this.commandPayload);
    log.info('Published command', { commandRoutingKey: this.commandRoutingKey });
  }
}
