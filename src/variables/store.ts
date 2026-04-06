/**
 * Variable Store — scoped variable state management.
 *
 * Scope levels (narrowest → widest):
 *   local  → per-object instance
 *   slide  → one slide
 *   scene  → one scene
 *   project → entire course
 *
 * Initialization order:
 *   1. Project vars (course start)
 *   2. Scene vars (scene first entered)
 *   3. Slide vars (slide first entered)
 *   4. Local vars (object created)
 *
 * Lookup order (narrowest wins):
 *   get(name) → local → slide → scene → project → system
 */

import type { VariableType } from './types.js';
import { coerceToType, validateValue, getTypeDefinition } from './types.js';
import { getSystemVariable, isSystemVariable } from './system-variables.js';

export type Scope = 'project' | 'scene' | 'slide' | 'local';

export interface VariableDef {
  name: string;
  type: VariableType;
  scope: Scope;
  defaultValue: unknown;
  description?: string;
  tags?: string[];
  exportToLMS?: boolean;
  lmsKey?: string;
}

export interface VariableOptions {
  scope?: Scope;
  description?: string;
  tags?: string[];
  exportToLMS?: boolean;
  lmsKey?: string;
}

export type VariableChangeListener = (name: string, oldValue: unknown, newValue: unknown, scope: Scope) => void;

interface ScopedStore {
  get(name: string): unknown;
  set(name: string, value: unknown): void;
  has(name: string): boolean;
  delete(name: string): void;
  keys(): string[];
}

export class VariableStore {
  private project = new Map<string, unknown>();
  private scene   = new Map<string, unknown>();
  private slide  = new Map<string, unknown>();
  private local  = new Map<string, unknown>();

  private definitions = new Map<string, VariableDef>();
  private listeners: VariableChangeListener[] = [];

  constructor(initial?: Record<string, { value: unknown; def?: VariableDef }>) {
    if (initial) {
      for (const [name, { value, def }] of Object.entries(initial)) {
        this.project.set(name, value);
        if (def) this.definitions.set(name, def);
      }
    }
  }

  // ─── Core get/set ─────────────────────────────────────────────────────────

  /** Get a variable value. Looks up scope chain: local → slide → scene → project. */
  get(name: string): unknown {
    if (this.local.has(name))  return this.local.get(name);
    if (this.slide.has(name))  return this.slide.get(name);
    if (this.scene.has(name))  return this.scene.get(name);
    if (this.project.has(name)) return this.project.get(name);
    return undefined;
  }

  /** Set a variable. Uses the definition's scope, or defaults to project. */
  set(name: string, value: unknown): { success: boolean; warning?: string } {
    const def = this.definitions.get(name);
    const scope = def?.scope ?? 'project';
    const type = def?.type ?? 'text';

    const { value: coerced, warning } = coerceToType(type, value);
    const { valid, error } = validateValue(type, coerced);

    if (!valid) {
      console.warn(`[VariableStore] Cannot set "${name}": ${error}`);
      return { success: false, warning: error };
    }

    const old = this.get(name);
    this.getStore(scope).set(name, coerced);

    if (old !== coerced) {
      this.notifyListeners(name, old, coerced, scope);
    }

    return { success: true, warning };
  }

  /** Define a new variable with a type and scope. */
  define(name: string, type: VariableType, options: VariableOptions = {}): void {
    const scope = options.scope ?? 'project';
    const def: VariableDef = {
      name,
      type,
      scope,
      defaultValue: getTypeDefinition(type).defaultValue,
      description: options.description,
      tags: options.tags,
      exportToLMS: options.exportToLMS,
      lmsKey: options.lmsKey,
    };
    this.definitions.set(name, def);
    if (!this.getStore(scope).has(name)) {
      this.getStore(scope).set(name, def.defaultValue);
    }
  }

  /** Check if a variable is defined. */
  has(name: string): boolean {
    return this.definitions.has(name) || this.project.has(name);
  }

  /** Get a variable definition. */
  getDef(name: string): VariableDef | undefined {
    return this.definitions.get(name);
  }

  /** Delete a variable from all scopes. */
  delete(name: string): void {
    this.project.delete(name);
    this.scene.delete(name);
    this.slide.delete(name);
    this.local.delete(name);
    this.definitions.delete(name);
  }

  // ─── Scope management ─────────────────────────────────────────────────────

  /** Initialize scene-scoped variables when entering a scene. */
  initScene(vars: Record<string, unknown>): void {
    this.scene.clear();
    for (const [k, v] of Object.entries(vars)) this.scene.set(k, v);
  }

  /** Initialize slide-scoped variables when entering a slide. */
  initSlide(vars: Record<string, unknown>): void {
    this.slide.clear();
    for (const [k, v] of Object.entries(vars)) this.slide.set(k, v);
  }

  /** Clear slide-scoped variables. */
  clearSlide(): void {
    this.slide.clear();
  }

  /** Clear local-scoped variables (e.g. when an object is destroyed). */
  clearLocal(): void {
    this.local.clear();
  }

  /** Reset all slide/scene/local vars to defaults. */
  resetToDefaults(): void {
    this.slide.clear();
    this.scene.clear();
    this.local.clear();
    for (const [name, def] of this.definitions) {
      this.getStore(def.scope).set(name, def.defaultValue);
    }
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  /** Export all project-scoped variables as JSON. */
  exportProject(): string {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.project) obj[k] = v;
    return JSON.stringify(obj);
  }

  /** Import project variables from JSON (for LMS suspend data). */
  importProject(json: string): { warnings: string[] } {
    const warnings: string[] = [];
    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      for (const [name, value] of Object.entries(data)) {
        const { success, warning } = this.set(name, value);
        if (warning) warnings.push(warning);
        if (!success) warnings.push(`Failed to import "${name}"`);
      }
    } catch (e) {
      warnings.push(`Invalid JSON: ${e}`);
    }
    return { warnings };
  }

  // ─── Listeners ───────────────────────────────────────────────────────────

  onChange(listener: VariableChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(name: string, oldVal: unknown, newVal: unknown, scope: Scope): void {
    for (const l of this.listeners) l(name, oldVal, newVal, scope);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private getStore(scope: Scope): Map<string, unknown> {
    if (scope === 'local')  return this.local;
    if (scope === 'slide') return this.slide;
    if (scope === 'scene') return this.scene;
    return this.project;
  }

  /** Get all variable names grouped by scope. */
  allByScope(): Record<Scope, string[]> {
    const scopes: Scope[] = ['project', 'scene', 'slide', 'local'];
    const result = {} as Record<Scope, string[]>;
    for (const s of scopes) {
      result[s] = [...this.getStore(s).keys()];
    }
    return result;
  }

  /** Get a system variable value (runtime-provided). */
  getSystemVariable(name: string): unknown {
    const def = getSystemVariable(name);
    if (!def) return undefined;

    switch (name) {
      case 'system.date':    return new Date().toISOString().split('T')[0];
      case 'system.time':     return Math.floor((Date.now() % 86400000) / 1000);
      case 'system.datetime': return new Date().toISOString();
      default:                return undefined;
    }
  }
}
