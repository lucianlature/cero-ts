/**
 * JSON Formatter - Compact JSON log format
 */

import type { LogEntry } from '../logger.js';
import type { LogFormatter } from './types.js';

/**
 * Formats log entries as compact JSON.
 *
 * @example
 * {"level":"info","timestamp":"2022-07-17T18:43:15.000Z","index":0,"chainId":"...","type":"Task","status":"success"}
 */
export class JsonFormatter implements LogFormatter {
  private pretty: boolean;

  constructor(options?: { pretty?: boolean }) {
    this.pretty = options?.pretty ?? false;
  }

  format(entry: LogEntry): string {
    const { level, timestamp, pid, progname, result, tags, dryRun } = entry;

    const obj: Record<string, unknown> = {
      level,
      timestamp: timestamp.toISOString(),
      pid,
      progname,
      index: result.index,
      chainId: result.chainId,
      type: result.type,
      class: result.type,
      taskId: result.taskId,
      state: result.state,
      status: result.status,
      outcome: result.outcome,
    };

    if (tags && tags.length > 0) {
      obj.tags = tags;
    }

    if (dryRun !== undefined) {
      obj.dryRun = dryRun;
    }

    if (Object.keys(result.metadata).length > 0) {
      obj.metadata = result.metadata;
    }

    if (result.reason) {
      obj.reason = result.reason;
    }

    if (result.retries > 0) {
      obj.retries = result.retries;
    }

    if (result.rolledBack) {
      obj.rolledBack = result.rolledBack;
    }

    return JSON.stringify(obj, null, this.pretty ? 2 : undefined);
  }
}
