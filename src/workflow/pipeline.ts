/**
 * Workflow Pipeline - Sequential and parallel task composition
 */

import { Task, type TaskClass, type TaskSettings } from '../task.js';
import { Context, createContext } from '../context.js';
import { Chain, createChain } from '../chain.js';
import { Result, createResult, type Status } from '../result.js';
import { FailFault, SkipFault } from '../interruptions/faults.js';

/**
 * Task entry in a workflow
 */
export interface TaskEntry<T extends Record<string, unknown> = Record<string, unknown>> {
  task: TaskClass<T>;
  if?: string | ((workflow: Workflow) => boolean);
  unless?: string | ((workflow: Workflow) => boolean);
  breakpoints?: Status[];
}

/**
 * Task group entry in a workflow
 */
export interface TaskGroupEntry<T extends Record<string, unknown> = Record<string, unknown>> {
  tasks: TaskClass<T>[];
  if?: string | ((workflow: Workflow) => boolean);
  unless?: string | ((workflow: Workflow) => boolean);
  breakpoints?: Status[];
  strategy?: 'sequential' | 'parallel';
}

/**
 * Workflow task definition (can be class, entry, or group)
 */
export type WorkflowTaskDefinition<T extends Record<string, unknown> = Record<string, unknown>> =
  | TaskClass<T>
  | TaskEntry<T>
  | TaskGroupEntry<T>;

/**
 * Check if definition is a task entry
 */
function isTaskEntry<T extends Record<string, unknown>>(
  def: WorkflowTaskDefinition<T>
): def is TaskEntry<T> {
  return typeof def === 'object' && 'task' in def;
}

/**
 * Check if definition is a task group entry
 */
function isTaskGroupEntry<T extends Record<string, unknown>>(
  def: WorkflowTaskDefinition<T>
): def is TaskGroupEntry<T> {
  return typeof def === 'object' && 'tasks' in def;
}

/**
 * Workflow class for composing multiple tasks into pipelines.
 *
 * @example
 * ```typescript
 * class OnboardingWorkflow extends Workflow {
 *   static tasks = [
 *     CreateUserProfile,
 *     SetupAccountPreferences,
 *     { task: SendWelcomeEmail, if: 'emailConfigured' },
 *     { tasks: [SendWelcomeSms, CreateDashboard], breakpoints: ['skipped'] },
 *   ];
 *
 *   emailConfigured() {
 *     return this.context.user.emailVerified;
 *   }
 * }
 * ```
 */
export abstract class Workflow<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> extends Task<TContext> {
  /** Task definitions for this workflow */
  static tasks: WorkflowTaskDefinition[] = [];

  /** Results from individual tasks */
  private _taskResults: Result[] = [];

  /** The task that caused a failure (if any) */
  private _causedFailure?: Result;

  /** The task that threw a failure (if any) */
  private _threwFailure?: Result;

  /**
   * Workflow work method - executes all tasks in sequence.
   * Do not override this in subclasses.
   */
  async work(): Promise<void> {
    const workflowClass = this.constructor as typeof Workflow;
    const taskDefs = workflowClass.tasks;

    const defaultBreakpoints = this.settings.workflowBreakpoints ??
      this.settings.breakpoints ?? ['failed'];

    for (const def of taskDefs) {
      const result = await this.executeTaskDefinition(def, defaultBreakpoints);

      if (result) {
        this._taskResults.push(result);

        // Check breakpoints
        const breakpoints = this.getBreakpoints(def, defaultBreakpoints);
        if (breakpoints.includes(result.status)) {
          this._causedFailure = result;
          this._threwFailure = result;

          if (result.status === 'skipped') {
            this.skip(result.reason, { ...result.metadata });
          } else {
            this.fail(result.reason, { ...result.metadata });
          }
        }
      }
    }
  }

  /**
   * Execute a single task definition
   */
  private async executeTaskDefinition(
    def: WorkflowTaskDefinition,
    defaultBreakpoints: Status[]
  ): Promise<Result | null> {
    // Check conditions
    if (isTaskEntry(def) || isTaskGroupEntry(def)) {
      if (def.if !== undefined) {
        const shouldRun = this.evaluateCondition(def.if);
        if (!shouldRun) return null;
      }
      if (def.unless !== undefined) {
        const shouldSkip = this.evaluateCondition(def.unless);
        if (shouldSkip) return null;
      }
    }

    if (isTaskGroupEntry(def)) {
      return this.executeTaskGroup(def, defaultBreakpoints);
    }

    const TaskClass = isTaskEntry(def) ? def.task : def;
    return TaskClass.execute({}, { context: this.context, chain: this.chain });
  }

  /**
   * Execute a task group
   */
  private async executeTaskGroup(
    group: TaskGroupEntry,
    defaultBreakpoints: Status[]
  ): Promise<Result | null> {
    const strategy = group.strategy ?? 'sequential';
    const breakpoints = group.breakpoints ?? defaultBreakpoints;

    if (strategy === 'parallel') {
      return this.executeParallel(group.tasks, breakpoints);
    }

    return this.executeSequential(group.tasks, breakpoints);
  }

  /**
   * Execute tasks sequentially
   */
  private async executeSequential(
    tasks: TaskClass[],
    breakpoints: Status[]
  ): Promise<Result | null> {
    let lastResult: Result | null = null;

    for (const TaskClass of tasks) {
      const result = await TaskClass.execute({}, { context: this.context, chain: this.chain });
      this._taskResults.push(result);
      lastResult = result;

      if (breakpoints.includes(result.status)) {
        return result;
      }
    }

    return lastResult;
  }

  /**
   * Execute tasks in parallel
   */
  private async executeParallel(
    tasks: TaskClass[],
    breakpoints: Status[]
  ): Promise<Result | null> {
    // Create a snapshot of context for parallel execution (read-only)
    const contextSnapshot = this.context.toObject();

    const results = await Promise.all(
      tasks.map(async (TaskClass) => {
        // Each parallel task gets a clone of context
        const taskContext = createContext(contextSnapshot);
        return TaskClass.execute({}, { context: taskContext, chain: this.chain });
      })
    );

    this._taskResults.push(...results);

    // Check for failures
    const failedResult = results.find((r) => breakpoints.includes(r.status));
    if (failedResult) {
      return failedResult;
    }

    // Return last result
    return results[results.length - 1] ?? null;
  }

  /**
   * Evaluate a condition
   */
  private evaluateCondition(
    condition: string | ((workflow: Workflow) => boolean)
  ): boolean {
    if (typeof condition === 'function') {
      return condition(this);
    }
    const method = (this as Record<string, unknown>)[condition];
    if (typeof method === 'function') {
      return !!(method as () => boolean).call(this);
    }
    return !!method;
  }

  /**
   * Get breakpoints for a definition
   */
  private getBreakpoints(
    def: WorkflowTaskDefinition,
    defaultBreakpoints: Status[]
  ): Status[] {
    if (isTaskEntry(def) || isTaskGroupEntry(def)) {
      return def.breakpoints ?? defaultBreakpoints;
    }
    return defaultBreakpoints;
  }

  /**
   * Get all task results from this workflow
   */
  get taskResults(): readonly Result[] {
    return this._taskResults;
  }

  /**
   * Get the result that caused a failure
   */
  get causedFailure(): Result | undefined {
    return this._causedFailure;
  }

  /**
   * Get the result that threw a failure
   */
  get threwFailure(): Result | undefined {
    return this._threwFailure;
  }
}

/**
 * Define a workflow using a functional style
 */
export function defineWorkflow<TContext extends Record<string, unknown>>(config: {
  name: string;
  tasks: WorkflowTaskDefinition<TContext>[];
  settings?: TaskSettings;
}): TaskClass<TContext> {
  const { name, tasks, settings } = config;

  // Create a dynamic class
  const WorkflowClass = class extends Workflow<TContext> {
    static override tasks = tasks;
    static override settings = settings;
  };

  // Set the name
  Object.defineProperty(WorkflowClass, 'name', { value: name });

  return WorkflowClass as unknown as TaskClass<TContext>;
}
