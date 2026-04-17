// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — resume / suspend-data support
 *
 * On start(), the runtime calls lmsAdapter.LoadSuspendData() (if present)
 * and restores: current slide, variable values, last quiz score.
 * On every slide change and variable set it persists via
 * lmsAdapter.SaveSuspendData(state) and SaveLocation(slideId).
 *
 * The adapter contract intentionally matches the existing SCORM 1.2 and
 * 2004 adapters in src/publish/scorm-manifest.ts so the runtime drops in
 * unchanged.
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
  new (opts: {
    course: unknown;
    container: HTMLElement;
    lmsAdapter?: unknown;
  }): RuntimeInstance;
}

interface RuntimeInstance {
  start(): void;
  navigateNext(): void;
  navigatePrev(): void;
  setVariable(name: string, value: unknown): void;
  getVariable(name: string): unknown;
  getCurrentSlideId(): string;
  saveProgress?(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ---- Fixture builder ----

function threeSlideCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'rc', title: 'R', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: [
      { id: 's1', title: 'One', background: { type: 'solid', color: '#FFF' }, objects: [], triggers: [] },
      { id: 's2', title: 'Two', background: { type: 'solid', color: '#FFF' }, objects: [], triggers: [] },
      { id: 's3', title: 'Three', background: { type: 'solid', color: '#FFF' }, objects: [], triggers: [] },
    ],
    variables: {
      Score: { type: 'number', default: 0, scope: 'course' },
      Name: { type: 'text', default: 'World', scope: 'course' },
    },
    navigation: { entry: 's1', slides: ['s1', 's2', 's3'], arrows: true, progress: false },
    lms: { standard: 'scorm12' },
  };
}

// ---- Tests ----

describe('Browser runtime resume: load on start', () => {
  it('does not call LoadSuspendData when adapter has no such method', () => {
    const Ctor = getRuntimeCtor();
    const adapter = {};
    const rt = new Ctor({ course: threeSlideCourse(), container: makeContainer(), lmsAdapter: adapter });
    expect(() => rt.start()).not.toThrow();
  });

  it('calls LoadSuspendData() on start when adapter exposes it', () => {
    const Ctor = getRuntimeCtor();
    const LoadSuspendData = vi.fn(() => ({}));
    const rt = new Ctor({
      course: threeSlideCourse(),
      container: makeContainer(),
      lmsAdapter: { LoadSuspendData },
    });
    rt.start();
    expect(LoadSuspendData).toHaveBeenCalledTimes(1);
  });

  it('restores currentSlideId from suspend data', () => {
    const Ctor = getRuntimeCtor();
    const adapter = { LoadSuspendData: () => ({ slide: 's3' }) };
    const rt = new Ctor({ course: threeSlideCourse(), container: makeContainer(), lmsAdapter: adapter });
    rt.start();
    expect(rt.getCurrentSlideId()).toBe('s3');
  });

  it('restores variables from suspend data, overriding declared defaults', () => {
    const Ctor = getRuntimeCtor();
    const adapter = {
      LoadSuspendData: () => ({ variables: { Score: 42, Name: 'Alice' } }),
    };
    const rt = new Ctor({ course: threeSlideCourse(), container: makeContainer(), lmsAdapter: adapter });
    rt.start();
    expect(rt.getVariable('Score')).toBe(42);
    expect(rt.getVariable('Name')).toBe('Alice');
  });

  it('falls back to entry slide when restored slide id is unknown', () => {
    const Ctor = getRuntimeCtor();
    const adapter = { LoadSuspendData: () => ({ slide: 'does-not-exist' }) };
    const rt = new Ctor({ course: threeSlideCourse(), container: makeContainer(), lmsAdapter: adapter });
    rt.start();
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('falls back gracefully when LoadSuspendData throws', () => {
    const Ctor = getRuntimeCtor();
    const adapter = {
      LoadSuspendData: () => { throw new Error('LMS exploded'); },
    };
    const rt = new Ctor({ course: threeSlideCourse(), container: makeContainer(), lmsAdapter: adapter });
    expect(() => rt.start()).not.toThrow();
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('falls back gracefully when LoadSuspendData returns non-object', () => {
    const Ctor = getRuntimeCtor();
    const adapter = { LoadSuspendData: () => 'garbage' as unknown as Record<string, unknown> };
    const rt = new Ctor({ course: threeSlideCourse(), container: makeContainer(), lmsAdapter: adapter });
    expect(() => rt.start()).not.toThrow();
    expect(rt.getCurrentSlideId()).toBe('s1');
  });
});

describe('Browser runtime resume: persist on slide change', () => {
  it('calls SaveLocation(slideId) on slide change', () => {
    const Ctor = getRuntimeCtor();
    const SaveLocation = vi.fn();
    const rt = new Ctor({
      course: threeSlideCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveLocation },
    });
    rt.start();
    rt.navigateNext();
    expect(SaveLocation).toHaveBeenCalledWith('s2');
    rt.navigateNext();
    expect(SaveLocation).toHaveBeenCalledWith('s3');
  });

  it('calls SaveSuspendData on slide change with current state shape', () => {
    const Ctor = getRuntimeCtor();
    const SaveSuspendData = vi.fn();
    const rt = new Ctor({
      course: threeSlideCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveSuspendData },
    });
    rt.start();
    rt.navigateNext();
    expect(SaveSuspendData).toHaveBeenCalled();
    const arg = SaveSuspendData.mock.calls[SaveSuspendData.mock.calls.length - 1][0];
    expect(arg).toMatchObject({ slide: 's2' });
    expect(arg.variables).toBeDefined();
  });

  it('does not throw when adapter SaveLocation throws', () => {
    const Ctor = getRuntimeCtor();
    const SaveLocation = vi.fn(() => { throw new Error('save failed'); });
    const rt = new Ctor({
      course: threeSlideCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveLocation },
    });
    rt.start();
    expect(() => rt.navigateNext()).not.toThrow();
  });
});

describe('Browser runtime resume: persist on setVariable', () => {
  it('calls SaveSuspendData when a variable is set', () => {
    const Ctor = getRuntimeCtor();
    const SaveSuspendData = vi.fn();
    const rt = new Ctor({
      course: threeSlideCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveSuspendData },
    });
    rt.start();
    SaveSuspendData.mockClear();
    rt.setVariable('Score', 99);
    expect(SaveSuspendData).toHaveBeenCalled();
    const arg = SaveSuspendData.mock.calls[SaveSuspendData.mock.calls.length - 1][0];
    expect(arg.variables.Score).toBe(99);
  });
});

describe('Browser runtime resume: explicit saveProgress', () => {
  it('exposes saveProgress() that triggers SaveSuspendData on demand', () => {
    const Ctor = getRuntimeCtor();
    const SaveSuspendData = vi.fn();
    const rt = new Ctor({
      course: threeSlideCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveSuspendData },
    });
    rt.start();
    SaveSuspendData.mockClear();
    expect(typeof rt.saveProgress).toBe('function');
    rt.saveProgress!();
    expect(SaveSuspendData).toHaveBeenCalledTimes(1);
  });

  it('saveProgress is a no-op when adapter has no SaveSuspendData', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({
      course: threeSlideCourse(),
      container: makeContainer(),
      lmsAdapter: {},
    });
    rt.start();
    expect(() => rt.saveProgress!()).not.toThrow();
  });
});

describe('Browser runtime resume: round-trip via memory adapter', () => {
  it('a stop+restart restores slide and variables (round-trip)', () => {
    // Simulate a real LMS by holding state in a closure.
    let stored: Record<string, unknown> | null = null;
    const adapter = {
      LoadSuspendData: () => stored ?? {},
      SaveSuspendData: (s: Record<string, unknown>) => { stored = s; },
      SaveLocation: () => {},
    };

    const Ctor = getRuntimeCtor();

    // First session: navigate to s2, set Score=50.
    const rt1 = new Ctor({ course: threeSlideCourse(), container: makeContainer(), lmsAdapter: adapter });
    rt1.start();
    rt1.navigateNext();
    rt1.setVariable('Score', 50);
    expect(rt1.getCurrentSlideId()).toBe('s2');

    // Second session: a new runtime with the same adapter — restore.
    document.body.innerHTML = '';
    const rt2 = new Ctor({ course: threeSlideCourse(), container: makeContainer(), lmsAdapter: adapter });
    rt2.start();
    expect(rt2.getCurrentSlideId()).toBe('s2');
    expect(rt2.getVariable('Score')).toBe(50);
  });
});
