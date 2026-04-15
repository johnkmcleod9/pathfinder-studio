// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — quiz support
 *
 * The runtime renders inline quiz questions defined under
 * `course.quiz.questions` and referenced from a slide via an object of
 * `type: 'quiz'` with a `questionId`.  When the user selects an answer
 * and triggers a `submitQuiz` action, the runtime scores the response,
 * emits `quizcomplete` with {score, passed, attempts}, and forwards the
 * score to the LMS adapter when one exposes `SaveScore`.
 *
 * Supported question types: multiple_choice, true_false, fill_blank,
 * multiple_response.  Anything else falls back to "incorrect".
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
  on(event: string, cb: (...args: unknown[]) => void): void;
  getQuizScore?(): { percent: number; passed: boolean; raw: number; possible: number } | null;
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

function quizCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'qc', title: 'Q', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    quiz: {
      id: 'quiz-1',
      passingScore: 60,
      attemptsAllowed: 0,
      allowReview: true,
      questions: [
        {
          id: 'q-mc',
          type: 'multiple_choice',
          text: 'Pick blue',
          points: 10,
          options: [
            { id: 'a', text: 'red', isCorrect: false },
            { id: 'b', text: 'blue', isCorrect: true },
            { id: 'c', text: 'green', isCorrect: false },
          ],
        },
        {
          id: 'q-tf',
          type: 'true_false',
          text: 'Sky is blue',
          points: 10,
          options: [
            { id: 't', text: 'true', isCorrect: true },
            { id: 'f', text: 'false', isCorrect: false },
          ],
        },
        {
          id: 'q-fb',
          type: 'fill_blank',
          text: 'Capital of France?',
          points: 10,
          correctAnswer: 'Paris',
        },
        {
          id: 'q-mr',
          type: 'multiple_response',
          text: 'Pick all primary colors',
          points: 10,
          options: [
            { id: 'a', text: 'red', isCorrect: true },
            { id: 'b', text: 'blue', isCorrect: true },
            { id: 'c', text: 'orange', isCorrect: false },
            { id: 'd', text: 'yellow', isCorrect: true },
          ],
        },
      ],
    },
    slides: [
      {
        id: 's1',
        title: 'Quiz',
        background: { type: 'solid', color: '#FFF' },
        objects: [
          { id: 'qmc', type: 'quiz', rect: [10, 10, 600, 200], questionId: 'q-mc' },
          { id: 'qtf', type: 'quiz', rect: [10, 220, 600, 100], questionId: 'q-tf' },
          { id: 'qfb', type: 'quiz', rect: [10, 330, 600, 100], questionId: 'q-fb' },
          { id: 'qmr', type: 'quiz', rect: [10, 440, 600, 200], questionId: 'q-mr' },
          { id: 'submit', type: 'button', rect: [10, 650, 200, 50], content: 'Submit' },
        ],
        triggers: [
          {
            id: 'tsubmit',
            event: { type: 'userClick', source: 'submit' },
            source: 'submit',
            action: { type: 'submitQuiz' },
          },
        ],
      },
    ],
    variables: {},
    navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
    lms: { standard: 'html5' },
  };
}

function clickButtonByText(container: HTMLElement, text: string): void {
  const btns = container.querySelectorAll('button');
  for (const b of Array.from(btns)) {
    if (b.textContent?.trim() === text) {
      b.click();
      return;
    }
  }
  throw new Error(`No button with text "${text}" found`);
}

function pickOption(container: HTMLElement, questionId: string, optionId: string): void {
  const root = container.querySelector(`[data-object-id][data-question-id="${questionId}"]`);
  if (!root) throw new Error(`No quiz UI for ${questionId}`);
  const inputs = root.querySelectorAll('input');
  for (const i of Array.from(inputs)) {
    if (i.value === optionId) {
      (i as HTMLInputElement).checked = true;
      i.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
  throw new Error(`No option ${optionId} for question ${questionId}`);
}

function fillBlank(container: HTMLElement, questionId: string, value: string): void {
  const root = container.querySelector(`[data-object-id][data-question-id="${questionId}"]`);
  if (!root) throw new Error(`No quiz UI for ${questionId}`);
  const input = root.querySelector('input[type="text"]') as HTMLInputElement | null;
  if (!input) throw new Error(`No text input for question ${questionId}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Browser runtime quiz: rendering', () => {
  it('renders a multiple_choice question with each option as a radio', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    const root = container.querySelector('[data-question-id="q-mc"]');
    expect(root).not.toBeNull();
    const radios = root!.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(3);
  });

  it('renders the question text', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    expect(container.textContent).toContain('Pick blue');
    expect(container.textContent).toContain('Capital of France?');
  });

  it('renders multiple_response options as checkboxes', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    const root = container.querySelector('[data-question-id="q-mr"]');
    const checks = root!.querySelectorAll('input[type="checkbox"]');
    expect(checks.length).toBe(4);
  });

  it('renders fill_blank as a text input', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    const root = container.querySelector('[data-question-id="q-fb"]');
    expect(root!.querySelector('input[type="text"]')).not.toBeNull();
  });

  it('groups radio buttons by question (same name attribute)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    const root = container.querySelector('[data-question-id="q-mc"]');
    const radios = Array.from(root!.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    const names = new Set(radios.map((r) => r.name));
    expect(names.size).toBe(1);
  });
});

describe('Browser runtime quiz: scoring', () => {
  it('emits quizcomplete with passed=true when all answers correct', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    pickOption(container, 'q-mc', 'b');
    pickOption(container, 'q-tf', 't');
    fillBlank(container, 'q-fb', 'Paris');
    pickOption(container, 'q-mr', 'a');
    pickOption(container, 'q-mr', 'b');
    pickOption(container, 'q-mr', 'd');

    const events: Array<{ percent: number; passed: boolean }> = [];
    rt.on('quizcomplete', (score: unknown) => {
      events.push(score as { percent: number; passed: boolean });
    });
    clickButtonByText(container, 'Submit');

    expect(events).toHaveLength(1);
    expect(events[0].passed).toBe(true);
    expect(events[0].percent).toBe(100);
  });

  it('emits quizcomplete with passed=false when below passing score', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    // Get only 1 of 4 right (25%) — below the 60% passing threshold.
    pickOption(container, 'q-mc', 'b'); // correct (10/40)
    pickOption(container, 'q-tf', 'f'); // wrong
    fillBlank(container, 'q-fb', 'London'); // wrong

    const events: Array<{ percent: number; passed: boolean }> = [];
    rt.on('quizcomplete', (score: unknown) => {
      events.push(score as { percent: number; passed: boolean });
    });
    clickButtonByText(container, 'Submit');

    expect(events).toHaveLength(1);
    expect(events[0].passed).toBe(false);
    expect(events[0].percent).toBeLessThan(60);
  });

  it('treats fill_blank as case-insensitive by default', () => {
    const course = quizCourse();
    // Single question quiz to make scoring deterministic.
    (course as { quiz: { questions: unknown[] } }).quiz.questions =
      [(course as { quiz: { questions: unknown[] } }).quiz.questions[2]];
    (course as { slides: Array<{ objects: unknown[] }> }).slides[0].objects =
      [
        { id: 'qfb', type: 'quiz', rect: [10, 10, 200, 100], questionId: 'q-fb' },
        { id: 'submit', type: 'button', rect: [10, 200, 200, 50], content: 'Submit' },
      ];
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course, container });
    rt.start();
    fillBlank(container, 'q-fb', 'paris');

    const events: Array<{ passed: boolean }> = [];
    rt.on('quizcomplete', (score: unknown) => {
      events.push(score as { passed: boolean });
    });
    clickButtonByText(container, 'Submit');
    expect(events[0].passed).toBe(true);
  });

  it('multiple_response: gives no credit when extra wrong option is selected', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    // Correct answer is {a, b, d}. Pick {a, b, c} — c is wrong.
    pickOption(container, 'q-mc', 'b');
    pickOption(container, 'q-tf', 't');
    fillBlank(container, 'q-fb', 'Paris');
    pickOption(container, 'q-mr', 'a');
    pickOption(container, 'q-mr', 'b');
    pickOption(container, 'q-mr', 'c'); // wrong inclusion

    const events: Array<{ raw: number; possible: number }> = [];
    rt.on('quizcomplete', (score: unknown) => {
      events.push(score as { raw: number; possible: number });
    });
    clickButtonByText(container, 'Submit');
    // 30 of 40 (we got mc, tf, fb correct; mr wrong).
    expect(events[0].raw).toBe(30);
    expect(events[0].possible).toBe(40);
  });

  it('exposes the last score via getQuizScore() after submit', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container });
    rt.start();
    expect(rt.getQuizScore && rt.getQuizScore()).toBeNull();
    pickOption(container, 'q-mc', 'b');
    pickOption(container, 'q-tf', 't');
    fillBlank(container, 'q-fb', 'Paris');
    pickOption(container, 'q-mr', 'a');
    pickOption(container, 'q-mr', 'b');
    pickOption(container, 'q-mr', 'd');
    clickButtonByText(container, 'Submit');
    const score = rt.getQuizScore!();
    expect(score).not.toBeNull();
    expect(score!.percent).toBe(100);
    expect(score!.passed).toBe(true);
  });
});

describe('Browser runtime quiz: LMS adapter wiring', () => {
  it('calls lmsAdapter.SaveScore(raw, min, max, scaled) on submit when present', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const SaveScore = vi.fn();
    const SaveCompletion = vi.fn();
    const lmsAdapter = { SaveScore, SaveCompletion };
    const rt = new Ctor({ course: quizCourse(), container, lmsAdapter });
    rt.start();
    pickOption(container, 'q-mc', 'b');
    pickOption(container, 'q-tf', 't');
    fillBlank(container, 'q-fb', 'Paris');
    pickOption(container, 'q-mr', 'a');
    pickOption(container, 'q-mr', 'b');
    pickOption(container, 'q-mr', 'd');
    clickButtonByText(container, 'Submit');

    expect(SaveScore).toHaveBeenCalledTimes(1);
    const args = SaveScore.mock.calls[0];
    expect(args[0]).toBe(40); // raw
    expect(args[1]).toBe(0);  // min
    expect(args[2]).toBe(40); // max
    expect(args[3]).toBe(1);  // scaled (0..1)
  });

  it('calls lmsAdapter.SaveCompletion("passed") when score >= passing', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const SaveCompletion = vi.fn();
    const lmsAdapter = { SaveScore: vi.fn(), SaveCompletion };
    const rt = new Ctor({ course: quizCourse(), container, lmsAdapter });
    rt.start();
    pickOption(container, 'q-mc', 'b');
    pickOption(container, 'q-tf', 't');
    fillBlank(container, 'q-fb', 'Paris');
    pickOption(container, 'q-mr', 'a');
    pickOption(container, 'q-mr', 'b');
    pickOption(container, 'q-mr', 'd');
    clickButtonByText(container, 'Submit');
    expect(SaveCompletion).toHaveBeenCalledWith('passed');
  });

  it('calls lmsAdapter.SaveCompletion("failed") when score below passing', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const SaveCompletion = vi.fn();
    const lmsAdapter = { SaveScore: vi.fn(), SaveCompletion };
    const rt = new Ctor({ course: quizCourse(), container, lmsAdapter });
    rt.start();
    // No answers picked → 0%
    clickButtonByText(container, 'Submit');
    expect(SaveCompletion).toHaveBeenCalledWith('failed');
  });

  it('does not throw when adapter has no SaveScore method', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: quizCourse(), container, lmsAdapter: {} });
    rt.start();
    pickOption(container, 'q-mc', 'b');
    expect(() => clickButtonByText(container, 'Submit')).not.toThrow();
  });
});
