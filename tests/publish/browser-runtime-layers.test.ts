// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — layer rendering + showLayer/hideLayer
 *
 * The runtime renders a slide's base objects then overlays each layer
 * whose initial `visible` is true.  Triggers can fire `showLayer` /
 * `hideLayer` actions to toggle layer visibility at runtime, which
 * re-renders the slide.
 *
 * Layer state is per-slide: navigating away and back resets layers to
 * their declared initial visibility.
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
  navigateNext(): void;
  navigatePrev(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  isLayerVisible?(layerId: string): boolean;
  showLayer?(layerId: string): void;
  hideLayer?(layerId: string): void;
}

function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ---- Fixture ----

function layeredCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'lc', title: 'L', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: [
      {
        id: 's1',
        title: 'Slide 1',
        background: { type: 'solid', color: '#FFF' },
        objects: [
          { id: 'btn-show', type: 'button', rect: [10, 10, 200, 40], content: 'Show modal' },
          { id: 'btn-hide', type: 'button', rect: [10, 60, 200, 40], content: 'Close modal' },
          { id: 'base-text', type: 'text', rect: [10, 110, 600, 40], content: 'Base layer content' },
        ],
        layers: [
          {
            id: 'modal',
            name: 'Modal',
            visible: false,
            objects: [
              { id: 'modal-text', type: 'text', rect: [100, 200, 600, 100], content: 'Surprise!' },
            ],
          },
          {
            id: 'banner',
            name: 'Banner',
            visible: true,
            objects: [
              { id: 'banner-text', type: 'text', rect: [10, 500, 800, 50], content: 'Always visible banner' },
            ],
          },
        ],
        triggers: [
          {
            id: 't1',
            event: { type: 'userClick', source: 'btn-show' },
            source: 'btn-show',
            action: { type: 'showLayer', target: 'modal' },
          },
          {
            id: 't2',
            event: { type: 'userClick', source: 'btn-hide' },
            source: 'btn-hide',
            action: { type: 'hideLayer', target: 'modal' },
          },
        ],
      },
      {
        id: 's2',
        title: 'Slide 2',
        background: { type: 'solid', color: '#FFF' },
        objects: [],
        layers: [],
        triggers: [],
      },
    ],
    variables: {},
    navigation: { entry: 's1', slides: ['s1', 's2'], arrows: true, progress: false },
    lms: { standard: 'html5' },
  };
}

function clickByText(container: HTMLElement, text: string): void {
  const btns = container.querySelectorAll('button');
  for (const b of Array.from(btns)) {
    if (b.textContent?.trim() === text) {
      b.click();
      return;
    }
  }
  throw new Error(`No button "${text}" found`);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Browser runtime layers: initial visibility', () => {
  it('renders base objects always', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    expect(container.textContent).toContain('Base layer content');
  });

  it('renders objects from layers whose visible=true initially', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    expect(container.textContent).toContain('Always visible banner');
  });

  it('does not render objects from layers whose visible=false initially', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    expect(container.textContent).not.toContain('Surprise!');
  });

  it('marks layer objects with data-layer-id', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    const banner = container.querySelector('[data-object-id="banner-text"]') as HTMLElement | null;
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('data-layer-id')).toBe('banner');
  });
});

describe('Browser runtime layers: showLayer / hideLayer triggers', () => {
  it('clicking the show button reveals the hidden layer', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    expect(container.textContent).not.toContain('Surprise!');
    clickByText(container, 'Show modal');
    expect(container.textContent).toContain('Surprise!');
  });

  it('clicking show then hide returns to the initial state', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    clickByText(container, 'Show modal');
    expect(container.textContent).toContain('Surprise!');
    clickByText(container, 'Close modal');
    expect(container.textContent).not.toContain('Surprise!');
  });

  it('isLayerVisible() reflects the toggle state', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    expect(rt.isLayerVisible!('modal')).toBe(false);
    clickByText(container, 'Show modal');
    expect(rt.isLayerVisible!('modal')).toBe(true);
    clickByText(container, 'Close modal');
    expect(rt.isLayerVisible!('modal')).toBe(false);
  });

  it('isLayerVisible returns true for initially-visible layers', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    expect(rt.isLayerVisible!('banner')).toBe(true);
  });

  it('isLayerVisible returns false for unknown layer ids', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    expect(rt.isLayerVisible!('does-not-exist')).toBe(false);
  });
});

describe('Browser runtime layers: programmatic API', () => {
  it('showLayer() reveals the layer', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    rt.showLayer!('modal');
    expect(container.textContent).toContain('Surprise!');
    expect(rt.isLayerVisible!('modal')).toBe(true);
  });

  it('hideLayer() hides the layer', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    rt.hideLayer!('banner');
    expect(container.textContent).not.toContain('Always visible banner');
    expect(rt.isLayerVisible!('banner')).toBe(false);
  });

  it('show/hide on unknown layer ids is a no-op', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    expect(() => rt.showLayer!('nope')).not.toThrow();
    expect(() => rt.hideLayer!('nope')).not.toThrow();
  });
});

describe('Browser runtime layers: state across navigation', () => {
  it('navigating away and back resets layer visibility to declared defaults', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: layeredCourse(), container });
    rt.start();
    clickByText(container, 'Show modal');
    expect(rt.isLayerVisible!('modal')).toBe(true);

    rt.navigateNext();   // go to s2
    rt.navigatePrev();   // come back to s1
    expect(rt.isLayerVisible!('modal')).toBe(false);
    expect(container.textContent).not.toContain('Surprise!');
  });
});

describe('Browser runtime layers: trigger interaction', () => {
  it('clicking a layer object can fire its own trigger', () => {
    // A layer object with a click trigger that hides another layer.
    const course = layeredCourse();
    type Slide = { layers?: Array<Record<string, unknown>>; triggers?: Array<Record<string, unknown>> };
    const slide = (course as { slides: Slide[] }).slides[0];
    slide.layers![0].visible = true; // make the modal initially visible
    slide.layers![0].objects = [
      { id: 'modal-close', type: 'button', rect: [100, 200, 200, 40], content: 'Dismiss' },
    ];
    slide.triggers!.push({
      id: 't3',
      event: { type: 'userClick', source: 'modal-close' },
      source: 'modal-close',
      action: { type: 'hideLayer', target: 'modal' },
    });

    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course, container });
    rt.start();
    expect(rt.isLayerVisible!('modal')).toBe(true);
    clickByText(container, 'Dismiss');
    expect(rt.isLayerVisible!('modal')).toBe(false);
  });
});
