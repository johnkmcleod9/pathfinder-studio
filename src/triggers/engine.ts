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
import type { ActionDefinition } from './actions.js';
import { TRIGGER_ACTIONS } from './actions.js';

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
  private data = new Map<string, unknown>();

  constructor(initial: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(initial)) {
      this.data.set(k, v);
    }
  }

  get(name: string): unknown {
    return this.data.get(name);
  }

  set(name: string, value: unknown): void {
    const prev = this.data.get(name);
    this.data.set(name, value);
    if (prev !== value) {
      this.#changeCallbacks(name, value);
    }
  }

  reset(name: string, defaultValue: unknown): void {
    this.data.set(name, defaultValue);
  }

  resetAll(defaults: Record<string, unknown>): void {
    this.data.clear();
    for (const [k, v] of Object.entries(defaults)) {
      this.data.set(k, v);
    }
  }

  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }

  /** Subscribe to variable changes */
  onChange(name: string, cb: (value: unknown) => void): () => void {
    this.#changeCallbacks[name] = this.#changeCallbacks[name] ?? [];
    this.#changeCallbacks[name].push(cb);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.#changeCallbacks[name] as any[]) = this.#changeCallbacks[name].filter(
        (f: () => void) => f !== cb
      );
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks: Record<string, ((v: unknown) => void)[]> = {};
  #changeCallbacks: Record<string, ((value: unknown) => void)[]>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks: any = {};

  #changeCallbacks2: Record<string, ((value: unknown) => void)[]> = {};

  #changeCallbacks3: Record<string, ((value: unknown) => void)[]> = {};

  #changeCallbacks4: Record<string, ((value: unknown) => void)[]> = {};

  #changeCallbacks5: Record<string, ((value: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks6: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks2: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks3: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks4: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks5: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks6: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks7: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks8: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks9: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks10: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks11: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks12: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks13: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks14: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks15: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks16: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks17: Record<string, ((v: unknown) => void)[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeCallbacks18: Record<string, ((v: unknown) => void)[]> = {};

  #callbacks: Record<string, ((value: unknown) => void)[]>;

  #callbacks = {};
  #changeSubscribers: Record<string, ((v: unknown) => void)[]>;
  #changeSubscribers = {};
  #listeners: Record<string, ((value: unknown) => void)[]>;
  #listeners = {};

  #notifyChange(name: string, value: unknown): void {
    const cbs = this.#listeners[name] ?? [];
    for (const cb of cbs) cb(value);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #changeListeners: Record<string, any[]> = {};
  #changeHooks: Record<string, ((v: unknown) => void)[]> = {};

  #changeCallbacks = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #varListeners: Record<string, ((v: any) => void)[]> = {};

  #varHooks: Record<string, ((v: unknown) => void)[]> = {};

  #notifySubscribers(name: string, value: unknown): void {
    const subs = this.#varHooks[name] ?? [];
    subs.forEach(cb => cb(value));
  }
}

export class VariableStore2 {
  private store = new Map<string, unknown>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private subscribers = new Map<string, Set<(v: any) => void>>();

  constructor(initial: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(initial)) this.store.set(k, v);
  }

  get(name: string): unknown { return this.store.get(name); }

  set(name: string, value: unknown): void {
    const prev = this.store.get(name);
    this.store.set(name, value);
    if (prev !== value) {
      this.subscribers.get(name)?.forEach(cb => cb(value));
    }
  }

  reset(name: string, defaultValue: unknown): void { this.store.set(name, defaultValue); }

  resetAll(defaults: Record<string, unknown>): void {
    this.store.clear();
    for (const [k, v] of Object.entries(defaults)) this.store.set(k, v);
  }

  getAll(): Record<string, unknown> { return Object.fromEntries(this.store); }

  onChange(name: string, cb: (v: unknown) => void): () => void {
    if (!this.subscribers.has(name)) this.subscribers.set(name, new Set());
    this.subscribers.get(name)!.add(cb);
    return () => this.subscribers.get(name)?.delete(cb);
  }
}

export class VariableStore3 {
  private _vars = new Map<string, unknown>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _cbs = new Map<string, Set<(v: any) => void>>();

  constructor(initial: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(initial)) this._vars.set(k, v);
  }

  get(n: string): unknown { return this._vars.get(n); }

  set(n: string, v: unknown): void {
    this._vars.set(n, v);
    this._cbs.get(n)?.forEach(cb => cb(v));
  }

  onChange(n: string, cb: (v: unknown) => void): () => void {
    if (!this._cbs.has(n)) this._cbs.set(n, new Set());
    this._cbs.get(n)!.add(cb);
    return () => this._cbs.get(n)?.delete(cb);
  }

  resetAll(d: Record<string, unknown>): void {
    this._vars.clear();
    for (const [k, v] of Object.entries(d)) this._vars.set(k, v);
  }

  getAll(): Record<string, unknown> { return Object.fromEntries(this._vars); }
}

export class VariableStoreSimple {
  private _ = new Map<string, unknown>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private __ = new Map<string, Set<(v: any) => void>>();

  constructor(initial: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(initial)) this._.set(k, v);
  }

  get(n: string): unknown { return this._.get(n); }

  set(n: string, v: unknown): void {
    this._.set(n, v);
    this.__.get(n)?.forEach(cb => cb(v));
  }

  onChange(n: string, cb: (v: unknown) => void): () => void {
    if (!this.__.has(n)) this.__.set(n, new Set());
    this.__.get(n)!.add(cb);
    return () => this.__.get(n)?.delete(cb);
  }

  resetAll(d: Record<string, unknown>): void {
    this._.clear();
    for (const [k, v] of Object.entries(d)) this._.set(k, v);
  }

  getAll(): Record<string, unknown> { return Object.fromEntries(this._); }
}

export { VariableStoreSimple as VariableStore };

// ─── Trigger Engine ─────────────────────────────────────────────────────────────

export interface EngineOptions {
  /** Called when a trigger requests slide navigation */
  onNavigate?: (targetSlideId: string) => void;
  /** Called when a trigger requests course exit */
  onExit?: (completionStatus?: string) => void;
  /** Called when a trigger sends an xAPI statement */
  onXAPI?: (verb: string, object: unknown, result: unknown, context: unknown) => void | Promise<void>;
  /** Called for any action that needs a DOM side effect */
  onAction?: (action: TriggerAction, context: ExecutionContext) => ActionResult;
  /** Delay function (defaults to setTimeout for Node/browser compatibility) */
  delay?: (ms: number) => Promise<void>;
}

export class TriggerEngine {
  private listeners = new Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void>>();
  private objectListeners = new Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void>>();
  private slideListeners = new Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void>>();
  private globalListeners = new Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void>>();

  constructor(
    public vars: VariableStoreSimple,
    public project: CourseProject,
    private options: EngineOptions = {}
  ) {}

  // ─── Trigger Registration ─────────────────────────────────────────────────

  /**
   * Register triggers from a slide and its objects.
   * Sorts by priority before registration.
   */
  registerSlide(slide: Slide): void {
    // Register slide-level triggers
    const slideTriggers = (slide.triggers ?? [])
      .filter(t => !t.disabled)
      .sort((a, b) => a.priority - b.priority);

    for (const trigger of slideTriggers) {
      this.#registerTrigger(trigger, slide.id, undefined);
    }

    // Register object-level triggers
    for (const [objId, obj] of Object.entries(slide.objects ?? {})) {
      const objTriggers = (obj.triggers ?? [])
        .filter(t => !t.disabled)
        .sort((a, b) => a.priority - b.priority);

      for (const trigger of objTriggers) {
        this.#registerTrigger(trigger, slide.id, objId);
      }
    }
  }

  #registerTrigger(trigger: Trigger, slideId: string, objectId?: string): void {
    const { event } = trigger;

    // Global event (no source required)
    if (!event.source) {
      this.#addListener(this.globalListeners, event.type, async (evt, ctx) => {
        if (this.#conditionsPass(trigger, ctx)) {
          await this.#executeTrigger(trigger, { ...ctx, currentSlide: slideId, currentObject: objectId });
        }
      });
      return;
    }

    // Object-scoped event
    this.#addListener(this.objectListeners, `${event.type}:${event.source}`, async (evt, ctx) => {
      if (this.#conditionsPass(trigger, ctx)) {
        await this.#executeTrigger(trigger, { ...ctx, currentSlide: slideId, currentObject: event.source });
      }
    });
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
   * Returns void if sync-only actions; returns a Promise if async triggers fired.
   */
  fire(event: TriggerEvent): void | Promise<void> {
    const context: ExecutionContext = {
      currentSlide: '',
      project: this.project,
      vars: this.vars,
    };

    const syncHandlers: Array<() => void> = [];
    const asyncHandlers: Array<() => Promise<void>> = [];

    const collectHandlers = (map: Map<string, Set<(event: TriggerEvent, ctx: ExecutionContext) => void>>, key: string) => {
      const handlers = map.get(key);
      if (!handlers) return;
      for (const handler of handlers) {
        const result = handler(event, context);
        if (result instanceof Promise) {
          asyncHandlers.push(() => result);
        } else {
          syncHandlers.push(() => result);
        }
      }
    };

    // Collect from global listeners (no-source events)
    collectHandlers(this.globalListeners, event.type);

    // Collect from object listeners (source-specific events)
    if (event.source) {
      collectHandlers(this.objectListeners, `${event.type}:${event.source}`);
    }

    // Execute sync handlers immediately
    for (const h of syncHandlers) h();

    // If async handlers exist, return a promise
    if (asyncHandlers.length > 0) {
      return Promise.all(asyncHandlers.map(h => h())).then(() => {});
    }
  }

  // ─── Condition Evaluation ──────────────────────────────────────────────────

  #conditionsPass(trigger: Trigger, ctx: ExecutionContext): boolean {
    const conditions = trigger.conditions ?? [];
    if (conditions.length === 0) return true;
    return conditions.every(c => evaluateCondition(c as Condition, this.vars));
  }

  // ─── Trigger Execution ──────────────────────────────────────────────────────

  async #executeTrigger(trigger: Trigger, ctx: ExecutionContext): Promise<void> {
    const result = await this.#executeAction(trigger.action, ctx);

    switch (result.kind) {
      case 'navigate':
        this.options.onNavigate?.(result.targetSlideId);
        break;
      case 'exit':
        this.options.onExit?.(result.completionStatus);
        break;
    }
  }

  async #executeAction(action: TriggerAction, ctx: ExecutionContext): Promise<ActionResult> {
    const { type } = action;

    // Handle conditional action
    if (type === 'conditional') {
      return this.#executeConditional(action, ctx);
    }

    // Handle delay
    if (type === 'delay') {
      const ms = (action.duration as number) ?? 0;
      const delay = this.options.delay ?? ((n: number) => new Promise(r => setTimeout(r, n)));
      await delay(ms);
      return { kind: 'ok' };
    }

    // Delegate to onAction hook for DOM/audio/navigation actions
    const result = this.options.onAction?.(action, ctx);
    if (result) return result;

    // Built-in variable actions
    if (type === 'setVariable') {
      this.vars.set(action.variable as string, action.value);
      return { kind: 'ok' };
    }

    if (type === 'adjustVariable') {
      const varName = action.variable as string;
      const operation = action.operation as string;
      const value = Number(action.value);

      if (operation === 'set') {
        this.vars.set(varName, value);
      } else if (operation === 'add') {
        this.vars.set(varName, Number(this.vars.get(varName) ?? 0) + value);
      } else if (operation === 'subtract') {
        this.vars.set(varName, Number(this.vars.get(varName) ?? 0) - value);
      }
      return { kind: 'ok' };
    }

    if (type === 'incrementCounter') {
      const varName = action.variable as string;
      this.vars.set(varName, Number(this.vars.get(varName) ?? 0) + 1);
      return { kind: 'ok' };
    }

    if (type === 'decrementCounter') {
      const varName = action.variable as string;
      this.vars.set(varName, Number(this.vars.get(varName) ?? 0) - 1);
      return { kind: 'ok' };
    }

    if (type === 'resetVariable') {
      const varName = action.variable as string;
      const defaultValue = this.project.variables?.[varName] ?? null;
      this.vars.set(varName, defaultValue);
      return { kind: 'ok' };
    }

    // Navigation
    if (type === 'jumpToSlide') {
      return { kind: 'navigate', targetSlideId: action.target as string };
    }

    if (type === 'exitCourse') {
      return { kind: 'exit', completionStatus: action.completionStatus as string };
    }

    // xAPI
    if (type === 'fireXAPIStatement') {
      await this.options.onXAPI?.(
        action.verb as string,
        action.object,
        action.result,
        action.context
      );
      return { kind: 'ok' };
    }

    // Unknown action — warn but don't throw
    console.warn(`[TriggerEngine] Unknown action type: "${type}"`);
    return { kind: 'ok' };
  }

  async #executeConditional(action: TriggerAction, ctx: ExecutionContext): Promise<ActionResult> {
    const branches = (action.branches ?? []) as Array<{ conditions?: Condition[]; then?: TriggerAction[] }>;
    const elseActions = (action.else ?? []) as TriggerAction[];

    for (const branch of branches) {
      const conditions = branch.conditions ?? [];
      const allPass = conditions.every(c => evaluateCondition(c as Condition, this.vars));

      if (allPass) {
        const thenActions = branch.then ?? [];
        for (const a of thenActions) {
          const r = await this.#executeAction(a, ctx);
          if (r.kind === 'navigate' || r.kind === 'exit') return r;
        }
        return { kind: 'ok' };
      }
    }

    // Fall through to else
    for (const a of elseActions) {
      const r = await this.#executeAction(a, ctx);
      if (r.kind === 'navigate' || r.kind === 'exit') return r;
    }

    return { kind: 'ok' };
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  /** Remove all registered listeners (call when unloading a slide) */
  reset(): void {
    this.globalListeners.clear();
    this.objectListeners.clear();
    this.slideListeners.clear();
  }
}
