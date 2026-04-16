/**
 * Trigger Engine — event-driven execution engine for Pathfinder triggers.
 *
 * Architecture:
 * - TriggerEngine: Main class. Holds event listeners, executes triggers.
 * - VariableStore: In-memory reactive variable state.
 * - TriggerExecutor: Handles individual trigger execution (sync + async).
 */

import type { Condition } from './conditions.js';
import { evaluateCondition } from './conditions.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TriggerEvent {
  type: string;
  source?: string;   // object ID that fired the event
  payload?: unknown; // optional event payload
}

export interface TriggerAction {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [param: string]: any;
}

export interface Trigger {
  id: string;
  event: { type: string; source?: string };
  action: TriggerAction;
  conditions?: Condition[];
  priority: number;
  description?: string;
  disabled?: boolean;
}

export interface SlideObject {
  id: string;
  triggers?: Trigger[];
}

export interface Slide {
  id: string;
  triggers?: Trigger[];
  objects?: Record<string, SlideObject>;
}

export interface CourseProject {
  slides: Slide[];
  variables: Record<string, unknown>;
}

export type EventListener = (event: TriggerEvent, context: ExecutionContext) => void | Promise<void>;

export interface ExecutionContext {
  currentSlide: string;
  currentObject?: string;
  project: CourseProject;
  vars: VariableStore;
}

export type ActionResult =
  | { kind: 'ok' }
  | { kind: 'async'; promise: Promise<void> }
  | { kind: 'error'; message: string }
  | { kind: 'navigate'; targetSlideId: string }
  | { kind: 'exit'; completionStatus?: string };

// ─── Variable Store ─────────────────────────────────────────────────────────────

export class VariableStore {
  private _store = new Map<string, unknown>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _subs = new Map<string, Set<(v: any) => void>>();

  constructor(initial: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(initial)) this._store.set(k, v);
  }

  get(name: string): unknown { return this._store.get(name); }

  set(name: string, value: unknown): void {
    this._store.set(name, value);
    this._subs.get(name)?.forEach(cb => cb(value));
  }

  reset(name: string, defaultValue: unknown): void { this._store.set(name, defaultValue); }

  resetAll(defaults: Record<string, unknown>): void {
    this._store.clear();
    for (const [k, v] of Object.entries(defaults)) this._store.set(k, v);
  }

  getAll(): Record<string, unknown> { return Object.fromEntries(this._store); }

  /** Subscribe to variable changes. Returns unsubscribe function. */
  onChange(name: string, cb: (value: unknown) => void): () => void {
    if (!this._subs.has(name)) this._subs.set(name, new Set());
    this._subs.get(name)!.add(cb);
    return () => this._subs.get(name)?.delete(cb);
  }
}

// ─── Trigger Engine ─────────────────────────────────────────────────────────────

export interface EngineOptions {
  /** Called when a trigger requests slide navigation */
  onNavigate?: (targetSlideId: string) => void;
  /** Called when a trigger requests course exit */
  onExit?: (completionStatus?: string) => void;
  /** Called when a trigger sends an xAPI statement */
  onXAPI?: (verb: string, object: unknown, result: unknown, context: unknown) => void | Promise<void>;
  /** Called for any action that needs a DOM/audio/navigation side effect */
  onAction?: (action: TriggerAction, context: ExecutionContext) => ActionResult;
  /** Delay function (defaults to setTimeout for Node/browser compatibility) */
  delay?: (ms: number) => Promise<void>;
}

export class TriggerEngine {
  private _global = new Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void>>();
  private _object = new Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void>>();

  constructor(
    public vars: VariableStore,
    public project: CourseProject,
    private options: EngineOptions = {}
  ) {}

  // ─── Trigger Registration ─────────────────────────────────────────────────

  /**
   * Register all triggers from a slide and its objects.
   * Triggers are sorted by priority before registration.
   */
  registerSlide(slide: Slide): void {
    const slideTriggers = (slide.triggers ?? [])
      .filter(t => !t.disabled)
      .sort((a, b) => a.priority - b.priority);

    for (const trigger of slideTriggers) {
      this.#register(trigger, slide.id, undefined);
    }

    for (const [objId, obj] of Object.entries(slide.objects ?? {})) {
      const objTriggers = (obj.triggers ?? [])
        .filter(t => !t.disabled)
        .sort((a, b) => a.priority - b.priority);

      for (const trigger of objTriggers) {
        this.#register(trigger, slide.id, objId);
      }
    }
  }

  #register(trigger: Trigger, slideId: string, objectId?: string): void {
    const { event } = trigger;
    const handler = async (_evt: TriggerEvent, ctx: ExecutionContext) => {
      if (this.#conditionsPass(trigger, ctx)) {
        const result = await this.#executeTrigger(trigger, { ...ctx, currentSlide: slideId, currentObject: objectId ?? event.source });
        if (result?.kind === 'navigate') this.options.onNavigate?.(result.targetSlideId);
        if (result?.kind === 'exit') this.options.onExit?.(result.completionStatus);
      }
    };

    if (!event.source) {
      this.#addListener(this._global, event.type, handler);
    } else {
      this.#addListener(this._object, `${event.type}:${event.source}`, handler);
    }
  }

  #addListener(
    map: Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void>>,
    key: string,
    handler: (event: TriggerEvent, ctx: ExecutionContext) => void
  ): void {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(handler);
  }

  // ─── Event Dispatch ──────────────────────────────────────────────────────────

  /**
   * Fire an event. All matching triggers are evaluated and executed.
   * Returns void for sync-only; returns a Promise if async triggers fired.
   */
  fire(event: TriggerEvent): void | Promise<void> {
    const context: ExecutionContext = {
      currentSlide: '',
      project: this.project,
      vars: this.vars,
    };

    const syncHandlers: Array<() => void> = [];
    const asyncHandlers: Array<() => Promise<void>> = [];

    const dispatch = (map: Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void | Promise<void>>>, key: string) => {
      for (const handler of map.get(key) ?? []) {
        const result = handler(event, context);
        if (result instanceof Promise) {
          asyncHandlers.push(() => result);
        } else {
          syncHandlers.push(() => { void result; });
        }
      }
    };

    // Global events
    dispatch(this._global, event.type);

    // Object-scoped events
    if (event.source) dispatch(this._object, `${event.type}:${event.source}`);

    // Run sync handlers
    for (const h of syncHandlers) h();

    // If async handlers exist, return a Promise that resolves after all complete
    if (asyncHandlers.length > 0) {
      return (async () => {
        await Promise.all(asyncHandlers.map(h => h()));
      })();
    }
  }

  // ─── Condition Evaluation ──────────────────────────────────────────────────

  #conditionsPass(trigger: Trigger, _ctx: ExecutionContext): boolean {
    const conditions = trigger.conditions ?? [];
    if (conditions.length === 0) return true;
    return conditions.every(c => evaluateCondition(c, this.vars));
  }

  // ─── Trigger Execution ──────────────────────────────────────────────────────

  async #executeTrigger(trigger: Trigger, ctx: ExecutionContext): Promise<ActionResult> {
    return this.#executeAction(trigger.action, ctx);
  }

  async #executeAction(action: TriggerAction, ctx: ExecutionContext): Promise<ActionResult> {
    const { type } = action;

    if (type === 'conditional') {
      return this.#executeConditional(action, ctx);
    }

    if (type === 'delay') {
      const ms = (action.duration as number) ?? 0;
      const delayFn = this.options.delay ?? ((n: number) => new Promise(r => setTimeout(r, n)));
      await delayFn(ms);
      return { kind: 'ok' };
    }

    // Delegate to onAction hook for DOM/audio/navigation side effects
    const result = this.options.onAction?.(action, ctx);
    if (result) return result;

    // ── Built-in variable actions ────────────────────────────────────────
    if (type === 'setVariable') {
      this.vars.set(action.variable as string, action.value);
      return { kind: 'ok' };
    }

    if (type === 'adjustVariable') {
      const varName = action.variable as string;
      const operation = action.operation as string;
      const value = Number(action.value);

      const current = Number(this.vars.get(varName) ?? 0);
      if (operation === 'set') this.vars.set(varName, value);
      else if (operation === 'add') this.vars.set(varName, current + value);
      else if (operation === 'subtract') this.vars.set(varName, current - value);
      return { kind: 'ok' };
    }

    if (type === 'incrementCounter') {
      this.vars.set(action.variable as string, Number(this.vars.get(action.variable as string) ?? 0) + 1);
      return { kind: 'ok' };
    }

    if (type === 'decrementCounter') {
      this.vars.set(action.variable as string, Number(this.vars.get(action.variable as string) ?? 0) - 1);
      return { kind: 'ok' };
    }

    if (type === 'resetVariable') {
      const varName = action.variable as string;
      const defaultValue = this.project.variables?.[varName] ?? null;
      this.vars.set(varName, defaultValue);
      return { kind: 'ok' };
    }

    // ── Navigation ──────────────────────────────────────────────────────
    if (type === 'jumpToSlide') {
      return { kind: 'navigate', targetSlideId: action.target as string };
    }

    if (type === 'exitCourse') {
      return { kind: 'exit', completionStatus: action.completionStatus as string };
    }

    // ── xAPI ────────────────────────────────────────────────────────────
    if (type === 'fireXAPIStatement') {
      await this.options.onXAPI?.(action.verb as string, action.object, action.result, action.context);
      return { kind: 'ok' };
    }

    // Unknown action type — warn and continue
    console.warn(`[TriggerEngine] Unknown action type: "${type}"`);
    return { kind: 'ok' };
  }

  async #executeConditional(action: TriggerAction, ctx: ExecutionContext): Promise<ActionResult> {
    const branches = (action.branches ?? []) as Array<{ conditions?: Condition[]; then?: TriggerAction[] }>;
    const elseActions = (action.else ?? []) as TriggerAction[];

    for (const branch of branches) {
      const conditions = branch.conditions ?? [];
      const allPass = conditions.every(c => evaluateCondition(c, this.vars));

      if (allPass) {
        for (const a of branch.then ?? []) {
          const r = await this.#executeAction(a, ctx);
          if (r.kind === 'navigate') return r;
          if (r.kind === 'exit') return r;
        }
        return { kind: 'ok' };
      }
    }

    for (const a of elseActions) {
      const r = await this.#executeAction(a, ctx);
      if (r.kind === 'navigate') return r;
      if (r.kind === 'exit') return r;
    }

    return { kind: 'ok' };
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  /** Remove all registered listeners (call when unloading a slide) */
  reset(): void {
    this._global.clear();
    this._object.clear();
  }
}
