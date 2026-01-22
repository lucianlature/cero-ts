/**
 * Log Formatter Types
 */

import type { LogEntry } from '../logger.js';

/**
 * Log formatter interface
 */
export interface LogFormatter {
  /**
   * Format a log entry into a string
   */
  format(entry: LogEntry): string;
}
