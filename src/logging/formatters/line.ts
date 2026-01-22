/**
 * Line Formatter - Traditional single-line log format
 */

import type { LogEntry } from '../logger.js';
import type { LogFormatter } from './types.js';

/**
 * Formats log entries as traditional single-line format.
 *
 * @example
 * I, [2022-07-17T18:43:15.000000Z #3784] INFO -- cmdx: index=0 chain_id="..." type="Task" class="AnalyzeMetrics" state="complete" status="success"
 */
export class LineFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const { level, timestamp, pid, progname, result, tags, dryRun } = entry;
    const levelChar = level.charAt(0).toUpperCase();
    const levelUpper = level.toUpperCase();
    const ts = timestamp.toISOString();

    const parts: string[] = [
      `index=${result.index}`,
      `chain_id="${result.chainId}"`,
      `type="${result.type}"`,
    ];

    if (tags && tags.length > 0) {
      parts.push(`tags=[${tags.map(t => `"${t}"`).join(', ')}]`);
    }

    parts.push(`class="${result.type}"`);

    if (dryRun !== undefined) {
      parts.push(`dry_run=${dryRun}`);
    }

    parts.push(`id="${result.taskId}"`);
    parts.push(`state="${result.state}"`);
    parts.push(`status="${result.status}"`);
    parts.push(`outcome="${result.outcome}"`);

    if (Object.keys(result.metadata).length > 0) {
      parts.push(`metadata=${formatMetadata(result.metadata)}`);
    }

    if (result.reason) {
      parts.push(`reason="${escapeString(result.reason)}"`);
    }

    if (result.rolledBack) {
      parts.push(`rolled_back=${result.rolledBack}`);
    }

    const message = parts.join(' ');
    return `${levelChar}, [${ts} #${pid}] ${levelUpper} -- ${progname}: ${message}`;
  }
}

function formatMetadata(metadata: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    parts.push(`${key}: ${formatValue(value)}`);
  }
  return `{${parts.join(', ')}}`;
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${escapeString(value)}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (typeof value === 'object') return formatMetadata(value as Record<string, unknown>);
  return String(value);
}

function escapeString(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
