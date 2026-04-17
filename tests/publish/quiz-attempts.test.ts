// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — quiz attempt limits
 *
 * The quiz config has `attemptsAllowed: number` (0 = unlimited) but the
 * runtime never enforced it: every submitQuiz fired regardless. A
 * compliance quiz configured with attemptsAllowed=3 accepted 30
 * submissions, defeating the certification gate.
 *
 * Behavior:
 * - attemptsAllowed = 0 → unlimited (preserves existing behavior)
 * - attemptsAllowed = N → first N submitQuiz calls produce a
 *   quizcomplete event + LMS push, subsequent calls emit
 *   quizattemptsexceeded and do nothing else
 * - getQuizAttemptCount() returns # of submissions so far
 * - isQuizExhausted() returns true when no attempts remain
 * - Resume from suspend data restores attempt count
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
  on(e: string, cb: (...a: unknown[]) => void): void;
  getQuizAttemptCount?(): number;
  isQuizExhausted?(): boolean;
  saveProgress?(): void;
}
function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function quizCourse(attemptsAllowed: number): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'qa', title: 'Q', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    quiz: {
      id: 'q', passingScore: 60, attemptsAllowed: attemptsAllowed, allowReview: false,
      questions: [{
        id: 'q1', type: 'multiple_choice', text: 'Pick A', points: 10,
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B', isCorrect: false },
        ],
      }],
    },
    slides: [{
      id: 's1', title: 'One', background: { type: 'solid', color: '#FFF' },
      objects: [
        { id: 'q1ui', type: 'quiz', rect: [0, 0, 100, 100], questionId: 'q1' },
        { id: 'sub', type: 'button', rect: [0, 110, 100, 30], content: 'Submit' },
      ],
      triggers: [{
        id: 'tsub', event: { type: 'userClick', source: 'sub' }, source: 'sub',
        action: { type: 'submitQuiz' },
      }],
    }],
    variables: {},
    navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
    lms: { standard: 'scorm12' },
  };
}

function pickAndSubmit(container: HTMLElement, optionId: string): void {
  const radio = container.querySelector(`input[type="radio"][value="${optionId}"]`) as HTMLInputElement;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  const btn = container.querySelector('button[data-object-id="sub"]') as HTMLButtonElement;
  btn.click();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Quiz attempts: getQuizAttemptCount', () => {
  it('starts at 0 before any submission', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: quizCourse(3), container: makeContainer() });
    rt.start();
    expect(rt.getQuizAttemptCount!()).toBe(0);
  });

  it('increments with each submitQuiz', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(3), container });
    rt.start();
    pickAndSubmit(container, 'a');
    expect(rt.getQuizAttemptCount!()).toBe(1);
    pickAndSubmit(container, 'a');
    expect(rt.getQuizAttemptCount!()).toBe(2);
  });
});

describe('Quiz attempts: enforcement when attemptsAllowed > 0', () => {
  it('emits quizcomplete on each of the first N attempts', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(2), container });
    rt.start();
    const events: unknown[] = [];
    rt.on('quizcomplete', (s: unknown) => events.push(s));
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a');
    expect(events).toHaveLength(2);
  });

  it('does NOT emit quizcomplete on attempt N+1', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(2), container });
    rt.start();
    const events: unknown[] = [];
    rt.on('quizcomplete', (s: unknown) => events.push(s));
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a'); // exceeded
    expect(events).toHaveLength(2);
  });

  it('emits quizattemptsexceeded on attempt N+1', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(2), container });
    rt.start();
    const events: unknown[] = [];
    rt.on('quizattemptsexceeded', (p: unknown) => events.push(p));
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a'); // exceeded
    expect(events).toHaveLength(1);
  });

  it('does NOT push to LMS on the rejected attempt', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const SaveScore = vi.fn();
    const SaveCompletion = vi.fn();
    const rt = new Ctor({
      course: quizCourse(1),
      container,
      lmsAdapter: { SaveScore, SaveCompletion },
    });
    rt.start();
    pickAndSubmit(container, 'a'); // attempt 1 (allowed)
    SaveScore.mockClear();
    SaveCompletion.mockClear();
    pickAndSubmit(container, 'a'); // attempt 2 (rejected)
    expect(SaveScore).not.toHaveBeenCalled();
    expect(SaveCompletion).not.toHaveBeenCalled();
  });

  it('does not increment attempt count on a rejected submission', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(1), container });
    rt.start();
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a'); // rejected
    pickAndSubmit(container, 'a'); // also rejected
    expect(rt.getQuizAttemptCount!()).toBe(1);
  });
});

describe('Quiz attempts: isQuizExhausted', () => {
  it('returns false before any attempt', () => {
    const Ctor = getRuntimeCtor();
    const rt = new Ctor({ course: quizCourse(2), container: makeContainer() });
    rt.start();
    expect(rt.isQuizExhausted!()).toBe(false);
  });

  it('returns true after N attempts', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(2), container });
    rt.start();
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a');
    expect(rt.isQuizExhausted!()).toBe(true);
  });
});

describe('Quiz attempts: unlimited mode (attemptsAllowed=0)', () => {
  it('never exhausts when attemptsAllowed=0', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(0), container });
    rt.start();
    const events: unknown[] = [];
    rt.on('quizcomplete', (s: unknown) => events.push(s));
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a');
    pickAndSubmit(container, 'a');
    expect(events).toHaveLength(4);
    expect(rt.isQuizExhausted!()).toBe(false);
  });
});

describe('Quiz attempts: persistence', () => {
  it('attempt count survives a runtime restart via suspend data', () => {
    let stored: Record<string, unknown> | null = null;
    const adapter = {
      LoadSuspendData: () => stored ?? {},
      SaveSuspendData: (s: Record<string, unknown>) => { stored = s; },
    };
    const Ctor = getRuntimeCtor();

    const container1 = makeContainer();
    const rt1 = new Ctor({ course: quizCourse(3), container: container1, lmsAdapter: adapter });
    rt1.start();
    pickAndSubmit(container1, 'a');
    pickAndSubmit(container1, 'a');
    expect(rt1.getQuizAttemptCount!()).toBe(2);

    document.body.innerHTML = '';
    const container2 = makeContainer();
    const rt2 = new Ctor({ course: quizCourse(3), container: container2, lmsAdapter: adapter });
    rt2.start();
    expect(rt2.getQuizAttemptCount!()).toBe(2);
    // One attempt left:
    pickAndSubmit(container2, 'a');
    expect(rt2.isQuizExhausted!()).toBe(true);
  });
});
