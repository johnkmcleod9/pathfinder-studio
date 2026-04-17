// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — auto-completion
 *
 * Info-only courses (no quiz) need a way to be marked complete in the
 * LMS gradebook. Without this, an entire category of LMS content
 * (compliance reading, policy acknowledgements, intro material) sits
 * permanently at "incomplete" no matter how many times the learner
 * goes through it.
 *
 * Behavior:
 * - First time the learner reaches the last slide → call
 *   lmsAdapter.SaveCompletion('completed') and emit 'coursecomplete'
 * - Idempotent: revisiting the last slide does not push again
 * - Quiz courses: NOT auto-completed on last slide — quiz pass/fail
 *   already drives SaveCompletion via the existing quizcomplete path,
 *   and we don't want to overwrite it
 * - Adapter without SaveCompletion → silent no-op
 * - Adapter SaveCompletion throws → swallowed + logged
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
  navigateNext(): void;
  navigatePrev(): void;
  on(e: string, cb: (...a: unknown[]) => void): void;
  isComplete?(): boolean;
}
function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function infoCourse(slideCount: number): Record<string, unknown> {
  const slides: Array<Record<string, unknown>> = [];
  const ids: string[] = [];
  for (let i = 1; i <= slideCount; i++) {
    slides.push({
      id: 's' + i, title: 'Slide ' + i,
      background: { type: 'solid', color: '#FFF' },
      objects: [], triggers: [],
    });
    ids.push('s' + i);
  }
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'ac', title: 'A', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides,
    variables: {},
    navigation: { entry: 's1', slides: ids, arrows: true, progress: false },
    lms: { standard: 'scorm12' },
  };
}

function quizCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'qc', title: 'Q', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    quiz: {
      id: 'q', passingScore: 50, attemptsAllowed: 0, allowReview: false,
      questions: [{
        id: 'q1', type: 'multiple_choice', text: 'Pick A', points: 10,
        options: [{ id: 'a', text: 'A', isCorrect: true }],
      }],
    },
    slides: [
      { id: 's1', title: 'One', background: { type: 'solid', color: '#FFF' }, objects: [], triggers: [] },
      { id: 's2', title: 'Two', background: { type: 'solid', color: '#FFF' }, objects: [], triggers: [] },
    ],
    variables: {},
    navigation: { entry: 's1', slides: ['s1', 's2'], arrows: true, progress: false },
    lms: { standard: 'scorm12' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Auto-completion: info-only course (no quiz)', () => {
  it('does NOT mark complete on start', () => {
    const Ctor = getRuntimeCtor();
    const SaveCompletion = vi.fn();
    const rt = new Ctor({
      course: infoCourse(3),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion },
    });
    rt.start();
    expect(SaveCompletion).not.toHaveBeenCalled();
  });

  it('does NOT mark complete on intermediate slides', () => {
    const Ctor = getRuntimeCtor();
    const SaveCompletion = vi.fn();
    const rt = new Ctor({
      course: infoCourse(3),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion },
    });
    rt.start();
    rt.navigateNext(); // s2
    expect(SaveCompletion).not.toHaveBeenCalled();
  });

  it('marks complete the first time the learner reaches the last slide', () => {
    const Ctor = getRuntimeCtor();
    const SaveCompletion = vi.fn();
    const rt = new Ctor({
      course: infoCourse(3),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion },
    });
    rt.start();
    rt.navigateNext(); // s2
    rt.navigateNext(); // s3 (last)
    expect(SaveCompletion).toHaveBeenCalledTimes(1);
    expect(SaveCompletion).toHaveBeenCalledWith('completed');
  });

  it('emits "coursecomplete" event when auto-completion fires', () => {
    const Ctor = getRuntimeCtor();
    const events: unknown[] = [];
    const rt = new Ctor({
      course: infoCourse(2),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion: vi.fn() },
    });
    rt.on('coursecomplete', (payload: unknown) => events.push(payload));
    rt.start();
    rt.navigateNext(); // last
    expect(events).toHaveLength(1);
  });

  it('is idempotent: revisiting the last slide does not push again', () => {
    const Ctor = getRuntimeCtor();
    const SaveCompletion = vi.fn();
    const rt = new Ctor({
      course: infoCourse(3),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion },
    });
    rt.start();
    rt.navigateNext(); rt.navigateNext(); // first reach
    rt.navigatePrev(); rt.navigateNext(); // second reach
    expect(SaveCompletion).toHaveBeenCalledTimes(1);
  });

  it('isComplete() returns true after auto-completion', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({
      course: infoCourse(2),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion: vi.fn() },
    });
    expect(rt.isComplete!()).toBe(false);
    rt.start();
    rt.navigateNext();
    expect(rt.isComplete!()).toBe(true);
  });
});

describe('Auto-completion: quiz course', () => {
  it('does NOT auto-complete on reaching last slide (quiz drives completion)', () => {
    const Ctor = getRuntimeCtor();
    const SaveCompletion = vi.fn();
    const rt = new Ctor({
      course: quizCourse(),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion },
    });
    rt.start();
    rt.navigateNext(); // last slide
    expect(SaveCompletion).not.toHaveBeenCalled();
  });
});

describe('Auto-completion: edge cases', () => {
  it('single-slide course completes immediately on start', () => {
    const Ctor = getRuntimeCtor();
    const SaveCompletion = vi.fn();
    const rt = new Ctor({
      course: infoCourse(1),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion },
    });
    rt.start();
    expect(SaveCompletion).toHaveBeenCalledWith('completed');
  });

  it('no-adapter scenario does not throw', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: infoCourse(2), container: makeContainer() });
    rt.start();
    expect(() => rt.navigateNext()).not.toThrow();
  });

  it('does not throw when SaveCompletion throws', () => {
    const Ctor = getRuntimeCtor();
    const SaveCompletion = vi.fn(() => { throw new Error('LMS down'); });
    const rt = new Ctor({
      course: infoCourse(2),
      container: makeContainer(),
      lmsAdapter: { SaveCompletion },
    });
    rt.start();
    expect(() => rt.navigateNext()).not.toThrow();
  });

  it('adapter without SaveCompletion still emits coursecomplete event', () => {
    const Ctor = getRuntimeCtor();
    const events: unknown[] = [];
    const rt = new Ctor({
      course: infoCourse(2),
      container: makeContainer(),
      lmsAdapter: {}, // no SaveCompletion
    });
    rt.on('coursecomplete', (p: unknown) => events.push(p));
    rt.start();
    rt.navigateNext();
    expect(events).toHaveLength(1);
  });
});
