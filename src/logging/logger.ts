/**
 * Structured Logger for cero-ts
 */

import type { Result, ResultJSON } from '../result.js';
import type { LogFormatter } from './formatters/types.js';
import { LineFormatter } from './formatters/line.js';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry data
 */
export interface LogEntry {
  level: LogLevel;
  timestamp: Date;
  pid: number;
  progname: string;
  result: ResultJSON;
  tags?: string[];
  dryRun?: boolean;
}

/**
 * Logger options
 */
export interface LoggerOptions {
  /** Output stream (default: process.stdout) */
  output?: NodeJS.WritableStream;
  /** Log formatter (default: LineFormatter) */
  formatter?: LogFormatter;
  /** Program name (default: 'cero') */
  progname?: string;
  /** Minimum log level (default: 'info') */
  level?: LogLevel;
  /** Enable/disable logging (default: true) */
  enabled?: boolean;
}

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured logger for cero-ts task execution.
 */
export class Logger {
  private output: NodeJS.WritableStream;
  private formatter: LogFormatter;
  private progname: string;
  private level: LogLevel;
  private enabled: boolean;

  constructor(options: LoggerOptions = {}) {
    this.output = options.output ?? process.stdout;
    this.formatter = options.formatter ?? new LineFormatter();
    this.progname = options.progname ?? 'cero';
    this.level = options.level ?? 'info';
    this.enabled = options.enabled ?? true;
  }

  /**
   * Log a result at the appropriate level
   */
  log(result: Result, options?: { level?: LogLevel; tags?: string[]; dryRun?: boolean }): void {
    if (!this.enabled) return;

    const level = options?.level ?? this.inferLevel(result);
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      timestamp: new Date(),
      pid: process.pid,
      progname: this.progname,
      result: result.toJSON(),
      tags: options?.tags,
      dryRun: options?.dryRun,
    };

    const formatted = this.formatter.format(entry);
    this.output.write(formatted + '\n');
  }

  /**
   * Log at debug level
   */
  debug(message: string | (() => string)): void {
    this.logMessage('debug', message);
  }

  /**
   * Log at info level
   */
  info(message: string | (() => string)): void {
    this.logMessage('info', message);
  }

  /**
   * Log at warn level
   */
  warn(message: string | (() => string)): void {
    this.logMessage('warn', message);
  }

  /**
   * Log at error level
   */
  error(message: string | (() => string)): void {
    this.logMessage('error', message);
  }

  private logMessage(level: LogLevel, message: string | (() => string)): void {
    if (!this.enabled || !this.shouldLog(level)) return;

    const msg = typeof message === 'function' ? message() : message;
    const timestamp = new Date().toISOString();
    const levelChar = level.charAt(0).toUpperCase();

    this.output.write(`${levelChar}, [${timestamp} #${process.pid}] ${level.toUpperCase()} -- ${this.progname}: ${msg}\n`);
  }

  private inferLevel(result: Result): LogLevel {
    if (result.failed) return 'error';
    if (result.skipped) return 'warn';
    return 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.level];
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Set the formatter
   */
  setFormatter(formatter: LogFormatter): void {
    this.formatter = formatter;
  }

  /**
   * Enable logging
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable logging
   */
  disable(): void {
    this.enabled = false;
  }
}

/**
 * Default global logger instance
 */
export const logger = new Logger();

/**
 * Create a new logger instance
 */
export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}
