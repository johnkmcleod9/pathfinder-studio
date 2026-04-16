// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — matching + sequencing quiz types
 *
 * matching:   learner pairs items to targets via <select> dropdowns
 *             (accessible, keyboard-friendly, no drag-drop needed)
 * sequencing: learner orders items with up/down buttons
 *
 * Each is rendered by _renderQuizQuestion when the question's `type`
 * matches. Scoring is handled in _isCorrect.
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
  new (opts: { course: unknown; container: HTMLElement }): RuntimeInstance;
}
interface RuntimeInstance {
  start(): void;
  on(e: string, cb: (...a: unknown[]) => void): void;
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

function matchingCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'mq', title: 'M', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    quiz: {
      id: 'q', passingScore: 50, attemptsAllowed: 0, allowReview: true,
      questions: [
        {
          id: 'q-match',
          type: 'matching',
          text: 'Match the capital to the country',
          points: 10,
          options: [
            { id: 'paris', text: 'Paris', matchTarget: 'france' },
            { id: 'tokyo', text: 'Tokyo', matchTarget: 'japan' },
            { id: 'berlin', text: 'Berlin', matchTarget: 'germany' },
          ],
          matchTargets: [
            { id: 'france', text: 'France' },
            { id: 'japan', text: 'Japan' },
            { id: 'germany', text: 'Germany' },
          ],
        },
      ],
    },
    slides: [{
      id: 's1', title: 'Quiz',
      background: { type: 'solid', color: '#FFF' },
      objects: [
        { id: 'qm', type: 'quiz', rect: [0, 0, 600, 300], questionId: 'q-match' },
        { id: 'sub', type: 'button', rect: [0, 310, 100, 30], content: 'Submit' },
      ],
      triggers: [{
        id: 'ts', event: { type: 'userClick', source: 'sub' }, source: 'sub',
        action: { type: 'submitQuiz' },
      }],
    }],
    variables: {},
    navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
    lms: { standard: 'html5' },
  };
}

function sequencingCourse(): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'sq', title: 'S', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    quiz: {
      id: 'q', passingScore: 50, attemptsAllowed: 0, allowReview: true,
      questions: [
        {
          id: 'q-seq',
          type: 'sequencing',
          text: 'Put these in chronological order',
          points: 10,
          options: [
            { id: 'b', text: 'Middle' },
            { id: 'c', text: 'Last' },
            { id: 'a', text: 'First' },
          ],
          correctSequence: ['a', 'b', 'c'],
        },
      ],
    },
    slides: [{
      id: 's1', title: 'Quiz',
      background: { type: 'solid', color: '#FFF' },
      objects: [
        { id: 'qs', type: 'quiz', rect: [0, 0, 600, 300], questionId: 'q-seq' },
        { id: 'sub', type: 'button', rect: [0, 310, 100, 30], content: 'Submit' },
      ],
      triggers: [{
        id: 'ts', event: { type: 'userClick', source: 'sub' }, source: 'sub',
        action: { type: 'submitQuiz' },
      }],
    }],
    variables: {},
    navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
    lms: { standard: 'html5' },
  };
}

function selectMatch(container: HTMLElement, itemId: string, targetId: string): void {
  const sel = container.querySelector(`select[data-item-id="${itemId}"]`) as HTMLSelectElement;
  if (!sel) throw new Error(`No select for item ${itemId}`);
  sel.value = targetId;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickSubmit(container: HTMLElement): void {
  const btn = container.querySelector('button[data-object-id="sub"]') as HTMLButtonElement;
  btn.click();
}

function clickMoveUp(container: HTMLElement, optionId: string): void {
  const item = container.querySelector(`[data-seq-item="${optionId}"]`) as HTMLElement;
  if (!item) throw new Error(`No seq item ${optionId}`);
  const upBtn = item.querySelector('[data-action="up"]') as HTMLButtonElement;
  upBtn.click();
}

// ── Matching ─────────────────────────────────────────────────────────────────

describe('Browser runtime quiz: matching rendering', () => {
  it('renders one <select> per match item', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: matchingCourse(), container });
    rt.start();
    const selects = container.querySelectorAll('[data-question-id="q-match"] select');
    expect(selects.length).toBe(3);
  });

  it('each <select> has options for every match target + blank default', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: matchingCourse(), container });
    rt.start();
    const sel = container.querySelector('select[data-item-id="paris"]') as HTMLSelectElement;
    // Blank + france + japan + germany = 4 options
    expect(sel.options.length).toBe(4);
  });

  it('shows the item text as the label next to the select', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: matchingCourse(), container });
    rt.start();
    expect(container.textContent).toContain('Paris');
    expect(container.textContent).toContain('Tokyo');
  });
});

describe('Browser runtime quiz: matching scoring', () => {
  it('scores 100% when all pairs are correct', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const events: Array<{ percent: number }> = [];
    const rt = new Ctor({ course: matchingCourse(), container });
    rt.on('quizcomplete', (s: unknown) => events.push(s as { percent: number }));
    rt.start();
    selectMatch(container, 'paris', 'france');
    selectMatch(container, 'tokyo', 'japan');
    selectMatch(container, 'berlin', 'germany');
    clickSubmit(container);
    expect(events[0].percent).toBe(100);
  });

  it('scores 0% when all pairs are wrong', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const events: Array<{ percent: number }> = [];
    const rt = new Ctor({ course: matchingCourse(), container });
    rt.on('quizcomplete', (s: unknown) => events.push(s as { percent: number }));
    rt.start();
    selectMatch(container, 'paris', 'japan');
    selectMatch(container, 'tokyo', 'germany');
    selectMatch(container, 'berlin', 'france');
    clickSubmit(container);
    expect(events[0].percent).toBe(0);
  });

  it('scores 0% when no selections made', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const events: Array<{ percent: number }> = [];
    const rt = new Ctor({ course: matchingCourse(), container });
    rt.on('quizcomplete', (s: unknown) => events.push(s as { percent: number }));
    rt.start();
    clickSubmit(container);
    expect(events[0].percent).toBe(0);
  });
});

// ── Sequencing ──────────────────────────────────────────────────────────────

describe('Browser runtime quiz: sequencing rendering', () => {
  it('renders each option as a list item with up/down buttons', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: sequencingCourse(), container });
    rt.start();
    const items = container.querySelectorAll('[data-seq-item]');
    expect(items.length).toBe(3);
    for (const item of Array.from(items)) {
      expect(item.querySelector('[data-action="up"]')).not.toBeNull();
      expect(item.querySelector('[data-action="down"]')).not.toBeNull();
    }
  });

  it('shows the option text in the item', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: sequencingCourse(), container });
    rt.start();
    expect(container.textContent).toContain('Middle');
    expect(container.textContent).toContain('Last');
    expect(container.textContent).toContain('First');
  });
});

describe('Browser runtime quiz: sequencing reorder', () => {
  it('clicking up moves an item one position earlier', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: sequencingCourse(), container });
    rt.start();
    // Initial order: b, c, a (as declared in options)
    // Move 'a' (currently 3rd) up once → b, a, c
    clickMoveUp(container, 'a');
    const items = Array.from(container.querySelectorAll('[data-seq-item]'));
    const ids = items.map((el) => el.getAttribute('data-seq-item'));
    expect(ids).toEqual(['b', 'a', 'c']);
  });
});

describe('Browser runtime quiz: sequencing scoring', () => {
  it('scores 100% when order matches correctSequence', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const events: Array<{ percent: number }> = [];
    const rt = new Ctor({ course: sequencingCourse(), container });
    rt.on('quizcomplete', (s: unknown) => events.push(s as { percent: number }));
    rt.start();
    // Initial: b, c, a. Target: a, b, c.
    // Move 'a' up twice to get: a, b, c
    clickMoveUp(container, 'a'); // b, a, c
    clickMoveUp(container, 'a'); // a, b, c
    clickSubmit(container);
    expect(events[0].percent).toBe(100);
  });

  it('scores 0% when order is completely wrong', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const events: Array<{ percent: number }> = [];
    const rt = new Ctor({ course: sequencingCourse(), container });
    rt.on('quizcomplete', (s: unknown) => events.push(s as { percent: number }));
    rt.start();
    // Initial: b, c, a — not matching a, b, c
    clickSubmit(container);
    expect(events[0].percent).toBe(0);
  });
});
