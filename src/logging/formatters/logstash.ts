/**
 * Logstash Formatter - JSON with @version/@timestamp for ELK stack
 */

import type { LogEntry } from '../logger.js';
import type { LogFormatter } from './types.js';

/**
 * Formats log entries as Logstash-compatible JSON for ELK stack integration.
 *
 * @example
 * {"@timestamp":"2022-07-17T18:43:15.000Z","@version":"1","level":"info","index":0,"status":"success"}
 */
export class LogstashFormatter implements LogFormatter {
  private version: string;

  constructor(options?: { version?: string }) {
    this.version = options?.version ?? '1';
  }

  format(entry: LogEntry): string {
    const { level, timestamp, pid, progname, result, tags, dryRun } = entry;

    const obj: Record<string, unknown> = {
      '@timestamp': timestamp.toISOString(),
      '@version': this.version,
      level,
      pid,
      progname,
      index: result.index,
      chain_id: result.chainId,
      type: result.type,
      class: result.type,
      task_id: result.taskId,
      state: result.state,
      status: result.status,
      outcome: result.outcome,
    };

    if (tags && tags.length > 0) {
      obj.tags = tags;
    }

    if (dryRun !== undefined) {
      obj.dry_run = dryRun;
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
      obj.rolled_back = result.rolledBack;
    }

    return JSON.stringify(obj);
  }
}
