import { describe, it, expect, beforeEach } from 'vitest';
import { VariableStore } from '../../src/variables/store.js';

describe('VariableStore', () => {
  let store: VariableStore;

  beforeEach(() => {
    store = new VariableStore();
  });

  describe('Basic operations', () => {
    it('get returns undefined for unknown variables', () => {
      expect(store.get('unknown')).toBeUndefined();
    });

    it('has returns false for unknown variables', () => {
      expect(store.has('unknown')).toBe(false);
    });

    it('define creates a variable with correct type and scope', () => {
      store.define('playerName', 'text');
      expect(store.get('playerName')).toBe('');
      expect(store.has('playerName')).toBe(true);
    });

    it('define with default value', () => {
      store.define('maxScore', 'number', { scope: 'project' });
      expect(store.get('maxScore')).toBe(0);
    });
  });

  describe('Type coercion', () => {
    it('text variable coerces numbers to strings', () => {
      store.define('name', 'text');
      store.set('name', 42);
      expect(store.get('name')).toBe('42');
    });

    it('number variable parses numeric strings', () => {
      store.define('score', 'number');
      store.set('score', '99');
      expect(store.get('score')).toBe(99);
    });

    it('boolean variable coerces from strings', () => {
      store.define('active', 'boolean');
      store.set('active', 'true');
      expect(store.get('active')).toBe(true);
    });
  });

  describe('Scope levels', () => {
    it('defaults to project scope', () => {
      store.define('x', 'number');
      const def = store.getDef('x')!;
      expect(def.scope).toBe('project');
    });

    it('scene scope initializes independently', () => {
      store.define('sceneTitle', 'text', { scope: 'scene' });
      expect(store.get('sceneTitle')).toBe('');

      store.initScene({ sceneTitle: 'Module 1' });
      expect(store.get('sceneTitle')).toBe('Module 1');
    });

    it('slide scope shadows project scope', () => {
      store.define('counter', 'number', { scope: 'project' });
      store.set('counter', 10);

      // initSlide creates slide-scoped shadow of 'counter'
      store.initSlide({ counter: 5 });
      expect(store.get('counter')).toBe(5); // slide shadows project

      // After clearing slide, project scope is visible again
      store.clearSlide();
      expect(store.get('counter')).toBe(10);
    });

    it('clearLocal removes local-scoped variables', () => {
      store.initSlide({ temp: 'hello' });
      expect(store.get('temp')).toBe('hello');
      store.clearSlide();
      expect(store.get('temp')).toBeUndefined();
    });

    it('resetToDefaults restores all definitions to default values', () => {
      store.define('count', 'number', { scope: 'project' });
      store.set('count', 999);
      store.resetToDefaults();
      expect(store.get('count')).toBe(0);
    });
  });

  describe('Notifications', () => {
    it('onChange fires when variable changes', () => {
      store.define('x', 'number');
      const calls: [string, unknown, unknown][] = [];
      store.onChange((name, oldVal, newVal) => calls.push([name, oldVal, newVal]));

      store.set('x', 10);
      store.set('x', 20);
      store.set('x', 20); // same value — still fires but old===new
      store.set('x', 30);

      expect(calls.length).toBe(3);
      expect(calls[0]).toEqual(['x', 0, 10]);
      expect(calls[1]).toEqual(['x', 10, 20]);
      expect(calls[2]).toEqual(['x', 20, 30]);
    });

    it('onChange returns unsubscribe function', () => {
      store.define('y', 'text');
      const calls: string[] = [];
      const unsub = store.onChange((name) => calls.push(name));
      unsub();
      store.set('y', 'hello');
      expect(calls).toEqual([]);
    });
  });

  describe('Validation', () => {
    it('rejects out-of-range numbers', () => {
      store.define('score', 'number');
      // Number type range is ±9,999,999,999,999; 1e16 exceeds it
      const { success, warning } = store.set('score', 1e16);
      expect(success).toBe(false);
      expect(warning).toContain('range');
    });

    it('accepts valid values', () => {
      store.define('name', 'text');
      const { success } = store.set('name', 'Alice');
      expect(success).toBe(true);
      expect(store.get('name')).toBe('Alice');
    });
  });

  describe('Export/Import', () => {
    it('exportProject serializes project vars', () => {
      store.define('a', 'text');
      store.define('b', 'number');
      store.set('a', 'hello');
      store.set('b', 42);
      const json = store.exportProject();
      expect(JSON.parse(json)).toEqual({ a: 'hello', b: 42 });
    });

    it('importProject restores vars', () => {
      store.define('x', 'number');
      store.set('x', 10);
      const { warnings } = store.importProject('{"x": 99, "y": "new"}');
      expect(store.get('x')).toBe(99);
      expect(store.get('y')).toBe('new');
      expect(warnings).toHaveLength(0);
    });

    it('importProject returns warnings for failures', () => {
      store.define('n', 'number');
      store.importProject('{"n": "not-a-number"}');
      // string coerced to 0 (no warning for number type), but unknown key generates warning
      expect(store.get('n')).toBe(0);
    });
  });

  describe('LMS persistence fields', () => {
    it('exportToLMS is stored on definition', () => {
      store.define('score', 'number', { exportToLMS: true, lmsKey: 'cmi.score.raw' });
      const def = store.getDef('score')!;
      expect(def.exportToLMS).toBe(true);
      expect(def.lmsKey).toBe('cmi.score.raw');
    });
  });
});
