import type { RuntimeVariable } from './types.js';

type Subscriber = (newVal: unknown, oldVal: unknown) => void;

/**
 * Reactive variable store for the runtime engine.
 * Mirrors the design of the save/load variable store but is purely
 * in-memory and designed for the browser runtime.
 */
export class VariableStore {
  private state = new Map<string, unknown>();
  private subscribers = new Map<string, Subscriber[]>();
  private definitions: Record<string, RuntimeVariable>;

  constructor(variables: Record<string, RuntimeVariable> = {}) {
    this.definitions = variables;
    for (const [name, def] of Object.entries(variables)) {
      this.state.set(name, def.default);
    }
  }

  get(name: string): unknown {
    return this.state.get(name) ?? null;
  }

  set(name: string, value: unknown): void {
    const old = this.state.get(name);
    this.state.set(name, value);
    this.notify(name, value, old);
  }

  /**
   * Adjust a numeric variable by an operation.
   */
  adjust(variable: string, operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'set' | 'toggle', value: number): void {
    const current = (this.state.get(variable) as number) ?? 0;
    let newVal: unknown;
    switch (operation) {
      case 'add':      newVal = current + value; break;
      case 'subtract': newVal = current - value; break;
      case 'multiply': newVal = current * value; break;
      case 'divide':   newVal = value !== 0 ? current / value : current; break;
      case 'toggle':  newVal = !current; break;
      default:        newVal = value; // 'set'
    }
    this.set(variable, newVal);
  }

  onChange(name: string, fn: Subscriber): void {
    if (!this.subscribers.has(name)) this.subscribers.set(name, []);
    this.subscribers.get(name)!.push(fn);
  }

  private notify(name: string, newVal: unknown, oldVal: unknown): void {
    for (const fn of this.subscribers.get(name) ?? []) {
      try { fn(newVal, oldVal); } catch { /* ignore subscriber errors */ }
    }
  }

  getAllVariableNames(): string[] {
    return Array.from(this.state.keys());
  }

  getDefinition(name: string): RuntimeVariable | undefined {
    return this.definitions[name];
  }

  toJSON(): Record<string, unknown> {
    return Object.fromEntries(this.state);
  }

  fromJSON(obj: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(obj)) {
      this.state.set(k, v);
    }
  }
}
