// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser-side PathfinderRuntime — drives course rendering in a browser.
 *
 * Tested under jsdom: we import the runtime IIFE source string,
 * eval it into the test's window, then exercise the resulting
 * `window.PathfinderRuntime` class.
 *
 * The runtime contract matches what the packager's emitted index.html
 * already expects:
 *
 *   var rt = new PathfinderRuntime({ course, container, lmsAdapter });
 *   rt.start();
 *   rt.on('slidechange', function(slideId, idx, total) { ... });
 *   rt.navigatePrev();
 *   rt.navigateNext();
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BROWSER_RUNTIME } from '../../src/publish/browser-runtime.js';

// ---- Test bootstrap ----

beforeEach(() => {
  // Eval the IIFE into the jsdom global scope, fresh each test.
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
  start(): void | Promise<void>;
  navigatePrev(): void;
  navigateNext(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  off?(event: string, cb: (...args: unknown[]) => void): void;
  getCurrentSlideId?(): string;
  getVariable?(name: string): unknown;
  setVariable?(name: string, value: unknown): void;
}

function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}

// ---- Fixtures ----

function twoSlideCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'c1', title: 'Test', author: 'A', language: 'en' },
    canvas: { width: 1280, height: 720, backgroundColor: '#FFF' },
    slides: [
      {
        id: 'slide-1',
        title: 'One',
        background: { type: 'solid', color: '#EEEEEE' },
        objects: [
          {
            id: 't1',
            type: 'text',
            rect: [10, 20, 500, 100],
            content: '<p>Hello</p>',
          },
        ],
        triggers: [],
      },
      {
        id: 'slide-2',
        title: 'Two',
        background: { type: 'solid', color: '#FFFFFF' },
        objects: [],
        triggers: [],
      },
    ],
    variables: {},
    navigation: {
      entry: 'slide-1',
      slides: ['slide-1', 'slide-2'],
      arrows: true,
      progress: false,
    },
    lms: { standard: 'html5' },
  };
}

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ---- Tests ----

describe('Browser PathfinderRuntime: smoke', () => {
  it('exposes PathfinderRuntime on globalThis after IIFE evaluation', () => {
    const Ctor = getRuntimeCtor();
    expect(Ctor).toBeDefined();
    expect(typeof Ctor).toBe('function');
  });

  it('constructs without throwing', () => {
    const Ctor = getRuntimeCtor();
    expect(() => new Ctor({ course: twoSlideCourse(), container: makeContainer() })).not.toThrow();
  });
});

describe('Browser PathfinderRuntime: rendering', () => {
  it('start() renders the entry slide into the container', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    expect(container.children.length).toBeGreaterThan(0);
    const slideEl = container.querySelector('[data-slide-id]') as HTMLElement | null;
    expect(slideEl).not.toBeNull();
    expect(slideEl!.getAttribute('data-slide-id')).toBe('slide-1');
  });

  it('renders a text object with its content', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    expect(container.innerHTML).toContain('Hello');
  });

  it('positions an object with absolute left/top/width/height', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    const obj = container.querySelector('[data-object-id="t1"]') as HTMLElement | null;
    expect(obj).not.toBeNull();
    expect(obj!.style.position).toBe('absolute');
    expect(obj!.style.left).toBe('10px');
    expect(obj!.style.top).toBe('20px');
    expect(obj!.style.width).toBe('500px');
    expect(obj!.style.height).toBe('100px');
  });

  it('applies solid background color to the slide wrapper', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    const slide = container.querySelector('[data-slide-id="slide-1"]') as HTMLElement;
    // jsdom normalizes #EEEEEE → rgb(238, 238, 238) sometimes; just check it’s set.
    expect(slide.style.background || slide.style.backgroundColor).toMatch(/eee|238/i);
  });

  it('uses canvas dimensions for slide wrapper size', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    const slide = container.querySelector('[data-slide-id="slide-1"]') as HTMLElement;
    expect(slide.style.width).toBe('1280px');
    expect(slide.style.height).toBe('720px');
  });

  it('renders an image object as <img> with src', () => {
    const Ctor = getRuntimeCtor();
    const course = twoSlideCourse();
    (course.slides as Array<Record<string, unknown>>)[0].objects = [
      { id: 'img1', type: 'image', rect: [0, 0, 200, 200], src: 'media/hero.png', altText: 'Hero' },
    ];
    const container = makeContainer();
    new Ctor({ course, container }).start();
    const img = container.querySelector('img[data-object-id="img1"]') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('media/hero.png');
    expect(img!.getAttribute('alt')).toBe('Hero');
  });

  it('renders a button object as <button>', () => {
    const Ctor = getRuntimeCtor();
    const course = twoSlideCourse();
    (course.slides as Array<Record<string, unknown>>)[0].objects = [
      { id: 'b1', type: 'button', rect: [0, 0, 100, 40], content: 'Click me' },
    ];
    const container = makeContainer();
    new Ctor({ course, container }).start();
    const btn = container.querySelector('button[data-object-id="b1"]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Click me');
  });
});

describe('Browser PathfinderRuntime: navigation', () => {
  it('navigateNext advances to the next slide', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    rt.navigateNext();
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('data-slide-id')).toBe('slide-2');
  });

  it('navigatePrev returns to the previous slide', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    rt.navigateNext();
    rt.navigatePrev();
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('data-slide-id')).toBe('slide-1');
  });

  it('navigateNext at the last slide stays on the last slide', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    rt.navigateNext();
    rt.navigateNext(); // already last
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('data-slide-id')).toBe('slide-2');
  });

  it('navigatePrev at the first slide stays on the first slide', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    rt.navigatePrev();
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('data-slide-id')).toBe('slide-1');
  });

  it('replaces the previous slide on navigation (no orphans)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    rt.start();
    rt.navigateNext();
    const slides = container.querySelectorAll('[data-slide-id]');
    expect(slides).toHaveLength(1);
  });
});

describe('Browser PathfinderRuntime: events', () => {
  it('fires slidechange on start with (slideId, idx, total)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    const calls: unknown[][] = [];
    rt.on('slidechange', (...args) => calls.push(args));
    rt.start();
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('slide-1');
    expect(last[1]).toBe(0);
    expect(last[2]).toBe(2);
  });

  it('fires slidechange on navigateNext with the new index', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    const calls: unknown[][] = [];
    rt.on('slidechange', (...args) => calls.push(args));
    rt.start();
    rt.navigateNext();
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('slide-2');
    expect(last[1]).toBe(1);
  });

  it('supports multiple subscribers for the same event', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    let a = 0;
    let b = 0;
    rt.on('slidechange', () => { a++; });
    rt.on('slidechange', () => { b++; });
    rt.start();
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('off() removes a previously-registered subscriber', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: twoSlideCourse(), container });
    let called = 0;
    const cb = () => { called++; };
    rt.on('slidechange', cb);
    rt.off?.('slidechange', cb);
    rt.start();
    expect(called).toBe(0);
  });
});

describe('Browser PathfinderRuntime: triggers', () => {
  it('clicking a button with a jumpToSlide trigger navigates', () => {
    const Ctor = getRuntimeCtor();
    const course = twoSlideCourse();
    (course.slides as Array<Record<string, unknown>>)[0].objects = [
      {
        id: 'next-btn',
        type: 'button',
        rect: [0, 0, 100, 40],
        content: 'Go to slide 2',
      },
    ];
    (course.slides as Array<Record<string, unknown>>)[0].triggers = [
      {
        id: 't-jump',
        source: 'next-btn',
        event: { type: 'userClick' },
        action: { type: 'jumpToSlide', target: 'slide-2' },
      },
    ];
    const container = makeContainer();
    const rt = new Ctor({ course, container });
    rt.start();
    const btn = container.querySelector('button[data-object-id="next-btn"]') as HTMLButtonElement;
    btn.click();
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('data-slide-id')).toBe('slide-2');
  });

  it('setVariable trigger updates the variable store', () => {
    const Ctor = getRuntimeCtor();
    const course = twoSlideCourse();
    (course.variables as Record<string, unknown>) = {
      Score: { type: 'number', default: 0 },
    };
    (course.slides as Array<Record<string, unknown>>)[0].objects = [
      {
        id: 'inc-btn',
        type: 'button',
        rect: [0, 0, 100, 40],
        content: '+1',
      },
    ];
    (course.slides as Array<Record<string, unknown>>)[0].triggers = [
      {
        id: 't-set',
        source: 'inc-btn',
        event: { type: 'userClick' },
        action: { type: 'setVariable', target: 'Score', value: 42 },
      },
    ];
    const container = makeContainer();
    const rt = new Ctor({ course, container });
    rt.start();
    expect(rt.getVariable!('Score')).toBe(0);
    const btn = container.querySelector('button[data-object-id="inc-btn"]') as HTMLButtonElement;
    btn.click();
    expect(rt.getVariable!('Score')).toBe(42);
  });
});

describe('Browser PathfinderRuntime: variables', () => {
  it('initializes variables from course.variables defaults', () => {
    const Ctor = getRuntimeCtor();
    const course = twoSlideCourse();
    course.variables = {
      Score: { type: 'number', default: 50 },
      Done: { type: 'trueFalse', default: false },
    };
    const rt = new Ctor({ course, container: makeContainer() });
    expect(rt.getVariable!('Score')).toBe(50);
    expect(rt.getVariable!('Done')).toBe(false);
  });

  it('setVariable round-trips through getVariable', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: twoSlideCourse(), container: makeContainer() });
    rt.setVariable!('NewVar', 'hello');
    expect(rt.getVariable!('NewVar')).toBe('hello');
  });

  it('substitutes %VarName% placeholders in text content on render', () => {
    const Ctor = getRuntimeCtor();
    const course = twoSlideCourse();
    course.variables = { LearnerName: { type: 'text', default: 'Pat' } };
    (course.slides as Array<Record<string, unknown>>)[0].objects = [
      { id: 'greeting', type: 'text', rect: [0, 0, 500, 100], content: 'Hi %LearnerName%!' },
    ];
    const container = makeContainer();
    new Ctor({ course, container }).start();
    expect(container.innerHTML).toContain('Hi Pat!');
  });
});
