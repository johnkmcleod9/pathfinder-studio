// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — keyboard navigation
 *
 * WCAG 2.1 AA requires that all interactive content be operable via
 * keyboard. Without arrow-key navigation a learner using only the
 * keyboard (or assistive tech that drives the keyboard) can't move
 * between slides — disqualifying the course for ADA / Section 508
 * compliance.
 *
 * Behavior:
 * - start() attaches a document-level keydown listener
 * - ArrowRight / PageDown / Space → navigateNext
 * - ArrowLeft / PageUp           → navigatePrev
 * - Home → first slide, End → last slide
 * - Disabled when course.navigation.keyboard === false
 * - Skipped when an editable element (input, textarea, contenteditable)
 *   has focus (so quiz fill-in inputs can receive arrow keys)
 * - terminate() removes the listener
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
  terminate?(): void;
  getCurrentSlideId(): string;
}
function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function key(name: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: name, bubbles: true });
}

function fourSlideCourse(opts: { keyboardNav?: boolean | undefined } = {}): Record<string, unknown> {
  const nav: Record<string, unknown> = {
    entry: 's1', slides: ['s1', 's2', 's3', 's4'], arrows: false, progress: false,
  };
  if (opts.keyboardNav !== undefined) nav.keyboard = opts.keyboardNav;
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'kc', title: 'K', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: ['s1', 's2', 's3', 's4'].map((id) => ({
      id, title: id,
      background: { type: 'solid', color: '#FFF' },
      objects: [], triggers: [],
    })),
    variables: {},
    navigation: nav,
    lms: { standard: 'html5' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Keyboard navigation: arrow keys', () => {
  it('ArrowRight advances to the next slide', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt.start();
    document.dispatchEvent(key('ArrowRight'));
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('ArrowLeft goes to the previous slide', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt.start();
    document.dispatchEvent(key('ArrowRight'));
    document.dispatchEvent(key('ArrowRight'));
    document.dispatchEvent(key('ArrowLeft'));
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('PageDown also advances', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt.start();
    document.dispatchEvent(key('PageDown'));
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('PageUp also goes back', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt.start();
    document.dispatchEvent(key('ArrowRight'));
    document.dispatchEvent(key('PageUp'));
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('Space advances (matches Reveal.js / Slides.com convention)', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt.start();
    document.dispatchEvent(key(' '));
    expect(rt.getCurrentSlideId()).toBe('s2');
  });
});

describe('Keyboard navigation: Home / End', () => {
  it('End jumps to the last slide', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt.start();
    document.dispatchEvent(key('End'));
    expect(rt.getCurrentSlideId()).toBe('s4');
  });

  it('Home jumps to the first slide', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt.start();
    document.dispatchEvent(key('End'));
    document.dispatchEvent(key('Home'));
    expect(rt.getCurrentSlideId()).toBe('s1');
  });
});

describe('Keyboard navigation: focused-input passthrough', () => {
  it('does NOT consume keys when an <input> has focus', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: fourSlideCourse(), container });
    rt.start();

    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();

    // Dispatch the event on the focused input so we exercise the
    // passthrough check.
    input.dispatchEvent(key('ArrowRight'));
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('does NOT consume keys when a <textarea> has focus', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: fourSlideCourse(), container });
    rt.start();

    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(key('ArrowRight'));
    expect(rt.getCurrentSlideId()).toBe('s1');
  });
});

describe('Keyboard navigation: opt-out', () => {
  it('does NOT bind keys when course.navigation.keyboard === false', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse({ keyboardNav: false }), container: makeContainer() });
    rt.start();
    document.dispatchEvent(key('ArrowRight'));
    expect(rt.getCurrentSlideId()).toBe('s1');
  });
});

describe('Keyboard navigation: lifecycle', () => {
  it('removes the listener on terminate() so navigation stops', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt.start();
    rt.terminate!();
    document.dispatchEvent(key('ArrowRight'));
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('a fresh runtime after terminate() has its own working listener', () => {
    const Ctor = getRuntimeCtor();
    const rt1 = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt1.start();
    rt1.terminate!();

    const rt2 = new Ctor({ course: fourSlideCourse(), container: makeContainer() });
    rt2.start();
    document.dispatchEvent(key('ArrowRight'));
    expect(rt2.getCurrentSlideId()).toBe('s2');
  });
});
