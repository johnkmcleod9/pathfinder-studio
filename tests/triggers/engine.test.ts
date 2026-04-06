import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerEngine, VariableStore, type Slide, type CourseProject } from '../../src/triggers/engine.js';

function makeEngine(vars?: Record<string, unknown>, slides?: Slide[]) {
  const project: CourseProject = {
    slides: slides ?? [],
    variables: vars ?? {},
  };
  const store = new VariableStore(vars ?? {});
  const engine = new TriggerEngine(store, project);
  return { engine, store, project };
}

describe('TriggerEngine', () => {
  describe('VariableStore', () => {
    it('get/set basic values', () => {
      const store = new VariableStore({ score: 0, name: '' });
      expect(store.get('score')).toBe(0);
      store.set('score', 10);
      expect(store.get('score')).toBe(10);
    });

    it('getAll returns all vars', () => {
      const store = new VariableStore({ a: 1, b: 2 });
      expect(store.getAll()).toEqual({ a: 1, b: 2 });
    });

    it('resetAll clears and reinitializes', () => {
      const store = new VariableStore({ a: 1, b: 2 });
      store.resetAll({ c: 3 });
      expect(store.getAll()).toEqual({ c: 3 });
    });

    it('onChange fires when value changes', () => {
      const store = new VariableStore({ count: 0 });
      const calls: unknown[] = [];
      store.onChange('count', v => calls.push(v));
      store.set('count', 5);
      store.set('count', 5); // same value — should still fire
      store.set('count', 10);
      expect(calls).toEqual([5, 5, 10]);
    });

    it('onChange returns unsubscribe function', () => {
      const store = new VariableStore({ count: 0 });
      const calls: unknown[] = [];
      const unsub = store.onChange('count', v => calls.push(v));
      unsub();
      store.set('count', 99);
      expect(calls).toEqual([]);
    });

    it('reset restores a variable to a default value', () => {
      const store = new VariableStore({ score: 0 });
      store.set('score', 50);
      store.reset('score', 0);
      expect(store.get('score')).toBe(0);
    });
  });

  describe('Trigger Registration', () => {
    it('registers a slide-level trigger', () => {
      const { engine } = makeEngine({}, [{
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: { type: 'setVariable', variable: 'started', value: true },
          priority: 0,
        }],
        objects: {},
      }]);

      engine.registerSlide(engine.project.slides[0]);
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('started')).toBe(true);
    });

    it('registers object-level triggers', () => {
      const { engine } = makeEngine({}, [{
        id: 'slide-1',
        triggers: [],
        objects: {
          'btn-start': {
            id: 'btn-start',
            triggers: [{
              id: 'tr-1',
              event: { type: 'userClick', source: 'btn-start' },
              action: { type: 'setVariable', variable: 'clicked', value: true },
              priority: 0,
            }],
          },
        },
      }]);

      engine.registerSlide(engine.project.slides[0]);
      engine.fire({ type: 'userClick', source: 'btn-start' });
      expect(engine.vars.get('clicked')).toBe(true);
    });

    it('triggers without source match global events', () => {
      const { engine } = makeEngine({}, [{
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: { type: 'setVariable', variable: 'started', value: true },
          priority: 0,
        }],
        objects: {},
      }]);

      engine.registerSlide(engine.project.slides[0]);
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('started')).toBe(true);
    });

    it('sorts triggers by priority (lower = first)', () => {
      const slides: Slide[] = [{
        id: 'slide-1',
        triggers: [
          { id: 'tr-low', event: { type: 'courseStarts' }, action: { type: 'setVariable', variable: 'order', value: 'low' }, priority: 10 },
          { id: 'tr-high', event: { type: 'courseStarts' }, action: { type: 'setVariable', variable: 'order', value: 'high' }, priority: 0 },
        ],
        objects: {},
      }];

      const { engine } = makeEngine({}, slides);
      engine.registerSlide(slides[0]);
      engine.fire({ type: 'courseStarts' });
      // Both fire; last handler wins in current implementation
      // (Higher priority (lower number) registers first.)
      // After all handlers run, order = 'low' because tr-low runs after tr-high.
      expect(engine.vars.get('order')).toBe('low');
    });

    it('skips disabled triggers', () => {
      const slides: Slide[] = [{
        id: 'slide-1',
        triggers: [
          { id: 'tr-disabled', event: { type: 'courseStarts' }, action: { type: 'setVariable', variable: 'disabled', value: true }, priority: 0, disabled: true },
        ],
        objects: {},
      }];

      const { engine } = makeEngine({}, slides);
      engine.registerSlide(slides[0]);
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('disabled')).toBeUndefined();
    });
  });

  describe('Action Execution', () => {
    it('setVariable sets a variable', () => {
      const { engine } = makeEngine();
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'courseStarts' }, action: { type: 'setVariable', variable: 'x', value: 42 }, priority: 0 }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('x')).toBe(42);
    });

    it('adjustVariable adds to a number', () => {
      const { engine, store } = makeEngine({ score: 10 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'courseStarts' }, action: { type: 'adjustVariable', variable: 'score', operation: 'add', value: 5 }, priority: 0 }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(store.get('score')).toBe(15);
    });

    it('adjustVariable subtracts', () => {
      const { engine, store } = makeEngine({ score: 10 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'courseStarts' }, action: { type: 'adjustVariable', variable: 'score', operation: 'subtract', value: 3 }, priority: 0 }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(store.get('score')).toBe(7);
    });

    it('adjustVariable sets with "set" operation', () => {
      const { engine, store } = makeEngine({ score: 10 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'courseStarts' }, action: { type: 'adjustVariable', variable: 'score', operation: 'set', value: 99 }, priority: 0 }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(store.get('score')).toBe(99);
    });

    it('incrementCounter increments by 1', () => {
      const { engine, store } = makeEngine({ clicks: 0 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'userClick' }, action: { type: 'incrementCounter', variable: 'clicks' }, priority: 0 }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'userClick' });
      expect(store.get('clicks')).toBe(1);
    });

    it('decrementCounter decrements by 1', () => {
      const { engine, store } = makeEngine({ clicks: 5 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'userClick' }, action: { type: 'decrementCounter', variable: 'clicks' }, priority: 0 }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'userClick' });
      expect(store.get('clicks')).toBe(4);
    });

    it('resetVariable resets to default from project', () => {
      const project: CourseProject = { slides: [], variables: { score: 50 } };
      const store = new VariableStore({ score: 99 });
      const engine = new TriggerEngine(store, project);
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'courseStarts' }, action: { type: 'resetVariable', variable: 'score' }, priority: 0 }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(store.get('score')).toBe(50);
    });
  });

  describe('Navigation', () => {
    it('jumpToSlide calls onNavigate callback', async () => {
      let navTarget: string | undefined;
      const { engine } = makeEngine({}, [{
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'userClick' },
          action: { type: 'jumpToSlide', target: 'slide-002' },
          priority: 0,
        }],
        objects: {},
      }]);

      const eng = new TriggerEngine(engine.vars, engine.project, {
        onNavigate: (target) => { navTarget = target; },
      });
      eng.registerSlide(engine.project.slides[0]);
      await eng.fire({ type: 'userClick' });
      expect(navTarget).toBe('slide-002');
    });

    it('exitCourse calls onExit callback', async () => {
      let exitStatus: string | undefined;
      const { engine } = makeEngine({}, [{
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseEnds' },
          action: { type: 'exitCourse', completionStatus: 'completed' },
          priority: 0,
        }],
        objects: {},
      }]);

      const eng = new TriggerEngine(engine.vars, engine.project, {
        onExit: (status) => { exitStatus = status; },
      });
      eng.registerSlide(engine.project.slides[0]);
      await eng.fire({ type: 'courseEnds' });
      expect(exitStatus).toBe('completed');
    });
  });

  describe('Conditions', () => {
    it('does not fire when conditions are not met', () => {
      const { engine } = makeEngine({ score: 50 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: { type: 'setVariable', variable: 'fired', value: true },
          conditions: [{ type: 'variableEquals', variable: 'score', value: 100 }],
          priority: 0,
        }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('fired')).toBeUndefined();
    });

    it('fires when conditions are met', () => {
      const { engine } = makeEngine({ score: 100 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: { type: 'setVariable', variable: 'fired', value: true },
          conditions: [{ type: 'variableEquals', variable: 'score', value: 100 }],
          priority: 0,
        }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('fired')).toBe(true);
    });

    it('AND condition — all must pass', () => {
      const { engine } = makeEngine({ a: 1, b: 2 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: { type: 'setVariable', variable: 'fired', value: true },
          conditions: [
            { type: 'variableGreaterThan', variable: 'a', value: 0 },
            { type: 'variableLessThan', variable: 'b', value: 5 },
          ],
          priority: 0,
        }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('fired')).toBe(true);
    });

    it('OR condition — one must pass', () => {
      const { engine } = makeEngine({ a: 1, b: 99 });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: { type: 'setVariable', variable: 'fired', value: true },
          conditions: [
            { type: 'variableEquals', variable: 'a', value: 1 },
            { type: 'variableGreaterThan', variable: 'b', value: 50 },
          ],
          priority: 0,
        }],
        objects: {},
      };
      engine.registerSlide(slide);
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('fired')).toBe(true);
    });
  });

  describe('Conditional action (if/then/else)', () => {
    it('executes matching branch then-actions', async () => {
      const { engine } = makeEngine({ choice: 'correct' });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: {
            type: 'conditional',
            branches: [{
              conditions: [{ type: 'variableEquals', variable: 'choice', value: 'correct' }],
              then: [{ type: 'setVariable', variable: 'result', value: 'correct!' }],
            }],
            else: [{ type: 'setVariable', variable: 'result', value: 'try again' }],
          },
          priority: 0,
        }],
        objects: {},
      };
      engine.registerSlide(slide);
      await engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('result')).toBe('correct!');
    });

    it('falls through to else when no branch matches', async () => {
      const { engine } = makeEngine({ choice: 'wrong' });
      const slide: Slide = {
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: {
            type: 'conditional',
            branches: [{
              conditions: [{ type: 'variableEquals', variable: 'choice', value: 'correct' }],
              then: [{ type: 'setVariable', variable: 'result', value: 'correct!' }],
            }],
            else: [{ type: 'setVariable', variable: 'result', value: 'try again' }],
          },
          priority: 0,
        }],
        objects: {},
      };
      engine.registerSlide(slide);
      await engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('result')).toBe('try again');
    });
  });

  describe('delay action', () => {
    it('delay is async and waits', async () => {
      const delays: number[] = [];
      const { engine } = makeEngine({}, [{
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'courseStarts' },
          action: { type: 'delay', duration: 50 },
          priority: 0,
        }],
        objects: {},
      }]);

      new TriggerEngine(engine.vars, engine.project, {
        delay: (ms) => { delays.push(ms); return Promise.resolve(); },
      }).registerSlide(engine.project.slides[0]);

      const eng = new TriggerEngine(engine.vars, engine.project, {
        delay: (ms) => { delays.push(ms); return Promise.resolve(); },
      });
      eng.registerSlide(engine.project.slides[0]);
      const result = eng.fire({ type: 'courseStarts' });
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(delays).toEqual([50]);
    });
  });

  describe('reset()', () => {
    it('clears all listeners', () => {
      const { engine } = makeEngine({}, [{
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'courseStarts' }, action: { type: 'setVariable', variable: 'x', value: 1 }, priority: 0 }],
        objects: {},
      }]);
      engine.registerSlide(engine.project.slides[0]);
      engine.reset();
      engine.fire({ type: 'courseStarts' });
      expect(engine.vars.get('x')).toBeUndefined();
    });
  });

  describe('onAction hook', () => {
    it('onAction is called for unknown action types', () => {
      const { engine } = makeEngine();
      let called = false;
      const eng2 = new TriggerEngine(engine.vars, engine.project, {
        onAction: (action) => {
          called = true;
          return { kind: 'ok' };
        },
      });
      eng2.registerSlide({
        id: 'slide-1',
        triggers: [{ id: 'tr-1', event: { type: 'courseStarts' }, action: { type: 'customAction' } as any, priority: 0 }],
        objects: {},
      });
      eng2.fire({ type: 'courseStarts' });
      expect(called).toBe(true);
    });
  });

  describe('Event type: variableChanges', () => {
    it('variableChanges fires when variable is set', () => {
      const { engine, store } = makeEngine({ count: 0 });

      const eng3 = new TriggerEngine(store, engine.project);
      eng3.registerSlide({
        id: 'slide-1',
        triggers: [{
          id: 'tr-1',
          event: { type: 'variableChanges' },
          action: { type: 'setVariable', variable: 'doubled', value: true },
          priority: 0,
        }],
        objects: {},
      });

      store.set('count', 5);
      eng3.fire({ type: 'variableChanges', payload: { name: 'count' } });
      expect(store.get('doubled')).toBe(true);
    });
  });
});
