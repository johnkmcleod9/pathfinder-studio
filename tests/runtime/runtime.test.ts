import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VariableStore,
  StandaloneAdapter,
  NavigationEngine,
  TriggerExecutor,
  QuizController,
  MediaController,
  PathfinderRuntime,
} from '../../src/runtime/index.js';
import type { RuntimeCourse, RuntimeTrigger } from '../../src/runtime/types.js';

// ---- Fixtures ----

function makeCourse(): RuntimeCourse {
  return {
    format: 'pathfinder-v1',
    version: '1.0',
    metadata: { id: 'course-001', title: 'Test Course', author: 'Dev', language: 'en' },
    canvas: { width: 1280, height: 720, backgroundColor: '#FFFFFF' },
    slides: [
      {
        id: 'slide-1',
        title: 'Slide 1',
        background: { type: 'solid', color: '#FFFFFF' },
        objects: [
          { id: 'btn-1', type: 'button', rect: [540, 300, 200, 60], label: 'Next' },
          { id: 'text-1', type: 'text', rect: [100, 100, 500, 100], content: '<p>Hello</p>' },
        ],
        layers: [],
        triggers: [
          {
            id: 't1',
            event: { type: 'userClick', source: 'btn-1' },
            action: { type: 'jumpToSlide', target: 'slide-2' },
            priority: 0,
          },
        ],
      },
      {
        id: 'slide-2',
        title: 'Slide 2',
        background: { type: 'solid', color: '#F0F0F0' },
        objects: [
          { id: 'btn-back', type: 'button', rect: [100, 300, 200, 60], label: 'Back' },
        ],
        layers: [],
        triggers: [
          {
            id: 't2',
            event: { type: 'userClick', source: 'btn-back' },
            action: { type: 'jumpToSlide', target: 'slide-1' },
            priority: 0,
          },
        ],
      },
    ],
    variables: {
      CourseStarted: { type: 'boolean', default: false, scope: 'course' },
      Score: { type: 'number', default: 0, scope: 'course' },
      UserName: { type: 'text', default: '', scope: 'course' },
    },
    navigation: { entry: 'slide-1', slides: ['slide-1', 'slide-2'], arrows: true, progress: true, slideNumber: true },
    media: {},
    lms: { standard: 'none' },
  };
}

// ---- VariableStore ----

describe('VariableStore', () => {
  let store: VariableStore;

  beforeEach(() => {
    store = new VariableStore({
      CourseStarted: { type: 'boolean', default: false, scope: 'course' },
      Score: { type: 'number', default: 0, scope: 'course' },
      UserName: { type: 'text', default: '', scope: 'course' },
    });
  });

  it('initializes with default values', () => {
    expect(store.get('CourseStarted')).toBe(false);
    expect(store.get('Score')).toBe(0);
    expect(store.get('UserName')).toBe('');
  });

  it('sets and gets a value', () => {
    store.set('CourseStarted', true);
    expect(store.get('CourseStarted')).toBe(true);
  });

  it('notifies subscribers on change', () => {
    const fn = vi.fn();
    store.onChange('Score', fn);
    store.set('Score', 10);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(10, 0);
  });

  it('does not notify unrelated variables', () => {
    const fn = vi.fn();
    store.onChange('Score', fn);
    store.set('CourseStarted', true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('serializes to JSON', () => {
    store.set('Score', 50);
    store.set('UserName', 'Alice');
    const json = store.toJSON();
    expect(json.CourseStarted).toBe(false);
    expect(json.Score).toBe(50);
    expect(json.UserName).toBe('Alice');
  });

  it('restores from JSON', () => {
    store.fromJSON({ CourseStarted: true, Score: 99, UserName: 'Bob' });
    expect(store.get('CourseStarted')).toBe(true);
    expect(store.get('Score')).toBe(99);
    expect(store.get('UserName')).toBe('Bob');
  });

  it('gets all variable names', () => {
    expect(store.getAllVariableNames()).toEqual(['CourseStarted', 'Score', 'UserName']);
  });
});

// ---- NavigationEngine ----

describe('NavigationEngine', () => {
  let course: RuntimeCourse;
  let nav: NavigationEngine;
  let onSlideChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    course = makeCourse();
    onSlideChange = vi.fn();
    nav = new NavigationEngine(course, onSlideChange);
  });

  it('starts at entry slide', () => {
    expect(nav.getCurrentSlideId()).toBe('slide-1');
  });

  it('goes to next slide', () => {
    const next = nav.goToSlide('slide-2');
    expect(next).toBe('slide-2');
    expect(onSlideChange).toHaveBeenCalledWith('slide-2', 'slide-1');
  });

  it('goToSlide returns null for nonexistent slide', () => {
    const next = nav.goToSlide('nonexistent');
    expect(next).toBeNull();
  });

  it('goBack returns previous slide', () => {
    nav.goToSlide('slide-2');
    const back = nav.goBack();
    expect(back).toBe('slide-1');
  });

  it('goBack returns null at beginning of history', () => {
    const back = nav.goBack();
    expect(back).toBeNull();
  });

  it('hasNext returns true when more slides', () => {
    expect(nav.hasNext()).toBe(true);
    nav.goToSlide('slide-2');
    expect(nav.hasNext()).toBe(false);
  });

  it('hasPrevious returns true when not at start', () => {
    nav.goToSlide('slide-2');
    expect(nav.hasPrevious()).toBe(true);
  });

  it('getSlide returns slide by id', () => {
    const slide = nav.getSlide('slide-2');
    expect(slide?.id).toBe('slide-2');
  });

  it('getSlide returns null for unknown id', () => {
    expect(nav.getSlide('unknown')).toBeNull();
  });

  it('getTotalSlides returns count', () => {
    expect(nav.getTotalSlides()).toBe(2);
  });

  it('getSlideIndex returns 0-based index', () => {
    expect(nav.getSlideIndex('slide-1')).toBe(0);
    expect(nav.getSlideIndex('slide-2')).toBe(1);
  });

  it('getNextSlide returns next slide id', () => {
    expect(nav.getNextSlideId()).toBe('slide-2');
    nav.goToSlide('slide-2');
    expect(nav.getNextSlideId()).toBeNull();
  });

  it('gets all slide ids', () => {
    expect(nav.getSlideIds()).toEqual(['slide-1', 'slide-2']);
  });
});

// ---- TriggerExecutor ----

describe('TriggerExecutor', () => {
  let store: VariableStore;
  let nav: NavigationEngine;
  let media: MediaController;
  let lms: { sendStatement: ReturnType<typeof vi.fn>; saveLocation: ReturnType<typeof vi.fn> };
  let executor: TriggerExecutor;
  let course: RuntimeCourse;

  beforeEach(() => {
    course = makeCourse();
    store = new VariableStore(course.variables);
    nav = new NavigationEngine(course, vi.fn());
    media = new MediaController({} as unknown as HTMLElement);
    lms = { sendStatement: vi.fn(), saveLocation: vi.fn() };
    executor = new TriggerExecutor(store, nav, media, lms as unknown as ReturnType<typeof lms.sendStatement> extends (...args: infer A) => infer R ? (...args: A) => R : never);
  });

  it('registers and fires trigger on userClick event', async () => {
    const slide = nav.getSlide('slide-1')!;
    executor.registerSlideTriggers(slide);

    const jumpFn = vi.fn();
    (nav as unknown as { goToSlide: ReturnType<typeof vi.fn> }).goToSlide = jumpFn;

    await executor.fireEvent('userClick', 'btn-1');
    expect(jumpFn).toHaveBeenCalledWith('slide-2');
  });

  it('does not fire trigger for non-matching source', async () => {
    const slide = nav.getSlide('slide-1')!;
    executor.registerSlideTriggers(slide);

    const jumpFn = vi.fn();
    (nav as unknown as { goToSlide: ReturnType<typeof vi.fn> }).goToSlide = jumpFn;

    await executor.fireEvent('userClick', 'unknown-object');
    expect(jumpFn).not.toHaveBeenCalled();
  });

  it('executes conditional action with true condition', async () => {
    store.set('Score', 50);
    const conditionalTrigger: RuntimeTrigger = {
      id: 't-cond',
      event: { type: 'userClick', source: 'btn-1' },
      action: {
        type: 'conditional',
        branches: [
          {
            conditions: [{ type: 'variableGreaterThan', variable: 'Score', value: 40 }],
            then: [{ type: 'jumpToSlide', target: 'slide-2' }],
          },
        ],
        else: [{ type: 'jumpToSlide', target: 'slide-1' }],
      },
      priority: 0,
    };

    executor.registerTrigger(conditionalTrigger);
    const jumpFn = vi.fn();
    (nav as unknown as { goToSlide: ReturnType<typeof vi.fn> }).goToSlide = jumpFn;

    await executor.fireEvent('userClick', 'btn-1');
    expect(jumpFn).toHaveBeenCalledWith('slide-2');
  });

  it('executes else branch when condition false', async () => {
    store.set('Score', 30);
    const conditionalTrigger: RuntimeTrigger = {
      id: 't-cond',
      event: { type: 'userClick', source: 'btn-1' },
      action: {
        type: 'conditional',
        branches: [
          {
            conditions: [{ type: 'variableGreaterThan', variable: 'Score', value: 40 }],
            then: [{ type: 'jumpToSlide', target: 'slide-2' }],
          },
        ],
        else: [{ type: 'jumpToSlide', target: 'slide-1' }],
      },
      priority: 0,
    };

    executor.registerTrigger(conditionalTrigger);
    const jumpFn = vi.fn();
    (nav as unknown as { goToSlide: ReturnType<typeof vi.fn> }).goToSlide = jumpFn;

    await executor.fireEvent('userClick', 'btn-1');
    expect(jumpFn).toHaveBeenCalledWith('slide-1');
  });

  it('sets variable via setVariable action', async () => {
    const setVarTrigger: RuntimeTrigger = {
      id: 't-set',
      event: { type: 'userClick', source: 'btn-1' },
      action: { type: 'setVariable', variable: 'CourseStarted', value: true },
      priority: 0,
    };

    executor.registerTrigger(setVarTrigger);
    await executor.fireEvent('userClick', 'btn-1');
    expect(store.get('CourseStarted')).toBe(true);
  });

  it('adjusts variable via adjustVariable action', async () => {
    store.set('Score', 10);
    const adjustTrigger: RuntimeTrigger = {
      id: 't-adj',
      event: { type: 'userClick', source: 'btn-1' },
      action: { type: 'adjustVariable', variable: 'Score', operation: 'add', value: 5 },
      priority: 0,
    };

    executor.registerTrigger(adjustTrigger);
    await executor.fireEvent('userClick', 'btn-1');
    expect(store.get('Score')).toBe(15);
  });

  it('fires xAPI statement via fireXAPIStatement action', async () => {
    const xapiTrigger: RuntimeTrigger = {
      id: 't-xapi',
      event: { type: 'courseStarts' },
      action: {
        type: 'fireXAPIStatement',
        verb: 'http://adlnet.gov/expapi/verbs/initialized',
        object: { id: 'https://example.com/course/test', definition: { name: { 'en-US': 'Test Course' } } },
      },
      priority: 0,
    };

    executor.registerTrigger(xapiTrigger);
    await executor.fireEvent('courseStarts', undefined);
    expect(lms.sendStatement).toHaveBeenCalled();
  });

  it('unregisters all triggers for a slide', async () => {
    const slide = nav.getSlide('slide-1')!;
    executor.registerSlideTriggers(slide);

    // Verify triggers are registered
    const jumpFn = vi.fn();
    (nav as unknown as { goToSlide: ReturnType<typeof vi.fn> }).goToSlide = jumpFn;
    await executor.fireEvent('userClick', 'btn-1');
    expect(jumpFn).toHaveBeenCalledTimes(1);

    // Unregister and verify triggers no longer fire
    executor.unregisterSlideTriggers(slide);
    jumpFn.mockClear();
    await executor.fireEvent('userClick', 'btn-1');
    expect(jumpFn).not.toHaveBeenCalled();
  });

  it('registers timelineStarts trigger', async () => {
    const timelineTrigger: RuntimeTrigger = {
      id: 't-timeline',
      event: { type: 'timelineStarts' },
      action: { type: 'setVariable', variable: 'CourseStarted', value: true },
      priority: 0,
    };

    executor.registerTrigger(timelineTrigger);
    await executor.fireEvent('timelineStarts', undefined);
    expect(store.get('CourseStarted')).toBe(true);
  });
});

// ---- QuizController ----

describe('QuizController', () => {
  let store: VariableStore;
  let quiz: QuizController;

  const quizCourse: RuntimeCourse = {
    ...makeCourse(),
    quiz: {
      id: 'quiz-1',
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice',
          text: 'What is 2+2?',
          points: 10,
          options: [
            { id: 'a', label: '3', isCorrect: false },
            { id: 'b', label: '4', isCorrect: true },
            { id: 'c', label: '5', isCorrect: false },
          ],
        },
        {
          id: 'q2',
          type: 'true_false',
          text: 'The sky is blue',
          points: 5,
          options: [
            { id: 'true', label: 'True', isCorrect: true },
            { id: 'false', label: 'False', isCorrect: false },
          ],
        },
      ],
      passingScore: 70,
      attemptsAllowed: 2,
      allowReview: true,
    },
  };

  beforeEach(() => {
    store = new VariableStore({});
    quiz = new QuizController(quizCourse.quiz!, store);
  });

  it('starts attempt', () => {
    const attempt = quiz!.startAttempt()!;
    expect(attempt.id).toBeTruthy();
    expect(attempt.state).toBe('in_progress');
  });

  it('records answer', () => {
    const attempt = quiz!.startAttempt()!;
    quiz!.recordAnswer(attempt.id, 'q1', 'b');
    const results = quiz!.getAttemptResults(attempt.id)!;
    expect(results.answers['q1']).toBe('b');
  });

  it('submits attempt and computes score', () => {
    const attempt = quiz!.startAttempt()!;
    quiz!.recordAnswer(attempt.id, 'q1', 'b');
    quiz!.recordAnswer(attempt.id, 'q2', 'true');
    const score = quiz!.submitAttempt(attempt.id);
    expect(score).not.toBeNull();
    expect(score!.percent).toBe(100); // Both correct
    expect(score!.status).toBe('passed');
  });

  it('scores 0% when all wrong', () => {
    const attempt = quiz!.startAttempt()!;
    quiz!.recordAnswer(attempt.id, 'q1', 'a');
    quiz!.recordAnswer(attempt.id, 'q2', 'false');
    const score = quiz!.submitAttempt(attempt.id);
    expect(score!.percent).toBe(0);
    expect(score!.status).toBe('failed');
  });

  it('enforces attempt limit', () => {
    const a1 = quiz!.startAttempt()!;
    quiz!.submitAttempt(a1.id);
    const a2 = quiz!.startAttempt()!;
    quiz!.submitAttempt(a2.id);
    const a3 = quiz!.startAttempt();
    expect(a3).toBeNull();
  });

  it('serializes state for suspend_data', () => {
    const attempt = quiz!.startAttempt()!;
    quiz!.recordAnswer(attempt.id, 'q1', 'b');
    const state = quiz!.serializeState();
    expect(state.attempts[attempt.id]).toBeTruthy();
  });

  it('restores state from suspend_data', () => {
    const attempt = quiz!.startAttempt()!;
    quiz!.recordAnswer(attempt.id, 'q1', 'b');
    const state = quiz!.serializeState();
    const newQuiz = new QuizController(quizCourse.quiz!, store);
    newQuiz.restoreState(state);
    expect(newQuiz.getAttemptResults(attempt.id)?.answers['q1']).toBe('b');
  });
});

// ---- MediaController ----

describe('MediaController', () => {
  // Mock document globally for all MediaController tests
  beforeEach(() => {
    const mockEl = {
      src: '', play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(),
      currentTime: 0, preload: '', volume: 1, loop: false,
      load: vi.fn(), remove: vi.fn(),
      style: { display: '' },
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockEl),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays media with correct src and volume', async () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const media = new MediaController(container);
    const mockEl = (document.createElement as ReturnType<typeof vi.fn>)() as Record<string, unknown>;
    await media.play({ id: 'audio-1', type: 'audio', src: 'data:audio/mp3;base64,', volume: 0.5, loop: false });
    expect(mockEl.src).toBe('data:audio/mp3;base64,');
    expect(mockEl.volume).toBe(0.5);
    expect(mockEl.loop).toBe(false);
    expect(mockEl.play).toHaveBeenCalled();
  });

  it('pauses media by id', async () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const media = new MediaController(container);
    const mockEl = (document.createElement as ReturnType<typeof vi.fn>)() as Record<string, unknown>;
    await media.play({ id: 'audio-1', type: 'audio', src: 'data:audio/mp3;base64,', volume: 1, loop: false });
    media.pause('audio-1');
    expect(mockEl.pause).toHaveBeenCalled();
  });

  it('stops media by id', async () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const media = new MediaController(container);
    const mockEl = (document.createElement as ReturnType<typeof vi.fn>)() as Record<string, unknown>;
    await media.play({ id: 'audio-1', type: 'audio', src: 'data:audio/mp3;base64,', volume: 1, loop: false });
    media.stop('audio-1');
    expect(mockEl.pause).toHaveBeenCalled();
    expect(mockEl.currentTime).toBe(0);
  });

  it('destroy cleans up all elements', async () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const media = new MediaController(container);
    const mockEl = (document.createElement as ReturnType<typeof vi.fn>)() as Record<string, unknown>;
    await media.play({ id: 'audio-1', type: 'audio', src: 'data:audio/mp3;base64,', volume: 1, loop: false });
    media.destroy();
    expect(mockEl.remove).toHaveBeenCalled();
  });
});

// ---- PathfinderRuntime ----

describe('PathfinderRuntime', () => {
  function makeMockWrapper() {
    return {
      setAttribute: vi.fn(),
      className: '',
      style: { cssText: '' },
      appendChild: vi.fn(),
      remove: vi.fn(),
    };
  }

  function makeRuntime(course?: ReturnType<typeof makeCourse>) {
    const c = course ?? makeCourse();
    const mockContainer = { appendChild: vi.fn(), remove: vi.fn() } as unknown as HTMLElement;
    const runtime = new PathfinderRuntime({ course: c, container: mockContainer, lmsAdapter: new StandaloneAdapter() });
    const mockWrapper = makeMockWrapper();
    // Replace renderSlide to avoid DOM dependency
    (runtime as unknown as Record<string, unknown>).renderSlide = vi.fn(() => mockWrapper);
    return { runtime, mockWrapper, mockContainer };
  }

  it('creates runtime with course data', () => {
    const { runtime } = makeRuntime();
    expect(runtime.getCurrentSlideId()).toBe('slide-1');
    expect(runtime.getTotalSlides()).toBe(2);
  });

  it('starts at entry slide', async () => {
    const { runtime } = makeRuntime();
    await runtime.start();
    expect(runtime.getCurrentSlideId()).toBe('slide-1');
  });

  it('navigates to next slide', async () => {
    const { runtime } = makeRuntime();
    await runtime.start();
    runtime.goToSlide('slide-2');
    expect(runtime.getCurrentSlideId()).toBe('slide-2');
  });

  it('fires courseStarts trigger on start', async () => {
    const course = makeCourse();
    course.slides[0].triggers = [
      {
        id: 't-start',
        event: { type: 'courseStarts' },
        action: { type: 'setVariable', variable: 'CourseStarted', value: true },
        priority: 0,
      },
    ];
    const { runtime } = makeRuntime(course);
    await runtime.start();
    expect(runtime.getVariable('CourseStarted')).toBe(true);
  });

  it('getVariable returns null for unknown var', () => {
    const { runtime } = makeRuntime();
    expect(runtime.getVariable('NonExistent')).toBeNull();
  });

  it('serializeState includes variables', async () => {
    const { runtime } = makeRuntime();
    await runtime.start();
    const state = runtime.serializeState() as Record<string, unknown>;
    expect(state.variables).toBeDefined();
    expect((state.variables as Record<string, unknown>).CourseStarted).toBe(false);
  });

  it('goBack returns null when at first slide', async () => {
    const { runtime } = makeRuntime();
    await runtime.start();
    runtime.goBack();
    // At first slide, no previous
    expect(runtime.getCurrentSlideId()).toBe('slide-1');
  });

  it('setVariable updates value', async () => {
    const { runtime } = makeRuntime();
    await runtime.start();
    runtime.setVariable('Score', 42);
    expect(runtime.getVariable('Score')).toBe(42);
  });
});
