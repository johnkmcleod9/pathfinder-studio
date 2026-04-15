/**
 * Pathfinder Publish — Stage 3: Compile IR
 *
 * Pure functions that transform a parsed project.json (+ manifest.json)
 * into the CourseIR (lossless intermediate representation) and then into
 * the RuntimeCourse shape that the runtime engine reads from course.json.
 *
 * Kept pure (no I/O) so the pipeline stage can call it and tests can
 * exercise it directly.
 */

import {
  ActionNodeIR,
  BackgroundIR,
  ConditionIR,
  CourseIR,
  CourseMetadataIR,
  EventIR,
  GradientIR,
  LayerIR,
  MediaAssetIR,
  NavigationIR,
  ObjectIR,
  OutputStandard,
  QuizStateMachineIR,
  RectIR,
  ResolvedTriggerIR,
  RuntimeBackground,
  RuntimeCourse,
  RuntimeLMSConfig,
  RuntimeMediaManifest,
  RuntimeNavigation,
  RuntimeObject,
  RuntimeSlide,
  RuntimeTrigger,
  RuntimeVariable,
  SlideIR,
  VariableIR,
} from './types.js';

// ---- Input types (loose — project.json is untrusted at this stage) ----

type JsonRecord = Record<string, unknown>;

interface ProjectInput extends JsonRecord {
  metadata?: JsonRecord;
  slides?: JsonRecord[];
  variables?: Record<string, JsonRecord>;
  navigation?: JsonRecord;
  quiz?: JsonRecord;
  schemaVersion?: string;
  formatVersion?: string;
}

interface ManifestInput extends JsonRecord {
  version?: string;
  assets?: Record<string, JsonRecord>;
}

export interface BuildRuntimeOptions {
  standard: OutputStandard;
  masteryScore?: number;
  lrsEndpoint?: string;
  lrsAuth?: string;
  canvas?: { width: number; height: number; backgroundColor?: string };
}

const DEFAULT_CANVAS = { width: 1280, height: 720, backgroundColor: '#FFFFFF' };

// ---- Public API ----

export function compileCourseIR(project: unknown, manifest: unknown): CourseIR {
  const p = (project ?? {}) as ProjectInput;
  const m = (manifest ?? {}) as ManifestInput;

  return {
    metadata: compileMetadata(p),
    slides: compileSlides(p.slides ?? []),
    variables: compileVariables(p.variables ?? {}),
    quizStateMachine: compileQuizStateMachine(p.quiz),
    navigation: compileNavigation(p.navigation ?? {}),
    mediaManifest: compileMediaManifest(m.assets ?? {}),
  };
}

export function buildRuntimeCourse(ir: CourseIR, opts: BuildRuntimeOptions): RuntimeCourse {
  const canvas = opts.canvas ?? DEFAULT_CANVAS;
  const quiz = toRuntimeQuiz(ir.quizStateMachine);
  return {
    format: 'pathfinder-v1',
    version: '1.0',
    metadata: {
      id: ir.metadata.id,
      title: ir.metadata.title,
      author: ir.metadata.author,
      language: ir.metadata.language,
    },
    canvas: {
      width: canvas.width,
      height: canvas.height,
      backgroundColor: canvas.backgroundColor ?? DEFAULT_CANVAS.backgroundColor,
    },
    slides: ir.slides.map(toRuntimeSlide),
    variables: toRuntimeVariables(ir.variables),
    navigation: toRuntimeNavigation(ir.navigation),
    media: toRuntimeMediaManifest(ir.mediaManifest),
    lms: buildLmsConfig(opts),
    ...(quiz ? { quiz } : {}),
  };
}

// ---- Metadata ----

function compileMetadata(p: ProjectInput): CourseMetadataIR {
  const meta = (p.metadata ?? {}) as JsonRecord;
  return {
    id: asString(meta['id'], 'course'),
    title: asString(meta['title'], 'Untitled Course'),
    author: asString(meta['author'], ''),
    language: asString(meta['language'], 'en'),
    defaultDuration: typeof meta['defaultDuration'] === 'string' ? (meta['defaultDuration'] as string) : undefined,
    schemaVersion: asString(p.schemaVersion, '1.0.0'),
    formatVersion: asString(p.formatVersion, '1.0'),
  };
}

// ---- Slides ----

function compileSlides(slides: JsonRecord[]): SlideIR[] {
  return slides.map(compileSlide);
}

function compileSlide(slide: JsonRecord): SlideIR {
  const objectsInput = (slide['objects'] ?? {}) as Record<string, JsonRecord>;
  const zOrder = (slide['zOrder'] as string[] | undefined) ?? Object.keys(objectsInput);

  const objects: ObjectIR[] = [];
  const slideTriggers: ResolvedTriggerIR[] = [];

  for (const objId of zOrder) {
    const raw = objectsInput[objId];
    if (!raw) continue;
    const { object, triggers } = compileObject(objId, raw);
    objects.push(object);
    slideTriggers.push(...triggers);
  }

  // Also collect slide-level triggers if any
  const rawSlideTriggers = (slide['triggers'] ?? []) as JsonRecord[];
  for (const t of rawSlideTriggers) {
    const compiled = compileTrigger(t);
    if (compiled) slideTriggers.push(compiled);
  }

  return {
    id: asString(slide['id'], ''),
    title: asString(slide['title'], ''),
    objects,
    layers: compileLayers((slide['layers'] as JsonRecord[] | undefined) ?? []),
    triggers: slideTriggers,
    background: compileBackground(slide['background']),
    audio: undefined,
  };
}

function compileObject(
  id: string,
  raw: JsonRecord
): { object: ObjectIR; triggers: ResolvedTriggerIR[] } {
  const rect = compileRect(raw['rect']);
  const object: ObjectIR = {
    id,
    type: asString(raw['type'], 'shape'),
    rect,
    content: typeof raw['content'] === 'string' ? (raw['content'] as string) : typeof raw['label'] === 'string' ? (raw['label'] as string) : undefined,
    style: (raw['style'] as Record<string, unknown> | undefined) ?? undefined,
    src: typeof raw['src'] === 'string' ? (raw['src'] as string) : undefined,
    altText: typeof raw['altText'] === 'string' ? (raw['altText'] as string) : undefined,
    visibility: compileVisibility(raw),
    states: (raw['states'] as Record<string, Record<string, unknown>> | undefined) ?? undefined,
    interactions: undefined,
  };

  const rawTriggers = (raw['triggers'] ?? []) as JsonRecord[];
  const triggers: ResolvedTriggerIR[] = [];
  for (const t of rawTriggers) {
    const compiled = compileTrigger(t, id);
    if (compiled) triggers.push(compiled);
  }

  return { object, triggers };
}

function compileLayers(layers: JsonRecord[]): LayerIR[] {
  return layers.map((layer) => ({
    id: asString(layer['id'], ''),
    name: asString(layer['name'], ''),
    visible: layer['visible'] !== false,
    objects: (() => {
      const result: ObjectIR[] = [];
      const objs = (layer['objects'] ?? {}) as Record<string, JsonRecord>;
      for (const [oid, obj] of Object.entries(objs)) {
        result.push(compileObject(oid, obj).object);
      }
      return result;
    })(),
  }));
}

function compileRect(raw: unknown): RectIR {
  if (!raw || typeof raw !== 'object') {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const r = raw as JsonRecord;
  return {
    x: asNumber(r['x'], 0),
    y: asNumber(r['y'], 0),
    w: asNumber(r['w'], 0),
    h: asNumber(r['h'], 0),
  };
}

function compileBackground(raw: unknown): BackgroundIR {
  if (!raw || typeof raw !== 'object') {
    return { type: 'solid', color: '#FFFFFF' };
  }
  const bg = raw as JsonRecord;
  const type = asString(bg['type'], 'solid');
  if (type === 'gradient') {
    const gradient = (bg['gradient'] ?? {}) as JsonRecord;
    return {
      type: 'gradient',
      gradient: {
        stops: ((gradient['stops'] as Array<{ offset: number; color: string }> | undefined) ?? []),
        angle: asNumber(gradient['angle'], 0),
      } as GradientIR,
    };
  }
  if (type === 'media') {
    const media = bg['media'] as JsonRecord | undefined;
    if (media) {
      return {
        type: 'media',
        media: {
          id: asString(media['id'], ''),
          src: asString(media['src'], ''),
          type: (asString(media['type'], 'image') as 'image' | 'audio' | 'video'),
          mimeType: asString(media['mimeType'], 'application/octet-stream'),
        },
      };
    }
  }
  return { type: 'solid', color: asString(bg['color'], '#FFFFFF') };
}

// ---- Triggers ----

function compileTrigger(raw: JsonRecord, sourceObjectId?: string): ResolvedTriggerIR | null {
  const event = raw['event'] as JsonRecord | undefined;
  const action = raw['action'] as JsonRecord | undefined;
  if (!event || !action) return null;
  const conditions = compileConditions(raw['conditions']);
  const out: ResolvedTriggerIR = {
    id: asString(raw['id'], ''),
    event: {
      type: asString(event['type'], ''),
      source: sourceObjectId ?? (typeof event['source'] === 'string' ? (event['source'] as string) : undefined),
    } as EventIR,
    actionGraph: compileAction(action),
    priority: asNumber(raw['priority'], 0),
  };
  if (conditions && conditions.length > 0) out.conditions = conditions;
  return out;
}

/**
 * Compile a raw conditions array into the IR shape. Returns undefined
 * when there are no conditions so callers can omit the field — keeps
 * the IR (and downstream course.json) free of empty arrays for the
 * common no-conditions case.
 */
/**
 * Build the visibility shape for a raw object.  Handles:
 *   - legacy `hidden: true` flag → initial = 'hidden'
 *   - explicit `visibility: { initial, conditional[] }`
 *   - neither (default visible, no conditional rules)
 *
 * The IR always carries a VisibilityIR (initial + conditional[]) so
 * downstream code can read it uniformly. The runtime conversion in
 * toRuntimeObject() decides whether to emit the field into the final
 * course.json — most objects don't need it.
 */
function compileVisibility(raw: JsonRecord): { initial: 'visible' | 'hidden'; conditional: Array<{ conditions: ConditionIR[]; then: 'visible' | 'hidden' }> } {
  const v = raw['visibility'] as JsonRecord | undefined;
  let initial: 'visible' | 'hidden';
  if (v && (v['initial'] === 'visible' || v['initial'] === 'hidden')) {
    initial = v['initial'] as 'visible' | 'hidden';
  } else if (raw['hidden'] === true) {
    initial = 'hidden';
  } else {
    initial = 'visible';
  }

  const conditional: Array<{ conditions: ConditionIR[]; then: 'visible' | 'hidden' }> = [];
  const rawRules = v && Array.isArray(v['conditional']) ? (v['conditional'] as JsonRecord[]) : [];
  for (const rule of rawRules) {
    if (!rule || typeof rule !== 'object') continue;
    const conditions = compileConditions(rule['conditions']) ?? [];
    const then = rule['then'] === 'hidden' ? 'hidden' : 'visible';
    if (conditions.length === 0) continue; // an empty rule would always match — skip
    conditional.push({ conditions, then });
  }

  return { initial, conditional };
}

function compileConditions(raw: unknown): ConditionIR[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ConditionIR[] = [];
  for (const c of raw as JsonRecord[]) {
    if (!c || typeof c !== 'object') continue;
    const type = asString(c['type'], '');
    if (!type) continue;
    const cond: ConditionIR = { type: type as ConditionIR['type'] };
    if (typeof c['variable'] === 'string') cond.variable = c['variable'];
    if (c['value'] !== undefined) cond.value = c['value'] as ConditionIR['value'];
    if (typeof c['scoreThreshold'] === 'number') cond.scoreThreshold = c['scoreThreshold'];
    out.push(cond);
  }
  return out.length > 0 ? out : undefined;
}

function compileAction(raw: JsonRecord): ActionNodeIR {
  const type = asString(raw['type'], '');
  switch (type) {
    case 'jumpToSlide':
      return { type: 'jumpToSlide', target: asString(raw['target'], '') };
    case 'showLayer':
      return { type: 'showLayer', target: asString(raw['target'], '') };
    case 'hideLayer':
      return { type: 'hideLayer', target: asString(raw['target'], '') };
    case 'setVariable':
      return {
        type: 'setVariable',
        variable: asString(raw['variable'], ''),
        value: raw['value'],
      };
    case 'adjustVariable':
      return {
        type: 'adjustVariable',
        variable: asString(raw['variable'], ''),
        operation: asString(raw['operation'], 'set') as 'add' | 'subtract' | 'set' | 'toggle',
        value: (raw['value'] as number | boolean) ?? 0,
      };
    case 'playMedia':
      return { type: 'playMedia', target: asString(raw['target'], '') };
    case 'pauseMedia':
      return { type: 'pauseMedia', target: asString(raw['target'], '') };
    case 'submitQuiz':
      return { type: 'submitQuiz', target: asString(raw['target'], '') };
    case 'exitCourse':
      return {
        type: 'exitCourse',
        completionStatus: asString(raw['completionStatus'], 'completed') as
          | 'completed'
          | 'incomplete'
          | 'not attempted',
      };
    case 'delay':
      return { type: 'delay', duration: asNumber(raw['duration'], 0) };
    default:
      // Unknown types degrade to a no-op jumpToSlide('') to keep the schema satisfied
      return { type: 'jumpToSlide', target: asString(raw['target'], '') };
  }
}

// ---- Variables ----

function compileVariables(vars: Record<string, JsonRecord>): VariableIR[] {
  const result: VariableIR[] = [];
  for (const [name, def] of Object.entries(vars)) {
    result.push({
      name,
      type: normalizeVarType(asString(def['type'], 'text')),
      defaultValue: def['defaultValue'],
      scope: (asString(def['scope'], 'course') as 'course' | 'slide' | 'local'),
      exportToLMS: def['exportToLMS'] === true,
      lmsMapping: def['lmsMapping'] as VariableIR['lmsMapping'],
    });
  }
  return result;
}

function normalizeVarType(t: string): VariableIR['type'] {
  switch (t) {
    case 'boolean':
    case 'trueFalse':
      return 'trueFalse';
    case 'number':
    case 'integer':
      return 'number';
    case 'text':
    default:
      return 'text';
  }
}

// ---- Navigation ----

function compileNavigation(nav: JsonRecord): NavigationIR {
  return {
    entrySlide: asString(nav['entrySlide'], ''),
    slides: (nav['slides'] as string[] | undefined) ?? [],
    showNavigationArrows: nav['showNavigationArrows'] === true,
    showProgressBar: nav['showProgressBar'] === true,
    showSlideNumber: nav['showSlideNumber'] === true,
  };
}

// ---- Quiz ----

function compileQuizStateMachine(quiz: JsonRecord | undefined): QuizStateMachineIR {
  if (!quiz) {
    return {
      id: '',
      questions: [],
      passingScore: 0,
      attemptsAllowed: 0,
      allowReview: false,
      randomizeQuestions: false,
      randomizeOptions: false,
    };
  }
  return {
    id: asString(quiz['id'], ''),
    questions: ((quiz['questions'] as JsonRecord[] | undefined) ?? []).map((q) => ({
      id: asString(q['id'], ''),
      type: asString(q['type'], 'multipleChoice'),
      text: asString(q['text'], ''),
      points: asNumber(q['points'], 1),
      options: q['options'] as unknown as Array<{ id: string; text: string; isCorrect?: boolean; weight?: number }>,
      correctAnswer: q['correctAnswer'] as string | string[] | number | undefined,
    })),
    passingScore: asNumber(quiz['passingScore'], 80),
    attemptsAllowed: asNumber(quiz['attemptsAllowed'], 0),
    allowReview: quiz['allowReview'] === true,
    randomizeQuestions: quiz['randomizeQuestions'] === true,
    randomizeOptions: quiz['randomizeOptions'] === true,
  };
}

/**
 * Convert the IR quiz state machine to the runtime course shape.
 * Returns undefined when the project has no quiz so we can skip emitting
 * the field entirely (avoids shipping an empty quiz block).
 */
function toRuntimeQuiz(qsm: QuizStateMachineIR): RuntimeCourse['quiz'] | undefined {
  if (!qsm || !qsm.id || qsm.questions.length === 0) return undefined;
  return {
    id: qsm.id,
    passingScore: qsm.passingScore,
    attemptsAllowed: qsm.attemptsAllowed,
    allowReview: qsm.allowReview,
    questions: qsm.questions.map((q) => {
      const out: NonNullable<RuntimeCourse['quiz']>['questions'][number] = {
        id: q.id,
        type: q.type,
        text: q.text,
        points: q.points,
      };
      if (q.options) {
        out.options = q.options.map((o) => ({
          id: o.id,
          label: o.text,
          isCorrect: o.isCorrect === true,
        }));
      }
      if (q.correctAnswer !== undefined && (typeof q.correctAnswer === 'string' || Array.isArray(q.correctAnswer))) {
        out.correctAnswer = q.correctAnswer;
      }
      if (q.caseSensitive !== undefined) out.caseSensitive = q.caseSensitive;
      if (q.wildcard !== undefined) out.wildcard = q.wildcard;
      if (q.tolerance !== undefined) out.tolerance = q.tolerance;
      return out;
    }),
  };
}

// ---- Media manifest ----

function compileMediaManifest(assets: Record<string, JsonRecord>): MediaAssetIR[] {
  const result: MediaAssetIR[] = [];
  for (const [id, raw] of Object.entries(assets)) {
    result.push({
      id,
      path: asString(raw['path'], ''),
      srcPath: asString(raw['srcPath'], asString(raw['path'], '')),
      type: (asString(raw['type'], 'image') as 'image' | 'audio' | 'video'),
      mimeType: asString(raw['mimeType'], 'application/octet-stream'),
      size: asNumber(raw['size'], 0),
      hash: asString(raw['hash'], id),
    });
  }
  return result;
}

// ---- RuntimeCourse transformations ----

function toRuntimeSlide(slide: SlideIR): RuntimeSlide {
  return {
    id: slide.id,
    title: slide.title,
    background: toRuntimeBackground(slide.background),
    objects: slide.objects.map(toRuntimeObject),
    layers: slide.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      objects: layer.objects.map(toRuntimeObject),
    })),
    triggers: slide.triggers.map(toRuntimeTrigger),
    audio: slide.audio?.src,
  };
}

function toRuntimeObject(obj: ObjectIR): RuntimeObject {
  const out: RuntimeObject = {
    id: obj.id,
    type: obj.type,
    rect: [obj.rect.x, obj.rect.y, obj.rect.w, obj.rect.h],
    content: obj.content,
    src: obj.src,
    altText: obj.altText,
    style: obj.style,
    states: obj.states,
    interactions: obj.interactions?.map((i) => ({
      id: i.id,
      type: i.type,
      correctResponse: i.correctResponse,
    })),
  };
  // Only emit visibility when it actually constrains rendering — i.e.
  // initial is hidden, or there's at least one conditional rule. The
  // common always-visible-no-rules case stays out of course.json.
  if (obj.visibility.initial === 'hidden' || obj.visibility.conditional.length > 0) {
    out.visibility = {
      initial: obj.visibility.initial,
      conditional: obj.visibility.conditional,
    };
  }
  return out;
}

function toRuntimeBackground(bg: BackgroundIR): RuntimeBackground {
  if (bg.type === 'gradient') {
    return {
      type: 'gradient',
      stops: bg.gradient?.stops,
      angle: bg.gradient?.angle,
    };
  }
  if (bg.type === 'media') {
    return { type: 'media', src: bg.media?.src };
  }
  return { type: 'solid', color: bg.color ?? '#FFFFFF' };
}

function toRuntimeTrigger(t: ResolvedTriggerIR): RuntimeTrigger {
  const out: RuntimeTrigger = {
    id: t.id,
    event: { type: t.event.type, source: t.event.source },
    action: t.actionGraph,
    priority: t.priority,
  };
  if (t.conditions && t.conditions.length > 0) out.conditions = t.conditions;
  return out;
}

function toRuntimeVariables(vars: VariableIR[]): Record<string, RuntimeVariable> {
  const result: Record<string, RuntimeVariable> = {};
  for (const v of vars) {
    const type: RuntimeVariable['type'] =
      v.type === 'trueFalse' ? 'boolean' : v.type === 'number' ? 'number' : 'text';
    result[v.name] = {
      type,
      default: v.defaultValue,
      scope: v.scope,
    };
  }
  return result;
}

function toRuntimeNavigation(nav: NavigationIR): RuntimeNavigation {
  return {
    entry: nav.entrySlide,
    slides: nav.slides,
    arrows: nav.showNavigationArrows,
    progress: nav.showProgressBar,
    slideNumber: nav.showSlideNumber,
  };
}

function toRuntimeMediaManifest(assets: MediaAssetIR[]): RuntimeMediaManifest {
  const result: RuntimeMediaManifest = {};
  for (const a of assets) {
    result[a.hash || a.id] = {
      type: a.type,
      path: a.path,
      mimeType: a.mimeType,
    };
  }
  return result;
}

function buildLmsConfig(opts: BuildRuntimeOptions): RuntimeLMSConfig {
  const cfg: RuntimeLMSConfig = { standard: opts.standard };
  if (opts.masteryScore !== undefined) cfg.masteryScore = opts.masteryScore;
  if (opts.lrsEndpoint) cfg.lrsEndpoint = opts.lrsEndpoint;
  if (opts.lrsAuth) cfg.lrsAuth = opts.lrsAuth;
  return cfg;
}

// ---- Coercion helpers ----

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
}
