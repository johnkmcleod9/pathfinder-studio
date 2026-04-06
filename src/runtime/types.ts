// ---- Runtime Types — shared between publish pipeline and runtime engine ----

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
  label?: string;
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
  action: ActionNode;
  conditions?: Condition[];
  priority: number;
}

export interface ActionNode {
  type: ActionType;
  target?: string;
  variable?: string;
  value?: unknown;
  operation?: VariableOperation;
  verb?: string;
  object?: XAPIObject;
  result?: XAPIResult;
  branches?: ConditionalBranch[];
  else?: ActionNode[];
  duration?: number;
}

export type ActionType =
  | 'jumpToSlide'
  | 'showLayer'
  | 'hideLayer'
  | 'setVariable'
  | 'adjustVariable'
  | 'playMedia'
  | 'pauseMedia'
  | 'submitQuiz'
  | 'exitCourse'
  | 'fireXAPIStatement'
  | 'conditional'
  | 'delay'
  | 'startTimeline'
  | 'pauseTimeline';

export type VariableOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'set' | 'toggle';

export interface ConditionalBranch {
  conditions: Condition[];
  then: ActionNode[];
}

export interface Condition {
  type: ConditionType;
  variable?: string;
  operator?: string;
  value?: unknown;
  scoreValue?: number;
  interactionResult?: string;
}

export type ConditionType =
  | 'variableEquals'
  | 'variableNotEquals'
  | 'variableGreaterThan'
  | 'variableLessThan'
  | 'variableGreaterThanOrEqual'
  | 'variableLessThanOrEqual'
  | 'scoreGreaterThan'
  | 'scoreLessThan'
  | 'interactionCorrect'
  | 'interactionIncorrect';

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
  standard: 'scorm12' | 'scorm2004' | 'xapi' | 'none';
  endpoint?: string;
  auth?: string;
  activityId?: string;
  masterScore?: number;
}

// ---- LMS Adapter interface ----

export interface LMSAdapter {
  initialize(): Promise<boolean>;
  terminate(): Promise<boolean>;
  setValue(key: string, value: string): Promise<boolean>;
  getValue(key: string): Promise<string>;
  commit(): Promise<boolean>;
  sendStatement?(stmt: XAPIStatement): Promise<void>;
  saveLocation?(slideId: string): Promise<void>;
  saveScore?(raw: number, min?: number, max?: number, scaled?: number): Promise<void>;
  saveCompletion?(status: string): Promise<void>;
  getLearnerInfo(): LearnerInfo;
}

export interface LearnerInfo {
  name?: string;
  mbox?: string;
  mboxSha1sum?: string;
  openId?: string;
}

// ---- xAPI types ----

export interface XAPIStatement {
  verb: string;
  object: XAPIObject;
  result?: XAPIResult;
  context?: Record<string, unknown>;
}

export interface XAPIObject {
  id: string;
  definition?: {
    name?: Record<string, string>;
    type?: string;
  };
}

export interface XAPIResult {
  score?: { scaled?: number; raw?: number; min?: number; max?: number };
  success?: boolean;
  completion?: boolean;
  response?: string;
}

// ---- Runtime runtime types ----

export interface QuizAttempt {
  id: string;
  state: 'in_progress' | 'submitted' | 'completed';
  answers: Record<string, string>;
  startTime: number;
  submittedAt?: number;
}

export interface QuizScore {
  percent: number;
  status: 'passed' | 'failed' | 'incomplete';
  raw: number;
  possible: number;
  questionsCorrect: number;
  questionsTotal: number;
}
