/**
 * Stage 3: Compile IR — tests
 *
 * The compiler takes a parsed project.json (+ manifest.json) and produces
 * two things:
 *   1. A CourseIR — the full intermediate representation (lossless)
 *   2. A RuntimeCourse — the shape the runtime expects in course.json
 */
import { describe, it, expect } from 'vitest';
import { compileCourseIR, buildRuntimeCourse } from '../../src/publish/compiler.js';
import type {
  CourseIR,
  RuntimeCourse,
  OutputStandard,
} from '../../src/publish/types.js';

// ---- Fixtures ----

const SIMPLE_PROJECT = {
  metadata: {
    id: 'course-001',
    title: 'Intro Course',
    author: 'Devon',
    language: 'en',
  },
  slides: [
    {
      id: 'slide-1',
      title: 'Welcome',
      background: { type: 'solid', color: '#FFFFFF' },
      objects: {
        'text-1': {
          type: 'text',
          rect: { x: 0, y: 0, w: 1280, h: 720 },
          content: '<p>Hello</p>',
          style: { fontSize: 24, color: '#000' },
        },
      },
      zOrder: ['text-1'],
      triggers: [],
    },
    {
      id: 'slide-2',
      title: 'Next',
      background: { type: 'solid', color: '#EEE' },
      objects: {
        'btn-1': {
          type: 'button',
          rect: { x: 100, y: 100, w: 200, h: 60 },
          content: 'Go',
          triggers: [
            {
              id: 't1',
              event: { type: 'userClick' },
              action: { type: 'jumpToSlide', target: 'slide-1' },
              priority: 0,
            },
          ],
        },
      },
      zOrder: ['btn-1'],
      triggers: [],
    },
  ],
  variables: {
    Score: { type: 'number', defaultValue: 0, scope: 'course' },
    Done: { type: 'trueFalse', defaultValue: false, scope: 'course' },
  },
  navigation: {
    entrySlide: 'slide-1',
    slides: ['slide-1', 'slide-2'],
    showNavigationArrows: true,
    showProgressBar: true,
    showSlideNumber: false,
  },
};

const MANIFEST_EMPTY = { version: '1.0', assets: {} };

describe('Stage 3: compileCourseIR', () => {
  it('produces a CourseIR with metadata fields populated', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    expect(ir.metadata.id).toBe('course-001');
    expect(ir.metadata.title).toBe('Intro Course');
    expect(ir.metadata.author).toBe('Devon');
    expect(ir.metadata.language).toBe('en');
  });

  it('compiles every slide into an IR slide', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    expect(ir.slides).toHaveLength(2);
    expect(ir.slides[0].id).toBe('slide-1');
    expect(ir.slides[1].id).toBe('slide-2');
  });

  it('preserves object rect and content during slide compilation', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const slide1 = ir.slides[0];
    expect(slide1.objects).toHaveLength(1);
    const obj = slide1.objects[0];
    expect(obj.id).toBe('text-1');
    expect(obj.type).toBe('text');
    expect(obj.rect).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(obj.content).toBe('<p>Hello</p>');
  });

  it('lifts per-object triggers into slide.triggers (resolved)', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const slide2 = ir.slides[1];
    expect(slide2.triggers).toHaveLength(1);
    const trig = slide2.triggers[0];
    expect(trig.id).toBe('t1');
    expect(trig.event.type).toBe('userClick');
    expect(trig.actionGraph).toEqual({ type: 'jumpToSlide', target: 'slide-1' });
  });

  it('compiles variables with scope and type info', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    expect(ir.variables).toHaveLength(2);
    const score = ir.variables.find((v) => v.name === 'Score');
    expect(score).toBeDefined();
    expect(score!.type).toBe('number');
    expect(score!.defaultValue).toBe(0);
    expect(score!.scope).toBe('course');
  });

  it('compiles navigation with entry slide', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    expect(ir.navigation.entrySlide).toBe('slide-1');
    expect(ir.navigation.slides).toEqual(['slide-1', 'slide-2']);
    expect(ir.navigation.showNavigationArrows).toBe(true);
    expect(ir.navigation.showProgressBar).toBe(true);
  });

  it('compiles solid background', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    expect(ir.slides[0].background.type).toBe('solid');
    expect(ir.slides[0].background.color).toBe('#FFFFFF');
  });

  it('defaults background when missing', () => {
    const project = {
      ...SIMPLE_PROJECT,
      slides: [{ id: 's1', title: 'X', objects: {}, zOrder: [], triggers: [] }],
      navigation: { entrySlide: 's1', slides: ['s1'], showNavigationArrows: false },
    };
    const ir = compileCourseIR(project, MANIFEST_EMPTY);
    expect(ir.slides[0].background).toBeDefined();
    expect(ir.slides[0].background.type).toBe('solid');
  });

  it('compiles media manifest from manifest.json assets', () => {
    const manifest = {
      version: '1.0',
      assets: {
        'hash-1': {
          path: 'media/img.png',
          size: 1024,
          mimeType: 'image/png',
          srcPath: 'img.png',
          type: 'image',
          hash: 'hash-1',
        },
      },
    };
    const ir = compileCourseIR(SIMPLE_PROJECT, manifest);
    expect(ir.mediaManifest).toHaveLength(1);
    expect(ir.mediaManifest[0].id).toBe('hash-1');
    expect(ir.mediaManifest[0].mimeType).toBe('image/png');
  });

  it('returns empty quiz state machine when no quiz', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    expect(ir.quizStateMachine).toBeDefined();
    expect(ir.quizStateMachine.questions).toEqual([]);
  });
});

describe('Stage 3: buildRuntimeCourse', () => {
  it('builds RuntimeCourse from CourseIR', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const course = buildRuntimeCourse(ir, { standard: 'html5' });
    expect(course.format).toBe('pathfinder-v1');
    expect(course.metadata.id).toBe('course-001');
    expect(course.slides).toHaveLength(2);
  });

  it('converts IR RectIR to runtime tuple [x,y,w,h]', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const course = buildRuntimeCourse(ir, { standard: 'html5' });
    const obj = course.slides[0].objects[0];
    expect(obj.rect).toEqual([0, 0, 1280, 720]);
  });

  it('lifts variables from array to keyed record', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const course = buildRuntimeCourse(ir, { standard: 'html5' });
    expect(course.variables['Score']).toBeDefined();
    expect(course.variables['Score'].default).toBe(0);
    expect(course.variables['Score'].type).toBe('number');
    expect(course.variables['Done']).toBeDefined();
  });

  it('maps navigation fields to runtime shape', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const course = buildRuntimeCourse(ir, { standard: 'html5' });
    expect(course.navigation.entry).toBe('slide-1');
    expect(course.navigation.slides).toEqual(['slide-1', 'slide-2']);
    expect(course.navigation.arrows).toBe(true);
    expect(course.navigation.progress).toBe(true);
  });

  it('sets lms config from options per standard', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const scorm = buildRuntimeCourse(ir, { standard: 'scorm2004', masteryScore: 85 });
    expect(scorm.lms.standard).toBe('scorm2004');
    expect(scorm.lms.masteryScore).toBe(85);

    const xapi = buildRuntimeCourse(ir, {
      standard: 'xapi',
      lrsEndpoint: 'https://lrs.example.com',
      lrsAuth: 'Basic abc',
    });
    expect(xapi.lms.standard).toBe('xapi');
    expect(xapi.lms.lrsEndpoint).toBe('https://lrs.example.com');
    expect(xapi.lms.lrsAuth).toBe('Basic abc');
  });

  it('uses default canvas dimensions', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const course = buildRuntimeCourse(ir, { standard: 'html5' });
    expect(course.canvas.width).toBeGreaterThan(0);
    expect(course.canvas.height).toBeGreaterThan(0);
  });

  it('preserves triggers on slide objects (runtime shape)', () => {
    const ir = compileCourseIR(SIMPLE_PROJECT, MANIFEST_EMPTY);
    const course = buildRuntimeCourse(ir, { standard: 'html5' });
    const slide2 = course.slides[1];
    expect(slide2.triggers).toHaveLength(1);
    expect(slide2.triggers[0].event.type).toBe('userClick');
    expect(slide2.triggers[0].action).toEqual({ type: 'jumpToSlide', target: 'slide-1' });
  });
});
