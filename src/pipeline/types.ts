/**
 * Pathfinder Publishing Pipeline — Type Definitions
 * Shared types used across all pipeline stages.
 */

// ---------------------------------------------------------------------------
// Project structure (from .pathfinder JSON)
// ---------------------------------------------------------------------------

export interface Project {
  $schema: string;
  schemaVersion: string;
  formatVersion: string;
  metadata: ProjectMetadata;
  settings?: ProjectSettings;
  slides: Slide[];
  variables: Record<string, VariableDef>;
  quizBanks?: Record<string, QuizBank>;
  navigation: Navigation;
  localization?: Localization;
}

export interface ProjectMetadata {
  id: string;
  title: string;
  author: string;
  authorId: string;
  createdAt: string;
  modifiedAt: string;
  description?: string;
  tags?: string[];
  version?: string;
  language?: string;
  defaultDuration?: string;
  thumbnail?: string;
}

export interface ProjectSettings {
  canvas?: CanvasSettings;
  player?: PlayerSettings;
  publish?: PublishSettings;
  accessibility?: AccessibilitySettings;
}

export interface CanvasSettings {
  width: number;
  height: number;
  aspectRatio?: '16:9' | '4:3' | '16:10' | '21:9';
  backgroundColor?: string;
}

export interface PlayerSettings {
  showNavigationArrows?: boolean;
  showProgressBar?: boolean;
  showSlideNumber?: boolean;
  showAudioPlayer?: boolean;
  showCCButton?: boolean;
  showSearch?: boolean;
  colorScheme?: { primary?: string; secondary?: string };
  logo?: string;
  logoPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export interface PublishSettings {
  defaultStandard?: 'scorm12' | 'scorm2004' | 'xapi' | 'html5';
  passingScore?: number;
  completionCriteria?: 'slides_viewed' | 'quiz_passed' | 'all_slides' | 'time_spent';
  completionValue?: string;
  allowReview?: boolean;
  exitBehavior?: 'resume' | 'start' | 'exit';
}

export interface AccessibilitySettings {
  focusHighContrast?: boolean;
  autoAltTextFromOCR?: boolean;
  reducedMotion?: 'respect-system-setting' | 'always-on' | 'always-off';
}

export interface Slide {
  id: string;
  title?: string;
  layout?: string;
  background: Background;
  zOrder: string[];
  objects: Record<string, SlideObject>;
  layers?: Layer[];
  triggers?: Trigger[];
  audio?: AudioRef;
  notes?: string;
}

export interface Layer {
  id: string;
  name: string;
  visible?: boolean;
  background?: Background;
  objects: Record<string, SlideObject>;
}

export interface Background {
  type: 'solid' | 'gradient' | 'image' | 'video';
  color?: string;
  gradient?: Gradient;
  media?: MediaRef;
}

export interface Gradient {
  type: 'linear' | 'radial';
  angle?: number;
  stops: GradientStop[];
}

export interface GradientStop {
  color: string;
  position: number; // 0–1
}

export interface MediaRef {
  id: string;
  src: string;
  alt?: string;
}

export interface AudioRef {
  id: string;
  src: string;
  volume?: number;
  loop?: boolean;
}

export interface SlideObject {
  type: string;
  rect: Rect;
  visibility?: Visibility;
  triggers?: Trigger[];
  [key: string]: unknown;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Visibility {
  initial?: 'visible' | 'hidden' | 'conditional';
  conditional?: unknown[];
}

export interface Trigger {
  id: string;
  event: TriggerEvent;
  action: TriggerAction;
  conditions?: TriggerCondition[];
  priority?: number;
  description?: string;
  disabled?: boolean;
}

export interface TriggerEvent {
  type: string;
  source?: string;
}

export interface TriggerAction {
  type: string;
  [key: string]: unknown;
}

export interface TriggerCondition {
  type: string;
  variable: string;
  operator?: string;
  value?: unknown;
  [key: string]: unknown;
}

export interface VariableDef {
  type: 'trueFalse' | 'boolean' | 'number' | 'text' | 'slider' | 'sequence' | 'date' | 'math';
  defaultValue: unknown;
  scope?: 'course' | 'scene' | 'quiz' | 'slide';
  persistAcrossSessions?: boolean;
  exportToLMS?: boolean;
  lmsMapping?: LmsMapping;
  description?: string;
  tags?: string[];
  min?: number;
  max?: number;
  decimalPlaces?: number;
  maxLength?: number;
  validValues?: unknown[];
}

export interface LmsMapping {
  standard: 'scorm12' | 'scorm2004' | 'xapi';
  key: string;
}

export interface Navigation {
  entrySlide: string;
  slides: string[];
  sectionDefaults?: {
    navArrows?: boolean;
    glossaryLink?: boolean;
  };
}

export interface Localization {
  playerLabels?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Quiz types
// ---------------------------------------------------------------------------

export interface QuizBank {
  id: string;
  questions: QuizQuestion[];
}

export type QuizQuestion =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | FillBlankQuestion
  | NumericQuestion
  | MatchingQuestion
  | SequencingQuestion
  | HotspotQuestion
  | DragDropQuestion;

export interface BaseQuestion {
  id: string;
  type: string;
  text: string;
  points?: number;
  feedback?: { correct?: string; incorrect?: string };
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multipleChoice';
  options: { id: string; text: string; correct: boolean; weight?: number }[];
  allowMultiple?: boolean;
  randomize?: boolean;
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: 'trueFalse';
  correct: boolean;
}

export interface FillBlankQuestion extends BaseQuestion {
  type: 'fillBlank';
  patterns: string[]; // wildcard patterns for acceptable answers
  caseSensitive?: boolean;
}

export interface NumericQuestion extends BaseQuestion {
  type: 'numeric';
  correct: number;
  tolerance?: number;
}

export interface MatchingQuestion extends BaseQuestion {
  type: 'matching';
  pairs: { left: string; right: string }[];
}

export interface SequencingQuestion extends BaseQuestion {
  type: 'sequencing';
  items: { id: string; text: string; correctPosition: number }[];
}

export interface HotspotQuestion extends BaseQuestion {
  type: 'hotspot';
  image: MediaRef;
  regions: { id: string; shape: 'rect' | 'circle' | 'polygon'; coords: number[]; correct: boolean }[];
}

export interface DragDropQuestion extends BaseQuestion {
  type: 'dragDrop';
  items: { id: string; text: string }[];
  dropZones: { id: string; text: string; correctItemId: string }[];
}

// ---------------------------------------------------------------------------
// Pipeline stage types
// ---------------------------------------------------------------------------

export type PipelineStage =
  | 'parse'
  | 'media-resolution'
  | 'story-compile'
  | 'html-generate'
  | 'lms-adapt'
  | 'media-optimize'
  | 'package'
  | 'validate';

export interface PipelineProgress {
  stage: PipelineStage;
  percent: number;
  message?: string;
}

export interface PipelineResult {
  success: boolean;
  outputPath?: string;
  errors: PipelineError[];
  warnings: string[];
  artifacts: PipelineArtifact[];
}

export interface PipelineError {
  stage: PipelineStage;
  code: string;
  message: string;
  detail?: string;
}

export interface PipelineArtifact {
  name: string;
  path: string;
  size?: number;
  type: 'file' | 'directory';
}

export interface PipelineOptions {
  standard: 'scorm12' | 'scorm2004' | 'xapi' | 'html5';
  qualityPreset: 'low' | 'high' | 'medium';
  outputDir: string;
  projectPath: string;
  cancelToken?: CancellationToken;
}

export interface CancellationToken {
  isCancelled: boolean;
}

// ---------------------------------------------------------------------------
// LMS manifest types
// ---------------------------------------------------------------------------

export interface ImsManifest {
  manifest: {
    identifier: string;
    version: string;
    xmlns: string;
    metadata: {
      schemaversion: string;
      [key: string]: unknown;
    };
    organizations: {
      default: string;
      organization: ImsOrganization[];
    };
    resources: {
      resource: ImsResource[];
    };
    [key: string]: unknown;
  };
}

export interface ImsOrganization {
  identifier: string;
  title: string;
  item: ImsItem[];
}

export interface ImsResource {
  identifier: string;
  type: string;
  href: string;
  'adlcp:masteryscore'?: string;
  file?: Array<{ href: string }>;
}

export interface ImsItem {
  identifier: string;
  title: string;
  identifierref: string;
  item?: ImsItem[];
}

// ---------------------------------------------------------------------------
// Story compile output
// ---------------------------------------------------------------------------

export interface StoryCompileOutput {
  version: string;
  slides: CompiledSlide[];
  variables: CompiledVariable[];
  triggers: CompiledTrigger[];
  navigation: string[];
  quizData?: CompiledQuizBank[];
  metadata: {
    title: string;
    author: string;
    exitBehavior: string;
    passingScore: number;
  };
}

export interface CompiledSlide {
  id: string;
  objects: CompiledObject[];
  background: CompiledBackground;
  audio?: { src: string; volume: number; loop: boolean };
  timeline?: CompiledTimeline;
}

export interface CompiledObject {
  id: string;
  type: string;
  rect: Rect;
  states?: Record<string, unknown>;
  animations?: CompiledAnimation[];
  triggers?: CompiledTrigger[];
  [key: string]: unknown;
}

export interface CompiledBackground {
  type: 'solid' | 'gradient' | 'image' | 'video';
  color?: string;
  gradient?: Gradient;
  src?: string;
}

export interface CompiledAnimation {
  type: 'fadeIn' | 'flyIn' | 'wipe' | 'motionPath';
  duration: number; // ms
  easing?: string;
  waypoints?: { x: number; y: number }[];
}

export interface CompiledTimeline {
  duration: number;
  tracks: CompiledTimelineTrack[];
}

export interface CompiledTimelineTrack {
  objectId: string;
  animations: CompiledAnimation[];
}

export interface CompiledVariable {
  name: string;
  type: string;
  initialValue: unknown;
  scope: string;
}

export interface CompiledTrigger {
  eventType: string;
  sourceId?: string;
  actionType: string;
  actionParams: Record<string, unknown>;
  conditions?: CompiledCondition[];
  priority: number;
}

export interface CompiledCondition {
  variable: string;
  operator: string;
  value: unknown;
  type: string;
}

export interface CompiledQuizBank {
  id: string;
  questions: CompiledQuestion[];
}

export interface CompiledQuestion {
  id: string;
  type: string;
  text: string;
  points: number;
  data: Record<string, unknown>;
}
