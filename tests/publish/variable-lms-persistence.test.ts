// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — variable LMS persistence
 *
 * Variables declared with exportToLMS=true and an explicit lmsMapping
 * sync to the LMS adapter on setVariable. Without this, learner state
 * the author intended to track in the LMS gradebook (cmi.score.raw,
 * cmi.objectives.X.score, custom data model elements) never reaches
 * the LMS.
 *
 * Behavior:
 * - exportToLMS=true + lmsMapping.key → lmsAdapter.SetValue(key, value)
 *   AND lmsAdapter.Commit('') (so the LMS persists immediately)
 * - exportToLMS=false (or missing) → no LMS call
 * - No lmsMapping → no LMS call (variable is local-only)
 * - Adapter without SetValue/Commit → silent no-op (don't break HTML5)
 * - Adapter SetValue throws → swallowed + logged
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BROWSER_RUNTIME } from '../../src/publish/browser-runtime.js';

beforeEach(() => {
  delete (globalThis as unknown as { PathfinderRuntime?: unknown }).PathfinderRuntime;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(BROWSER_RUNTIME)();
  document.body.innerHTML = '';
});

interface RuntimeCtor {
  new (opts: { course: unknown; container: HTMLElement; lmsAdapter?: unknown }): RuntimeInstance;
}
interface RuntimeInstance {
  start(): void;
  setVariable(name: string, value: unknown): void;
}
function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function courseWithVariable(varDef: Record<string, unknown>): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'vp', title: 'V', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: [{
      id: 's1',
      title: 'One',
      background: { type: 'solid', color: '#FFF' },
      objects: [],
      triggers: [],
    }],
    variables: { Score: varDef },
    navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
    lms: { standard: 'scorm12' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Variable LMS persistence: exportToLMS gate', () => {
  it('does NOT call SetValue when exportToLMS is false', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn();
    const Commit = vi.fn();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: false,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.score.raw' },
      }),
      container: makeContainer(),
      lmsAdapter: { SetValue, Commit },
    });
    rt.start();
    rt.setVariable('Score', 90);
    expect(SetValue).not.toHaveBeenCalled();
  });

  it('does NOT call SetValue when exportToLMS is missing', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        // no exportToLMS, no lmsMapping
      }),
      container: makeContainer(),
      lmsAdapter: { SetValue, Commit: vi.fn() },
    });
    rt.start();
    rt.setVariable('Score', 50);
    expect(SetValue).not.toHaveBeenCalled();
  });

  it('does NOT call SetValue when exportToLMS=true but lmsMapping is missing', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: true,
        // no lmsMapping
      }),
      container: makeContainer(),
      lmsAdapter: { SetValue, Commit: vi.fn() },
    });
    rt.start();
    rt.setVariable('Score', 50);
    expect(SetValue).not.toHaveBeenCalled();
  });
});

describe('Variable LMS persistence: SetValue + Commit', () => {
  it('calls SetValue(key, value) when exportToLMS=true with mapping', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn();
    const Commit = vi.fn();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.score.raw' },
      }),
      container: makeContainer(),
      lmsAdapter: { SetValue, Commit },
    });
    rt.start();
    rt.setVariable('Score', 75);
    expect(SetValue).toHaveBeenCalledWith('cmi.core.score.raw', '75');
  });

  it('calls Commit("") after SetValue so LMS persists immediately', () => {
    const Ctor = getRuntimeCtor();
    const order: string[] = [];
    const lmsAdapter = {
      SetValue: vi.fn(() => { order.push('SetValue'); }),
      Commit: vi.fn(() => { order.push('Commit'); }),
    };
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.score.raw' },
      }),
      container: makeContainer(),
      lmsAdapter,
    });
    rt.start();
    rt.setVariable('Score', 80);
    expect(order).toEqual(['SetValue', 'Commit']);
  });

  it('coerces booleans to "true" / "false" strings (SCORM data model)', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'boolean', default: false, scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.lesson_status' },
      }),
      container: makeContainer(),
      lmsAdapter: { SetValue, Commit: vi.fn() },
    });
    rt.start();
    rt.setVariable('Score', true);
    expect(SetValue).toHaveBeenCalledWith('cmi.core.lesson_status', 'true');
  });

  it('passes text through unchanged (still as a string)', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'text', default: '', scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm2004', key: 'cmi.location' },
      }),
      container: makeContainer(),
      lmsAdapter: { SetValue, Commit: vi.fn() },
    });
    rt.start();
    rt.setVariable('Score', 'slide-7');
    expect(SetValue).toHaveBeenCalledWith('cmi.location', 'slide-7');
  });

  it('does not duplicate the call when re-setting the same value', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.score.raw' },
      }),
      container: makeContainer(),
      lmsAdapter: { SetValue, Commit: vi.fn() },
    });
    rt.start();
    rt.setVariable('Score', 50);
    rt.setVariable('Score', 50); // same value
    expect(SetValue).toHaveBeenCalledTimes(1);
  });
});

describe('Variable LMS persistence: adapter robustness', () => {
  it('does not throw when adapter has no SetValue method', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.score.raw' },
      }),
      container: makeContainer(),
      lmsAdapter: {}, // empty adapter
    });
    rt.start();
    expect(() => rt.setVariable('Score', 90)).not.toThrow();
  });

  it('does not throw when adapter SetValue throws', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn(() => { throw new Error('LMS down'); });
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.score.raw' },
      }),
      container: makeContainer(),
      lmsAdapter: { SetValue, Commit: vi.fn() },
    });
    rt.start();
    expect(() => rt.setVariable('Score', 90)).not.toThrow();
  });

  it('still updates the in-memory variable when LMS push fails', () => {
    const Ctor = getRuntimeCtor();
    const SetValue = vi.fn(() => { throw new Error('LMS down'); });
    const lmsAdapter = { SetValue, Commit: vi.fn() };
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.score.raw' },
      }),
      container: makeContainer(),
      lmsAdapter,
    });
    rt.start();
    rt.setVariable('Score', 90);
    expect((rt as unknown as { variables: Record<string, unknown> }).variables.Score).toBe(90);
  });

  it('does not call Commit when SetValue is missing', () => {
    const Ctor = getRuntimeCtor();
    const Commit = vi.fn();
    const rt = new Ctor({
      course: courseWithVariable({
        type: 'number', default: 0, scope: 'course',
        exportToLMS: true,
        lmsMapping: { standard: 'scorm12', key: 'cmi.core.score.raw' },
      }),
      container: makeContainer(),
      lmsAdapter: { Commit },
    });
    rt.start();
    rt.setVariable('Score', 90);
    expect(Commit).not.toHaveBeenCalled();
  });
});
