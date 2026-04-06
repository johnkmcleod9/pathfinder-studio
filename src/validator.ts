/**
 * Pathfinder JSON Schema Validator
 * Uses Ajv for JSON Schema Draft-07 validation with forward-compatibility support.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Dynamic require for CJS modules that TypeScript ESM can't resolve cleanly
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AjvCtor = require('ajv');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addFormatsFn = require('ajv-formats');
const Ajv = AjvCtor.default ?? AjvCtor;
const addFormats = addFormatsFn.default ?? addFormatsFn;

// Schema registry — loads schemas by name
const SCHEMAS: Record<string, object> = {
  project:  JSON.parse(readFileSync(resolve(__dirname, 'schemas/project.schema.json'),  'utf8')),
  slide:    JSON.parse(readFileSync(resolve(__dirname, 'schemas/slide.schema.json'),    'utf8')),
  trigger:  JSON.parse(readFileSync(resolve(__dirname, 'schemas/trigger.schema.json'), 'utf8')),
  variable: JSON.parse(readFileSync(resolve(__dirname, 'schemas/variable.schema.json'),'utf8')),
};

// Build Ajv with formats (uuid, date-time, etc.)
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false,        // Allow extra schema keywords we don't support
  validateFormats: true
});
addFormats(ajv);

// Pre-compile all schemas
const validators = Object.fromEntries(
  Object.entries(SCHEMAS).map(([name, schema]) => [name, ajv.compile(schema)])
);

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
}

const KNOWN_EVENT_TYPES = new Set([
  'userClick', 'timelineStarts', 'timelineEnds', 'mediaEnds', 'mediaStarts',
  'variableChanges', 'questionSubmitted', 'sliderMoves', 'dragDropComplete',
  'courseStarts', 'courseEnds', 'resultsCalculated', 'mouseEnter', 'mouseExit',
  'focus', 'blur', 'keyPress', 'timelinePaused', 'timelineResumed', 'mediaPaused',
  'mediaSeeking', 'attemptStarted', 'attemptSubmitted', 'attemptReviewed',
  'formSubmitted', 'scrollIntoView', 'animationComplete', 'audioEnds', 'videoEnds',
  'quizPassed', 'quizFailed', 'surveyCompleted', 'linkClicked', 'buttonPressed',
  'dropdownChanged', 'checkboxChanged', 'radioChanged', 'timerExpired',
  'visitedSlides', 'visitedObjects'
]);

const KNOWN_ACTION_TYPES = new Set([
  'jumpToSlide', 'showLayer', 'hideLayer', 'setVariable', 'adjustVariable',
  'playMedia', 'pauseMedia', 'startTimeline', 'pauseTimeline', 'submitQuiz',
  'exitCourse', 'fireXAPIStatement', 'conditional', 'delay', 'stopMedia',
  'seekMedia', 'showObject', 'hideObject', 'enableObject', 'disableObject',
  'toggleObject', 'animateObject', 'setFocus', 'scrollToObject', 'showTooltip',
  'playAnimation', 'stopAnimation', 'sendEmail', 'openURL', 'showModal',
  'closeModal', 'showFeedback', 'hideFeedback', 'incrementCounter', 'decrementCounter',
  'resetVariable', 'resetQuiz', 'resetSlide', 'goBack', 'goForward',
  'showNavigation', 'hideNavigation', 'lockNavigation', 'unlockNavigation',
  'setSlideBackground', 'loadScene', 'executeJavaScript', 'waitForInteraction',
  'showCaption', 'hideCaption'
]);

/**
 * Forward-compatibility check: warn on unknown event/action types.
 * This allows the schema to accept future event/action types without breaking.
 */
function collectWarnings(data: unknown, path = ''): string[] {
  const warnings: string[] = [];

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    // Check trigger event types
    if (obj.event && typeof obj.event === 'object') {
      const event = obj.event as Record<string, unknown>;
      const eventType = event.type as string;
      if (eventType && !KNOWN_EVENT_TYPES.has(eventType)) {
        warnings.push(`Unknown event type "${eventType}" at ${path}.event — forward-compat allowed`);
      }
    }

    // Check trigger action types
    if (obj.action && typeof obj.action === 'object') {
      const action = obj.action as Record<string, unknown>;
      const actionType = action.type as string;
      if (actionType && !KNOWN_ACTION_TYPES.has(actionType)) {
        warnings.push(`Unknown action type "${actionType}" at ${path}.action — forward-compat allowed`);
      }
    }

    // Recurse into arrays and objects
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        val.forEach((item, i) => {
          warnings.push(...collectWarnings(item, `${path}.${key}[${i}]`));
        });
      } else if (val && typeof val === 'object') {
        warnings.push(...collectWarnings(val, `${path}.${key}`));
      }
    }
  }

  return warnings;
}

export function validate(schemaName: 'project' | 'slide' | 'trigger' | 'variable', data: unknown): ValidationResult {
  const validator = validators[schemaName];
  if (!validator) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }

  const valid = validator(data);
  const errors: ValidationError[] = (validator.errors ?? []).map((err: { instancePath: string; message?: string; keyword: string; params: Record<string, unknown> }) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'unknown error',
    keyword: err.keyword,
    params: err.params
  }));

  const warnings = collectWarnings(data);

  return { valid, errors, warnings };
}

export { SCHEMAS };
