/**
 * Publish pipeline types — shared across all stages and adapters.
 * These types mirror the runtime's expectations so the pipeline
 * produces the exact course.json format the runtime reads.
 */

// LMS output standards
export type OutputStandard = 'scorm12' | 'scorm2004' | 'xapi' | 'html5';

// Quality presets affect media optimization levels
export type QualityPreset = 'low' | 'medium' | 'high';

// Pipeline stage identifiers
export type StageId =
  | 0 | 1 | 2 | 3 | 4
  | 5 | 6 | 7;

export const STAGE_NAMES: Record<StageId, string> = {
  0: 'Unpack',
  1: 'Validate',
  2: 'Normalize',
  3: 'Compile IR',
  4: 'LMS Adapter',
  5: 'Optimize',
  6: 'Package',
  7: 'Output',
};

// ---- Pipeline context ----

export interface PublishOptions {
  inputPath: string;
  outputPath: string;
  standard: OutputStandard;
  quality: QualityPreset;
  validateOnly?: boolean;
  // SCORM-specific
  masteryScore?: number;        // SCORM 2004: cmi.score.mastery
  // xAPI-specific
  lrsEndpoint?: string;
  lrsAuth?: string;
  // Internal
  basePath?: string;            // For unit tests: temp directory
}

export interface PublishReport {
  success: boolean;
  outputPath?: string;
  packageSize?: number;         // bytes
  slideCount: number;
  mediaCount: number;           // total media files processed by Stage 5
  mediaOptimized: number;       // count of files the optimizer actually shrank
  mediaBytesSaved: number;      // sum of (originalSize - optimizedSize)
  standard: OutputStandard;
  quality: QualityPreset;
  duration: number;             // ms
  stageDurations: Record<StageId, number>;
  errors: PublishError[];
  warnings: PublishWarning[];
  checksum?: string;            // SHA-256 of final ZIP
}

export interface PublishError {
  stage: StageId;
  code: string;
  message: string;
  detail?: string;
}

export interface PublishWarning {
  code: string;
  message: string;
}

export type ProgressCallback = (stage: StageId, progress: number, message?: string) => void;

// ---- Intermediate representations ----

export interface CourseIR {
  metadata: CourseMetadataIR;
  slides: SlideIR[];
  variables: VariableIR[];
  quizStateMachine: QuizStateMachineIR;
  navigation: NavigationIR;
  mediaManifest: MediaAssetIR[];
}

export interface CourseMetadataIR {
  id: string;
  title: string;
  author: string;
  language: string;
  defaultDuration?: string;     // ISO 8601 duration
  schemaVersion: string;
  formatVersion: string;
}

export interface SlideIR {
  id: string;
  title: string;
  objects: ObjectIR[];
  layers: LayerIR[];
  triggers: ResolvedTriggerIR[];
  background: BackgroundIR;
  audio?: MediaRefIR;
}

export interface ObjectIR {
  id: string;
  type: string;                // 'text' | 'image' | 'shape' | 'button' | 'hotspot' | 'drag-drop' | 'video' | 'audio'
  rect: RectIR;
  content?: string;            // text/html content
  style?: Record<string, unknown>;
  src?: string;                // media reference for image/video/audio
  altText?: string;
  visibility: VisibilityIR;
  states?: Record<string, Record<string, unknown>>;
  interactions?: InteractionIR[];
}

export interface RectIR {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayerIR {
  id: string;
  name: string;
  visible: boolean;
  objects: ObjectIR[];
}

export interface VisibilityIR {
  initial: 'visible' | 'hidden';
  conditional: ConditionalVisibilityIR[];
}

export interface ConditionalVisibilityIR {
  conditions: ConditionIR[];
  then: 'visible' | 'hidden';
}

export interface ConditionIR {
  type: 'variableEquals' | 'variableGreaterThan' | 'variableLessThan' | 'scoreGreaterThan' | 'scoreLessThan' | 'interactionCorrect';
  variable?: string;
  value?: string | number | boolean;
  scoreThreshold?: number;
}

export interface InteractionIR {
  id: string;
  type: string;
  correctResponse?: string | string[];
}

export interface BackgroundIR {
  type: 'solid' | 'gradient' | 'media';
  color?: string;
  gradient?: GradientIR;
  media?: MediaRefIR;
}

export interface GradientIR {
  stops: Array<{ offset: number; color: string }>;
  angle: number;
}

export interface MediaRefIR {
  id: string;
  src: string;                 // content-addressed path within ZIP
  type: 'image' | 'audio' | 'video';
  mimeType: string;
  size?: number;
}

export interface ResolvedTriggerIR {
  id: string;
  event: EventIR;
  actionGraph: ActionNodeIR;
  conditions?: ConditionIR[];
  priority: number;
}

export interface EventIR {
  type: string;
  source?: string;
}

export type ActionNodeIR =
  | { type: 'jumpToSlide'; target: string }
  | { type: 'showLayer'; target: string }
  | { type: 'hideLayer'; target: string }
  | { type: 'setVariable'; variable: string; value: unknown }
  | { type: 'adjustVariable'; variable: string; operation: 'add' | 'subtract' | 'set' | 'toggle'; value: number | boolean }
  | { type: 'playMedia'; target: string }
  | { type: 'pauseMedia'; target: string }
  | { type: 'submitQuiz'; target: string }
  | { type: 'exitCourse'; completionStatus: 'completed' | 'incomplete' | 'not attempted' }
  | { type: 'fireXAPIStatement'; verb: string; object: unknown; result?: unknown; context?: unknown }
  | { type: 'conditional'; branches: ConditionalBranchIR[]; else?: ActionNodeIR[] }
  | { type: 'delay'; duration: number };

export interface ConditionalBranchIR {
  conditions: ConditionIR[];
  then: ActionNodeIR[];
}

export interface VariableIR {
  name: string;
  type: 'boolean' | 'number' | 'text' | 'trueFalse';
  defaultValue: unknown;
  scope: 'course' | 'slide' | 'local';
  exportToLMS: boolean;
  lmsMapping?: {
    standard: 'scorm2004' | 'scorm12';
    key: string;
  };
}

export interface QuizStateMachineIR {
  id: string;
  questions: QuizQuestionIR[];
  passingScore: number;
  attemptsAllowed: number;
  allowReview: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
}

export interface QuizQuestionIR {
  id: string;
  type: string;
  text: string;
  points: number;
  options?: QuizOptionIR[];
  correctAnswer?: string | string[] | number;
  caseSensitive?: boolean;
  wildcard?: boolean;
  tolerance?: number;
  pairs?: Array<{ key: string; value: string }>;
  hotspotRegion?: RectIR;
  attemptsAllowed?: number;
}

export interface QuizOptionIR {
  id: string;
  text: string;
  isCorrect?: boolean;
  weight?: number;
}

export interface NavigationIR {
  entrySlide: string;
  slides: string[];
  showNavigationArrows: boolean;
  showProgressBar: boolean;
  showSlideNumber: boolean;
}

export interface MediaAssetIR {
  id: string;
  path: string;                // content-addressed path
  srcPath: string;             // original source path
  type: 'image' | 'audio' | 'video';
  mimeType: string;
  size: number;
  hash: string;                // SHA-256
}

// ---- SCORM manifest types ----

export interface ImsManifest {
  identifier: string;
  version: string;
  title: string;
  organizations: ImsOrganization[];
  resources: ImsResource[];
  metadata?: ImsMetadata;
}

export interface ImsOrganization {
  identifier: string;
  title: string;
  structure: 'rooted' | 'flat';
  items: ImsItem[];
}

export interface ImsItem {
  identifier: string;
  title: string;
  resource?: string;
  children?: ImsItem[];
  // SCORM 2004 sequencing
  parameters?: string;
  launchData?: string;
  objectives?: ImsObjective[];
  sequencing?: ImsSequencing;
}

export interface ImsObjective {
  id: string;
  satisfiedByMeasure: boolean;
  minNormalizedMeasure: number;
}

export interface ImsSequencing {
  controlMode?: { choice?: boolean; flow?: boolean; forwardOnly?: boolean };
  completionSet?: { tracked?: boolean; attemptDuration?: string };
  objectives?: { primaryObj?: string; objectiveList?: ImsObjective[] };
  rollupRules?: ImsRollupRule[];
}

export interface ImsRollupRule {
  condition: string;
  childActivityType: string;
  action: string;
  targetObjective?: string;
}

export interface ImsResource {
  identifier: string;
  type: string;
  href: string;
  files: string[];
  metadata?: ImsMetadata;
  SCORMType?: 'sco' | 'asset';
  adlcpScormType?: 'sco' | 'asset';
}

export interface ImsMetadata {
  title?: string;
  description?: string;
  keyword?: string[];
  coverage?: string;
  type?: string;
  rights?: string;
  language?: string;
}

// ---- Runtime course.json format ----

export interface RuntimeCourse {
  format: 'pathfinder-v1';
  version: string;
  metadata: {
    id: string;
    title: string;
    author: string;
    language: string;
  };
  canvas: { width: number; height: number; backgroundColor: string };
  slides: RuntimeSlide[];
  variables: Record<string, RuntimeVariable>;
  navigation: RuntimeNavigation;
  quiz?: RuntimeQuiz;
  media: RuntimeMediaManifest;
  lms: RuntimeLMSConfig;
}

export interface RuntimeSlide {
  id: string;
  title: string;
  background: RuntimeBackground;
  objects: RuntimeObject[];
  layers: RuntimeLayer[];
  triggers: RuntimeTrigger[];
  audio?: string;
}

export interface RuntimeObject {
  id: string;
  type: string;
  rect: [number, number, number, number]; // [x, y, w, h]
  content?: string;
  src?: string;
  altText?: string;
  style?: Record<string, unknown>;
  states?: Record<string, Record<string, unknown>>;
  interactions?: RuntimeInteraction[];
}

export interface RuntimeBackground {
  type: 'solid' | 'gradient' | 'media';
  color?: string;
  stops?: Array<{ offset: number; color: string }>;
  angle?: number;
  src?: string;
}

export interface RuntimeLayer {
  id: string;
  name: string;
  visible: boolean;
  objects: RuntimeObject[];
}

export interface RuntimeTrigger {
  id: string;
  event: { type: string; source?: string };
  action: ActionNodeIR;
  conditions?: ConditionIR[];
  priority: number;
}

export interface RuntimeInteraction {
  id: string;
  type: string;
  choices?: Array<{ id: string; description: string }>;
  correctResponse?: string | string[];
}

export interface RuntimeVariable {
  type: 'boolean' | 'number' | 'text';
  default: unknown;
  scope: 'course' | 'slide' | 'local';
}

export interface RuntimeNavigation {
  entry: string;
  slides: string[];
  arrows: boolean;
  progress: boolean;
  slideNumber: boolean;
}

export interface RuntimeQuiz {
  id: string;
  questions: RuntimeQuestion[];
  passingScore: number;
  attemptsAllowed: number;
  allowReview: boolean;
}

export interface RuntimeQuestion {
  id: string;
  type: string;
  text: string;
  points: number;
  options?: Array<{ id: string; label: string; isCorrect: boolean }>;
  correctAnswer?: string | string[];
  caseSensitive?: boolean;
  wildcard?: boolean;
  tolerance?: number;
}

export interface RuntimeMediaManifest {
  [contentHash: string]: {
    type: 'image' | 'audio' | 'video';
    path: string;
    mimeType: string;
  };
}

export interface RuntimeLMSConfig {
  standard: OutputStandard;
  masteryScore?: number;
  lrsEndpoint?: string;
  lrsAuth?: string;
  exitBehavior?: 'resume' | 'exit';
}
