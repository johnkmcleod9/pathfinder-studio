// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — session-time tracking
 *
 * Every LMS expects cmi.core.session_time (SCORM 1.2) /
 * cmi.session_time (SCORM 2004) to reflect how long the learner
 * actually spent in the SCO. Without this push, manager dashboards
 * show "0 minutes" for every learner, which is the #1 LMS support
 * complaint about home-grown SCOs.
 *
 * Behavior:
 * - Constructor records sessionStartTime = Date.now()
 * - getSessionTime() returns elapsed ms since start (consultable any time)
 * - terminate() pushes elapsed time via lmsAdapter.SaveSessionTime(ms)
 *   then calls lmsAdapter.Terminate('') if both exist
 * - Adapter without SaveSessionTime → silent no-op
 * - Adapter that throws → swallowed + logged
 * - Idempotent: calling terminate() twice does not push twice
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BROWSER_RUNTIME } from '../../src/publish/browser-runtime.js';

beforeEach(() => {
  delete (globalThis as unknown as { PathfinderRuntime?: unknown }).PathfinderRuntime;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(BROWSER_RUNTIME)();
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

interface RuntimeCtor {
  new (opts: { course: unknown; container: HTMLElement; lmsAdapter?: unknown }): RuntimeInstance;
}
interface RuntimeInstance {
  start(): void;
  getSessionTime?(): number;
  terminate?(): void;
}
function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function tinyCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'st', title: 'S', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: [{
      id: 's1', title: 'One',
      background: { type: 'solid', color: '#FFF' },
      objects: [], triggers: [],
    }],
    variables: {},
    navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
    lms: { standard: 'scorm12' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Session time: getSessionTime', () => {
  it('starts at ~0 immediately after construction', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: tinyCourse(), container: makeContainer() });
    expect(typeof rt.getSessionTime).toBe('function');
    expect(rt.getSessionTime!()).toBeLessThan(50);
  });

  it('reports elapsed milliseconds since construction', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: tinyCourse(), container: makeContainer() });
    vi.advanceTimersByTime(45_000);
    expect(rt.getSessionTime!()).toBe(45_000);
  });

  it('keeps ticking after start()', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: tinyCourse(), container: makeContainer() });
    rt.start();
    vi.advanceTimersByTime(10_000);
    expect(rt.getSessionTime!()).toBeGreaterThanOrEqual(10_000);
  });
});

describe('Session time: terminate() pushes to LMS', () => {
  it('exposes a terminate() method', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: tinyCourse(), container: makeContainer() });
    expect(typeof rt.terminate).toBe('function');
  });

  it('calls lmsAdapter.SaveSessionTime(elapsedMs) on terminate', () => {
    const Ctor = getRuntimeCtor();
    const SaveSessionTime = vi.fn();
    const rt = new Ctor({
      course: tinyCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveSessionTime, Terminate: vi.fn() },
    });
    rt.start();
    vi.advanceTimersByTime(75_000);
    rt.terminate!();
    expect(SaveSessionTime).toHaveBeenCalledTimes(1);
    expect(SaveSessionTime).toHaveBeenCalledWith(75_000);
  });

  it('calls lmsAdapter.Terminate("") AFTER SaveSessionTime', () => {
    const Ctor = getRuntimeCtor();
    const order: string[] = [];
    const lmsAdapter = {
      SaveSessionTime: vi.fn(() => { order.push('SaveSessionTime'); }),
      Terminate: vi.fn(() => { order.push('Terminate'); }),
    };
    const rt = new Ctor({ course: tinyCourse(), container: makeContainer(), lmsAdapter });
    rt.start();
    rt.terminate!();
    expect(order).toEqual(['SaveSessionTime', 'Terminate']);
  });

  it('flushes saveProgress() before pushing session time', () => {
    // When the learner exits, we want the very latest variables /
    // current slide to be saved alongside the session-time push.
    const Ctor = getRuntimeCtor();
    const SaveSuspendData = vi.fn();
    const SaveSessionTime = vi.fn();
    const rt = new Ctor({
      course: tinyCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveSuspendData, SaveSessionTime, Terminate: vi.fn() },
    });
    rt.start();
    rt.terminate!();
    expect(SaveSuspendData).toHaveBeenCalled();
    expect(SaveSessionTime).toHaveBeenCalled();
  });

  it('is idempotent: a second terminate() does not push again', () => {
    const Ctor = getRuntimeCtor();
    const SaveSessionTime = vi.fn();
    const Terminate = vi.fn();
    const rt = new Ctor({
      course: tinyCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveSessionTime, Terminate },
    });
    rt.start();
    rt.terminate!();
    rt.terminate!();
    expect(SaveSessionTime).toHaveBeenCalledTimes(1);
    expect(Terminate).toHaveBeenCalledTimes(1);
  });
});

describe('Session time: adapter robustness', () => {
  it('does not throw when adapter has no SaveSessionTime', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({
      course: tinyCourse(),
      container: makeContainer(),
      lmsAdapter: { Terminate: vi.fn() },
    });
    rt.start();
    expect(() => rt.terminate!()).not.toThrow();
  });

  it('does not throw when adapter has no Terminate', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({
      course: tinyCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveSessionTime: vi.fn() },
    });
    rt.start();
    expect(() => rt.terminate!()).not.toThrow();
  });

  it('does not throw when SaveSessionTime throws', () => {
    const Ctor = getRuntimeCtor();
    const SaveSessionTime = vi.fn(() => { throw new Error('LMS down'); });
    const Terminate = vi.fn();
    const rt = new Ctor({
      course: tinyCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveSessionTime, Terminate },
    });
    rt.start();
    expect(() => rt.terminate!()).not.toThrow();
    // We still try to terminate even if session-time push failed.
    expect(Terminate).toHaveBeenCalled();
  });

  it('does nothing when there is no adapter at all', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: tinyCourse(), container: makeContainer() });
    rt.start();
    expect(() => rt.terminate!()).not.toThrow();
  });
});

describe('Session time: emits sessionend event', () => {
  it('emits "sessionend" with {durationMs} on terminate', () => {
    const Ctor = getRuntimeCtor();
    const events: Array<{ durationMs: number }> = [];
    const rt = new Ctor({ course: tinyCourse(), container: makeContainer() }) as RuntimeInstance & {
      on: (e: string, cb: (...a: unknown[]) => void) => void;
    };
    rt.on('sessionend', (payload: unknown) => {
      events.push(payload as { durationMs: number });
    });
    rt.start();
    vi.advanceTimersByTime(30_000);
    rt.terminate!();
    expect(events).toHaveLength(1);
    expect(events[0].durationMs).toBe(30_000);
  });

  it('does not re-emit on second terminate()', () => {
    const Ctor = getRuntimeCtor();
    let count = 0;
    const rt = new Ctor({ course: tinyCourse(), container: makeContainer() }) as RuntimeInstance & {
      on: (e: string, cb: (...a: unknown[]) => void) => void;
    };
    rt.on('sessionend', () => { count++; });
    rt.start();
    rt.terminate!();
    rt.terminate!();
    expect(count).toBe(1);
  });
});
