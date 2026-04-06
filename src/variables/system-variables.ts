/**
 * System Variables — built-in read-only (and semi-writable) variables.
 *
 * Spec §3.3: Course, Learner, Navigation, Scoring, Interaction, DateTime, Media.
 * Format: dotted path e.g. `slide.current.number`, `learner.name`
 */

export type SystemVariableScope = 'course' | 'learner' | 'slide' | 'scene' | 'quiz' | 'interaction' | 'completion' | 'system' | 'media';

export interface SystemVariableDef {
  key: string;
  type: 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'time' | 'duration';
  description: string;
  /** Whether this can be written via setVariable action */
  writable: boolean;
  scope: SystemVariableScope;
}

export const SYSTEM_VARIABLES: SystemVariableDef[] = [
  // ─── Course ───────────────────────────────────────────────────────────────
  { key: 'course.id',           type: 'text',     description: 'Unique course identifier',           writable: false, scope: 'course' },
  { key: 'course.title',       type: 'text',     description: 'Course title from project settings',  writable: false, scope: 'course' },
  { key: 'course.version',     type: 'text',     description: 'Version string',                      writable: false, scope: 'course' },
  { key: 'session.id',         type: 'text',     description: 'Unique session ID (new each launch)', writable: false, scope: 'course' },
  { key: 'session.startTime', type: 'date',     description: 'When current session started',        writable: false, scope: 'course' },
  { key: 'session.totalTime', type: 'duration', description: 'Total time in course this session',  writable: false, scope: 'course' },
  { key: 'session.language',  type: 'text',     description: "User's browser/language setting",     writable: false, scope: 'course' },

  // ─── Learner ──────────────────────────────────────────────────────────────
  { key: 'learner.id',         type: 'text',     description: 'LMS user ID or guest token',         writable: false, scope: 'learner' },
  { key: 'learner.name',      type: 'text',     description: 'Full name from LMS',                   writable: false, scope: 'learner' },
  { key: 'learner.firstName', type: 'text',     description: 'First name',                          writable: false, scope: 'learner' },
  { key: 'learner.lastName',  type: 'text',     description: 'Last name',                           writable: false, scope: 'learner' },
  { key: 'learner.email',     type: 'text',     description: 'Email (if available from LMS)',        writable: false, scope: 'learner' },
  { key: 'learner.department',type: 'text',     description: 'From LMS user profile',               writable: false, scope: 'learner' },
  { key: 'learner.manager',   type: 'text',     description: 'Manager name from LMS',                writable: false, scope: 'learner' },

  // ─── Navigation ───────────────────────────────────────────────────────────
  { key: 'slide.current.id',   type: 'text',     description: 'UUID of currently active slide',      writable: false, scope: 'slide' },
  { key: 'slide.current.name', type: 'text',     description: 'Name of the current slide',          writable: false, scope: 'slide' },
  { key: 'slide.current.number', type: 'integer', description: '1-indexed global slide number',     writable: false, scope: 'slide' },
  { key: 'slide.current.sceneId',   type: 'text', description: 'UUID of current scene',              writable: false, scope: 'slide' },
  { key: 'slide.current.sceneName', type: 'text', description: 'Name of current scene',             writable: false, scope: 'slide' },
  { key: 'slide.previous.id',  type: 'text',     description: 'UUID of previous slide',             writable: false, scope: 'slide' },
  { key: 'slide.visitedCount',type: 'integer', description: 'Number of unique slides visited',     writable: false, scope: 'slide' },
  { key: 'scene.current.id',  type: 'text',     description: 'UUID of current scene',              writable: false, scope: 'scene' },
  { key: 'scene.current.name', type: 'text',     description: 'Name of current scene',             writable: false, scope: 'scene' },
  { key: 'scene.current.slideCount', type: 'integer', description: 'Number of slides in current scene', writable: false, scope: 'scene' },
  { key: 'scene.current.slideIndex', type: 'integer', description: '0-indexed position within scene', writable: false, scope: 'scene' },
  { key: 'scene.enterCount',   type: 'integer', description: 'Times current scene was entered',    writable: false, scope: 'scene' },
  { key: 'slide.enterCount',   type: 'integer', description: 'Times current slide was visited',    writable: false, scope: 'slide' },

  // ─── Quiz / Scoring ──────────────────────────────────────────────────────
  { key: 'quiz.score',          type: 'number',  description: 'Current quiz score (0-100 scale)',      writable: true,  scope: 'quiz' },
  { key: 'quiz.scoreRaw',      type: 'number',  description: 'Raw point total',                    writable: true,  scope: 'quiz' },
  { key: 'quiz.scorePercent',  type: 'number',  description: 'Score as percentage',                writable: false, scope: 'quiz' },
  { key: 'quiz.passed',        type: 'boolean', description: 'True if score >= passing score',    writable: false, scope: 'quiz' },
  { key: 'quiz.questionsCorrect', type: 'integer', description: 'Number of correct answers',       writable: false, scope: 'quiz' },
  { key: 'quiz.questionsTotal', type: 'integer', description: 'Total questions',                   writable: false, scope: 'quiz' },
  { key: 'quiz.attemptsUsed',  type: 'integer', description: 'Number of attempts used',           writable: false, scope: 'quiz' },
  { key: 'quiz.attemptsRemaining', type: 'integer', description: 'Remaining attempts',            writable: false, scope: 'quiz' },
  { key: 'quiz.isComplete',    type: 'boolean', description: 'True if quiz is submitted',         writable: false, scope: 'quiz' },
  { key: 'resultsSlide.scoreRange', type: 'text', description: 'Name of score range learner fell into', writable: false, scope: 'quiz' },

  // ─── Interaction ─────────────────────────────────────────────────────────
  { key: 'interaction.totalClicks',       type: 'integer', description: 'Total clicks in course',           writable: false, scope: 'interaction' },
  { key: 'interaction.totalTime',         type: 'duration', description: 'Total time across all sessions',  writable: false, scope: 'interaction' },
  { key: 'interaction.averageTimePerSlide', type: 'duration', description: 'Average time per slide',        writable: false, scope: 'interaction' },

  // ─── Completion ─────────────────────────────────────────────────────────
  { key: 'completion.status',   type: 'text',     description: 'not started|in progress|completed|passed|failed', writable: false, scope: 'completion' },
  { key: 'completion.progress',  type: 'number',   description: 'Percentage of course completed (0-100)',   writable: false, scope: 'completion' },
  { key: 'completion.slidesViewed', type: 'integer', description: 'Number of slides viewed',             writable: false, scope: 'completion' },
  { key: 'completion.totalSlides', type: 'integer', description: 'Total slides in course',              writable: false, scope: 'completion' },

  // ─── Date/Time/Platform ─────────────────────────────────────────────────
  { key: 'system.date',         type: 'date',    description: "Current date",                          writable: false, scope: 'system' },
  { key: 'system.time',         type: 'time',    description: 'Seconds from midnight',                writable: false, scope: 'system' },
  { key: 'system.datetime',     type: 'date',    description: 'Current date + time',                  writable: false, scope: 'system' },
  { key: 'system.platform',     type: 'text',    description: 'mac|ios|web|lms',                    writable: false, scope: 'system' },
  { key: 'system.browser',      type: 'text',    description: 'Browser name (web output)',           writable: false, scope: 'system' },
  { key: 'system.browserVersion',type: 'text',    description: 'Browser version',                     writable: false, scope: 'system' },
  { key: 'system.os',           type: 'text',    description: 'Operating system',                   writable: false, scope: 'system' },
  { key: 'system.screenWidth',  type: 'integer', description: 'Screen width in pixels',              writable: false, scope: 'system' },
  { key: 'system.screenHeight', type: 'integer', description: 'Screen height in pixels',             writable: false, scope: 'system' },
];

// Media variables are dynamic: media.[id].currentTime etc.
// These are generated on demand per media instance.

// Build a lookup map
const SYSTEM_VAR_MAP = new Map<string, SystemVariableDef>();
for (const v of SYSTEM_VARIABLES) SYSTEM_VAR_MAP.set(v.key, v);

export function getSystemVariable(key: string): SystemVariableDef | undefined {
  return SYSTEM_VAR_MAP.get(key);
}

export function isSystemVariable(key: string): boolean {
  return SYSTEM_VAR_MAP.has(key);
}

export function isMediaVariable(key: string): boolean {
  return key.startsWith('media.') || key.startsWith('media[');
}

export function getMediaVariableDef(mediaId: string, property: string): { key: string; type: 'duration' | 'number' | 'boolean' | 'integer'; description: string } | undefined {
  const props: Record<string, { type: 'duration' | 'number' | 'boolean' | 'integer'; description: string }> = {
    currentTime:    { type: 'duration', description: 'Current playback position in seconds' },
    duration:       { type: 'duration', description: 'Total duration' },
    percentComplete: { type: 'number',  description: 'Percentage played' },
    isPlaying:      { type: 'boolean', description: 'Currently playing' },
    volume:         { type: 'integer', description: 'Volume 0-100' },
    isMuted:        { type: 'boolean', description: 'Muted state' },
  };
  const def = props[property];
  if (!def) return undefined;
  return { key: `media.${mediaId}.${property}`, ...def };
}
