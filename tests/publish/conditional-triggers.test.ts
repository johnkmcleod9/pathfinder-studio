// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — conditional triggers
 *
 * A trigger may carry a `conditions: ConditionIR[]` array. The runtime
 * must evaluate every condition (AND-combined) against the current
 * variable + quiz state before firing the action.  Without this the
 * trigger fires unconditionally — silently breaking branching scenarios
 * like "if Score > 80 jump to passed slide".
 *
 * Condition types:
 *   variableEquals       — strict equality
 *   variableGreaterThan  — numeric >
 *   variableLessThan     — numeric <
 *   scoreGreaterThan     — last quiz score percent >
 *   scoreLessThan        — last quiz score percent <
 *
 * Multiple conditions are AND-combined.  Empty / missing conditions
 * means "fire unconditionally" (preserves backwards compatibility with
 * triggers compiled before this change).
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
  on(e: string, cb: (...a: unknown[]) => void): void;
  setVariable(name: string, value: unknown): void;
  getVariable(name: string): unknown;
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

// ---- Fixture ----

interface SlideTrigger {
  id: string;
  event: { type: string; source?: string };
  source?: string;
  action: Record<string, unknown>;
  conditions?: Array<Record<string, unknown>>;
}

function courseWithCondition(triggerOverrides: SlideTrigger): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'cc', title: 'C', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: [
      {
        id: 's1',
        title: 'One',
        background: { type: 'solid', color: '#FFF' },
        objects: [
          { id: 'btn', type: 'button', rect: [10, 10, 200, 40], content: 'Go' },
        ],
        triggers: [triggerOverrides],
      },
      { id: 's2', title: 'Two', background: { type: 'solid', color: '#FFF' }, objects: [], triggers: [] },
      { id: 's3', title: 'Three', background: { type: 'solid', color: '#FFF' }, objects: [], triggers: [] },
    ],
    variables: {
      Score: { type: 'number', default: 0, scope: 'course' },
      Name: { type: 'text', default: '', scope: 'course' },
      Done: { type: 'boolean', default: false, scope: 'course' },
    },
    navigation: { entry: 's1', slides: ['s1', 's2', 's3'], arrows: false, progress: false },
    lms: { standard: 'html5' },
  };
}

function clickGo(container: HTMLElement): void {
  const btn = container.querySelector('button[data-object-id="btn"]') as HTMLButtonElement;
  btn.click();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Browser runtime conditions: backwards compatibility', () => {
  it('fires the action when conditions array is missing (current behaviour preserved)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
      }),
      container,
    });
    rt.start();
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('fires the action when conditions array is empty', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [],
      }),
      container,
    });
    rt.start();
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s2');
  });
});

describe('Browser runtime conditions: variableEquals', () => {
  const trigger = (target: string): SlideTrigger => ({
    id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
    action: { type: 'jumpToSlide', target },
    conditions: [{ type: 'variableEquals', variable: 'Name', value: 'Alice' }],
  });

  it('fires when the variable matches the value exactly', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: courseWithCondition(trigger('s2')), container });
    rt.start();
    rt.setVariable('Name', 'Alice');
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('does NOT fire when the variable is a different value', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: courseWithCondition(trigger('s2')), container });
    rt.start();
    rt.setVariable('Name', 'Bob');
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('does NOT fire when the variable is undefined', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: courseWithCondition(trigger('s2')), container });
    rt.start();
    // Leave Name at its default ''
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('handles boolean equality', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [{ type: 'variableEquals', variable: 'Done', value: true }],
      }),
      container,
    });
    rt.start();
    rt.setVariable('Done', true);
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s2');
  });
});

describe('Browser runtime conditions: variableGreaterThan / variableLessThan', () => {
  it('variableGreaterThan fires when value strictly exceeds threshold', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [{ type: 'variableGreaterThan', variable: 'Score', value: 80 }],
      }),
      container,
    });
    rt.start();
    rt.setVariable('Score', 90);
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('variableGreaterThan does NOT fire on equality (strict >)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [{ type: 'variableGreaterThan', variable: 'Score', value: 80 }],
      }),
      container,
    });
    rt.start();
    rt.setVariable('Score', 80);
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('variableLessThan fires when value strictly below threshold', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [{ type: 'variableLessThan', variable: 'Score', value: 50 }],
      }),
      container,
    });
    rt.start();
    rt.setVariable('Score', 25);
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('treats non-numeric variable as not greater-than (no NaN comparisons firing)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [{ type: 'variableGreaterThan', variable: 'Name', value: 5 }],
      }),
      container,
    });
    rt.start();
    rt.setVariable('Name', 'not a number');
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s1');
  });
});

describe('Browser runtime conditions: scoreGreaterThan / scoreLessThan', () => {
  // Quiz support is already wired — we set a fake lastQuizScore by
  // submitting a tiny quiz first. But cleaner: courseWithQuiz +
  // direct submit. For brevity here we simulate by jamming a score
  // through a quiz submit trigger:
  function courseWithScoreCheck(condType: 'scoreGreaterThan' | 'scoreLessThan', threshold: number): Record<string, unknown> {
    return {
      format: 'pathfinder-v1',
      metadata: { id: 'sq', title: 'SQ', author: 'A', language: 'en' },
      canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
      quiz: {
        id: 'q', passingScore: 50, attemptsAllowed: 0, allowReview: false,
        questions: [
          { id: 'q1', type: 'multiple_choice', text: 'Pick A', points: 10,
            options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }] },
        ],
      },
      slides: [{
        id: 's1', title: 'One', background: { type: 'solid', color: '#FFF' },
        objects: [
          { id: 'q1ui', type: 'quiz', rect: [0, 0, 100, 100], questionId: 'q1' },
          { id: 'sub', type: 'button', rect: [0, 110, 100, 30], content: 'Submit' },
          { id: 'btn', type: 'button', rect: [0, 150, 100, 30], content: 'Go' },
        ],
        triggers: [
          { id: 'tsubmit', event: { type: 'userClick', source: 'sub' }, source: 'sub', action: { type: 'submitQuiz' } },
          { id: 'tgo', event: { type: 'userClick', source: 'btn' }, source: 'btn',
            action: { type: 'jumpToSlide', target: 's2' },
            conditions: [{ type: condType, scoreThreshold: threshold }] },
        ],
      }, { id: 's2', title: 'Two', background: { type: 'solid', color: '#FFF' }, objects: [], triggers: [] }],
      variables: {},
      navigation: { entry: 's1', slides: ['s1', 's2'], arrows: false, progress: false },
      lms: { standard: 'html5' },
    };
  }

  it('scoreGreaterThan fires when last quiz score percent exceeds threshold', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: courseWithScoreCheck('scoreGreaterThan', 50), container });
    rt.start();
    // Pick correct answer → 100%
    const radio = container.querySelector('input[type="radio"][value="a"]') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    (container.querySelector('button[data-object-id="sub"]') as HTMLButtonElement).click();
    (container.querySelector('button[data-object-id="btn"]') as HTMLButtonElement).click();
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('scoreGreaterThan does NOT fire when score is at or below threshold', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: courseWithScoreCheck('scoreGreaterThan', 100), container });
    rt.start();
    const radio = container.querySelector('input[type="radio"][value="a"]') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    (container.querySelector('button[data-object-id="sub"]') as HTMLButtonElement).click();
    (container.querySelector('button[data-object-id="btn"]') as HTMLButtonElement).click();
    expect(rt.getCurrentSlideId()).toBe('s1');
  });

  it('scoreLessThan fires when score is below threshold', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: courseWithScoreCheck('scoreLessThan', 50), container });
    rt.start();
    // Pick wrong answer → 0%
    const radio = container.querySelector('input[type="radio"][value="b"]') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    (container.querySelector('button[data-object-id="sub"]') as HTMLButtonElement).click();
    (container.querySelector('button[data-object-id="btn"]') as HTMLButtonElement).click();
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('score conditions do NOT fire before any quiz submission (no score yet)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: courseWithScoreCheck('scoreGreaterThan', 0), container });
    rt.start();
    // Click jump trigger without ever submitting the quiz.
    (container.querySelector('button[data-object-id="btn"]') as HTMLButtonElement).click();
    expect(rt.getCurrentSlideId()).toBe('s1');
  });
});

describe('Browser runtime conditions: AND combination', () => {
  it('fires only when ALL conditions are true', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [
          { type: 'variableGreaterThan', variable: 'Score', value: 50 },
          { type: 'variableEquals', variable: 'Done', value: true },
        ],
      }),
      container,
    });
    rt.start();
    rt.setVariable('Score', 90);
    rt.setVariable('Done', true);
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s2');
  });

  it('does NOT fire if ANY condition is false', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [
          { type: 'variableGreaterThan', variable: 'Score', value: 50 },
          { type: 'variableEquals', variable: 'Done', value: true },
        ],
      }),
      container,
    });
    rt.start();
    rt.setVariable('Score', 90);
    rt.setVariable('Done', false); // breaks the AND
    clickGo(container);
    expect(rt.getCurrentSlideId()).toBe('s1');
  });
});

describe('Browser runtime conditions: unknown condition types', () => {
  it('treats an unknown condition type as false (fail-safe)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: courseWithCondition({
        id: 't', event: { type: 'userClick', source: 'btn' }, source: 'btn',
        action: { type: 'jumpToSlide', target: 's2' },
        conditions: [{ type: 'somethingNew', value: 'x' }],
      }),
      container,
    });
    rt.start();
    clickGo(container);
    // Unknown condition → treat as false → action does not fire.
    expect(rt.getCurrentSlideId()).toBe('s1');
  });
});
