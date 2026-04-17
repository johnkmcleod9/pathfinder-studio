// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — ARIA / screen reader support
 *
 * The keyboard navigation commit gave keyboard-only learners a way to
 * MOVE through the course; this commit gives screen-reader users a
 * way to KNOW where they are and what's around them. Together they
 * complete the WCAG 2.1 AA operability + perceivability story.
 *
 * Behavior:
 * - Slide wrapper: role="region", aria-label="Slide N of M: <title>",
 *   aria-live="polite" so a screen reader announces transitions
 * - Buttons: aria-label from content text (so screen reader gets the
 *   accessible name even when the visible text is iconographic)
 * - Quiz questions: wrapped in <fieldset><legend> so the radio group
 *   reads as "Question text — option 1, option 2..."
 * - Image objects: alt attribute mirrored from obj.altText (already
 *   was) and role="img" if the alt is empty
 * - Decorative content (shape with no content): aria-hidden="true"
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
}
function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function ariaCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'ac', title: 'A', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: [
      {
        id: 's1', title: 'Welcome',
        background: { type: 'solid', color: '#FFF' },
        objects: [
          { id: 'btn', type: 'button', rect: [0, 0, 100, 30], content: 'Continue' },
          { id: 'img', type: 'image', rect: [0, 40, 100, 100], src: 'img/x.png', altText: 'A whale' },
          { id: 'decoration', type: 'shape', rect: [0, 150, 100, 100] },
        ],
        triggers: [],
      },
      {
        id: 's2', title: 'Quiz',
        background: { type: 'solid', color: '#FFF' },
        objects: [
          { id: 'qmc', type: 'quiz', rect: [0, 0, 200, 100], questionId: 'q1' },
        ],
        triggers: [],
      },
    ],
    quiz: {
      id: 'q', passingScore: 60, attemptsAllowed: 0, allowReview: true,
      questions: [{
        id: 'q1', type: 'multiple_choice', text: 'Pick A', points: 10,
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B', isCorrect: false },
        ],
      }],
    },
    variables: {},
    navigation: { entry: 's1', slides: ['s1', 's2'], arrows: true, progress: false },
    lms: { standard: 'html5' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ARIA: slide wrapper attributes', () => {
  it('sets role="region" on the slide wrapper', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('role')).toBe('region');
  });

  it('sets aria-live="polite" so transitions are announced', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('aria-live')).toBe('polite');
  });

  it('sets aria-label = "Slide N of M: <title>"', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('aria-label')).toBe('Slide 1 of 2: Welcome');
  });

  it('updates aria-label after navigating', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    rt.navigateNext();
    const slide = container.querySelector('[data-slide-id]') as HTMLElement;
    expect(slide.getAttribute('aria-label')).toBe('Slide 2 of 2: Quiz');
  });
});

describe('ARIA: button accessible names', () => {
  it('sets aria-label on a button to its visible content', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    const btn = container.querySelector('[data-object-id="btn"]') as HTMLElement;
    expect(btn.getAttribute('aria-label')).toBe('Continue');
  });
});

describe('ARIA: image objects', () => {
  it('mirrors altText into the alt attribute', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    const img = container.querySelector('[data-object-id="img"]') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('A whale');
  });

  it('marks decorative shapes (no content) as aria-hidden', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    const dec = container.querySelector('[data-object-id="decoration"]') as HTMLElement;
    expect(dec.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('ARIA: quiz question grouping', () => {
  it('renders the question inside a <fieldset>', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    rt.navigateNext(); // to quiz slide
    const fieldset = container.querySelector('[data-question-id="q1"] fieldset');
    expect(fieldset).not.toBeNull();
  });

  it('puts the question text in a <legend>', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    rt.navigateNext();
    const legend = container.querySelector('[data-question-id="q1"] legend') as HTMLElement | null;
    expect(legend).not.toBeNull();
    expect(legend!.textContent).toBe('Pick A');
  });

  it('labels each option for its radio input via <label for="...">', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: ariaCourse(), container });
    rt.start();
    rt.navigateNext();
    const radios = container.querySelectorAll('[data-question-id="q1"] input[type="radio"]');
    for (const r of Array.from(radios)) {
      const id = r.getAttribute('id');
      expect(id).toBeTruthy();
      const label = container.querySelector(`label[for="${id}"]`);
      expect(label).not.toBeNull();
    }
  });
});
