/**
 * KeyValue Formatter - key=value pairs for log parsing
 */

import type { LogEntry } from '../logger.js';
import type { LogFormatter } from './types.js';

/**
 * Formats log entries as key=value pairs, suitable for log parsing systems.
 *
 * @example
 * level=info timestamp="2022-07-17T18:43:15.000Z" index=0 chain_id="..." type="Task" status="success"
 */
export class KeyValueFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const { level, timestamp, pid, progname, result, tags, dryRun } = entry;

    const parts: string[] = [
      `level=${level}`,
      `timestamp="${timestamp.toISOString()}"`,
      `pid=${pid}`,
      `progname="${progname}"`,
      `index=${result.index}`,
      `chain_id="${result.chainId}"`,
      `type="${result.type}"`,
      `class="${result.type}"`,
      `task_id="${result.taskId}"`,
      `state="${result.state}"`,
      `status="${result.status}"`,
      `outcome="${result.outcome}"`,
    ];

    if (tags && tags.length > 0) {
      parts.push(`tags="${tags.join(',')}"`);
    }

    if (dryRun !== undefined) {
      parts.push(`dry_run=${dryRun}`);
    }

    for (const [key, value] of Object.entries(result.metadata)) {
      if (value === undefined) continue;
      parts.push(`metadata_${toSnakeCase(key)}=${formatValue(value)}`);
    }

    if (result.reason) {
      parts.push(`reason="${escapeString(result.reason)}"`);
    }

    if (result.retries > 0) {
      parts.push(`retries=${result.retries}`);
    }

    if (result.rolledBack) {
      parts.push(`rolled_back=${result.rolledBack}`);
    }

    return parts.join(' ');
  }
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${escapeString(value)}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) || typeof value === 'object') {
    return `"${escapeString(JSON.stringify(value))}"`;
  }
  return String(value);
}

function escapeString(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
