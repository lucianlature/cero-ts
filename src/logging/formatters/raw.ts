/**
 * Raw Formatter - Minimal output with message content only
 */

import type { LogEntry } from '../logger.js';
import type { LogFormatter } from './types.js';

/**
 * Formats log entries as minimal raw output.
 *
 * @example
 * [Task] AnalyzeMetrics: success
 */
export class RawFormatter implements LogFormatter {
  private includeTimestamp: boolean;

  constructor(options?: { includeTimestamp?: boolean }) {
    this.includeTimestamp = options?.includeTimestamp ?? false;
  }

  format(entry: LogEntry): string {
    const { timestamp, result } = entry;

    const parts: string[] = [];

    if (this.includeTimestamp) {
      parts.push(`[${timestamp.toISOString()}]`);
    }

    parts.push(`[${result.type}]`);
    parts.push(`${result.type}:`);
    parts.push(result.status);

    if (result.reason) {
      parts.push(`- ${result.reason}`);
    }

    return parts.join(' ');
  }
}
