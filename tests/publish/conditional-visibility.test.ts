// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — conditional visibility
 *
 * Objects can declare:
 *   visibility: {
 *     initial: 'visible' | 'hidden',
 *     conditional: [ { conditions: [...], then: 'visible' | 'hidden' }, ... ]
 *   }
 *
 * On every render, the runtime evaluates each conditional rule in order.
 * The first rule whose conditions all pass wins.  If no rule matches,
 * the initial visibility is used.  When a variable changes via
 * setVariable, the slide re-renders so the visibility updates.
 *
 * No `visibility` on an object means "always visible" — this is the
 * common case and must not require any per-object overhead in the
 * emitted course.json.
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
  setVariable(name: string, value: unknown): void;
}
function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function isInDom(container: HTMLElement, objId: string): boolean {
  return container.querySelector(`[data-object-id="${objId}"]`) !== null;
}

// ---- Fixtures ----

function visibilityCourse(visibility: Record<string, unknown> | undefined): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: 'maybe',
    type: 'text',
    rect: [10, 10, 200, 50],
    content: 'I might be hidden',
  };
  if (visibility !== undefined) obj.visibility = visibility;
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'vc', title: 'V', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: [{
      id: 's1',
      title: 'One',
      background: { type: 'solid', color: '#FFF' },
      objects: [
        obj,
        { id: 'always', type: 'text', rect: [10, 100, 200, 50], content: 'Always here' },
      ],
      triggers: [],
    }],
    variables: {
      Score: { type: 'number', default: 0, scope: 'course' },
      Done: { type: 'boolean', default: false, scope: 'course' },
    },
    navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
    lms: { standard: 'html5' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Browser runtime visibility: defaults', () => {
  it('renders an object with no visibility field (default visible)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: visibilityCourse(undefined), container });
    rt.start();
    expect(isInDom(container, 'maybe')).toBe(true);
    expect(isInDom(container, 'always')).toBe(true);
  });

  it('renders an object with visibility.initial = "visible"', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: visibilityCourse({ initial: 'visible' }), container });
    rt.start();
    expect(isInDom(container, 'maybe')).toBe(true);
  });

  it('hides an object with visibility.initial = "hidden"', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({ course: visibilityCourse({ initial: 'hidden' }), container });
    rt.start();
    expect(isInDom(container, 'maybe')).toBe(false);
    expect(isInDom(container, 'always')).toBe(true); // siblings unaffected
  });
});

describe('Browser runtime visibility: conditional rules', () => {
  it('matching rule with then="hidden" hides an initially-visible object', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: visibilityCourse({
        initial: 'visible',
        conditional: [
          { conditions: [{ type: 'variableEquals', variable: 'Done', value: true }], then: 'hidden' },
        ],
      }),
      container,
    });
    rt.start();
    // Initially Done = false → rule does not match → use initial → visible.
    expect(isInDom(container, 'maybe')).toBe(true);
  });

  it('matching rule with then="hidden" toggles after setVariable', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: visibilityCourse({
        initial: 'visible',
        conditional: [
          { conditions: [{ type: 'variableEquals', variable: 'Done', value: true }], then: 'hidden' },
        ],
      }),
      container,
    });
    rt.start();
    expect(isInDom(container, 'maybe')).toBe(true);
    rt.setVariable('Done', true);
    expect(isInDom(container, 'maybe')).toBe(false);
  });

  it('matching rule with then="visible" reveals an initially-hidden object', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: visibilityCourse({
        initial: 'hidden',
        conditional: [
          { conditions: [{ type: 'variableGreaterThan', variable: 'Score', value: 80 }], then: 'visible' },
        ],
      }),
      container,
    });
    rt.start();
    expect(isInDom(container, 'maybe')).toBe(false);
    rt.setVariable('Score', 90);
    expect(isInDom(container, 'maybe')).toBe(true);
  });

  it('AND-combines multiple conditions within a single rule', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: visibilityCourse({
        initial: 'hidden',
        conditional: [
          {
            conditions: [
              { type: 'variableGreaterThan', variable: 'Score', value: 50 },
              { type: 'variableEquals', variable: 'Done', value: true },
            ],
            then: 'visible',
          },
        ],
      }),
      container,
    });
    rt.start();
    expect(isInDom(container, 'maybe')).toBe(false);
    rt.setVariable('Score', 90);
    expect(isInDom(container, 'maybe')).toBe(false); // Done still false
    rt.setVariable('Done', true);
    expect(isInDom(container, 'maybe')).toBe(true);
  });

  it('first matching rule wins; later rules do not override', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: visibilityCourse({
        initial: 'hidden',
        conditional: [
          { conditions: [{ type: 'variableEquals', variable: 'Done', value: true }], then: 'visible' },
          { conditions: [{ type: 'variableEquals', variable: 'Done', value: true }], then: 'hidden' },
        ],
      }),
      container,
    });
    rt.start();
    rt.setVariable('Done', true);
    // First rule matches with then="visible" — second rule (also matching) is ignored.
    expect(isInDom(container, 'maybe')).toBe(true);
  });

  it('falls back to initial when no rule matches', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: visibilityCourse({
        initial: 'hidden',
        conditional: [
          { conditions: [{ type: 'variableEquals', variable: 'Done', value: true }], then: 'visible' },
        ],
      }),
      container,
    });
    rt.start();
    // Done is false → rule doesn't match → initial=hidden wins.
    expect(isInDom(container, 'maybe')).toBe(false);
  });
});

describe('Browser runtime visibility: layer interaction', () => {
  it('visibility on a layer object also gets evaluated', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const course = {
      format: 'pathfinder-v1',
      metadata: { id: 'vl', title: 'V', author: 'A', language: 'en' },
      canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
      slides: [{
        id: 's1',
        title: 'One',
        background: { type: 'solid', color: '#FFF' },
        objects: [],
        layers: [{
          id: 'L1',
          name: 'L1',
          visible: true,
          objects: [{
            id: 'layered',
            type: 'text',
            rect: [10, 10, 100, 30],
            content: 'In a layer',
            visibility: {
              initial: 'visible',
              conditional: [
                { conditions: [{ type: 'variableEquals', variable: 'Done', value: true }], then: 'hidden' },
              ],
            },
          }],
        }],
        triggers: [],
      }],
      variables: { Done: { type: 'boolean', default: false, scope: 'course' } },
      navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
      lms: { standard: 'html5' },
    };
    const rt = new Ctor({ course, container });
    rt.start();
    expect(isInDom(container, 'layered')).toBe(true);
    rt.setVariable('Done', true);
    expect(isInDom(container, 'layered')).toBe(false);
  });
});
