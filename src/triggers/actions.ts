/**
 * Trigger Actions — all 40+ action types the trigger engine can execute.
 */

export type ActionParameter =
  | { name: string; type: 'string' }
  | { name: string; type: 'number' }
  | { name: string; type: 'boolean' }
  | { name: string; type: 'array' }
  | { name: string; type: 'object' }
  | { name: string; type: 'any' };

export interface ActionDefinition {
  type: string;
  description: string;
  /** Whether this action is asynchronous (e.g. wait, callWebhook) */
  isAsync: boolean;
  /** Whether this action can be chained in a sequence */
  chainable: boolean;
  parameters: ActionParameter[];
}

export const TRIGGER_ACTIONS: Record<string, ActionDefinition> = {
  // ─── Navigation ────────────────────────────────────────────────────────────
  jumpToSlide: {
    type: 'jumpToSlide',
    description: 'Navigate to a specific slide',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  goBack: {
    type: 'goBack',
    description: 'Navigate to the previous slide',
    isAsync: false,
    chainable: true,
    parameters: [],
  },
  goForward: {
    type: 'goForward',
    description: 'Navigate to the next slide',
    isAsync: false,
    chainable: true,
    parameters: [],
  },
  loadScene: {
    type: 'loadScene',
    description: 'Load a different scene',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'sceneId', type: 'string' }],
  },
  exitCourse: {
    type: 'exitCourse',
    description: 'Exit the course',
    isAsync: false,
    chainable: false,
    parameters: [{ name: 'completionStatus', type: 'string' }],
  },

  // ─── Layers ────────────────────────────────────────────────────────────────
  showLayer: {
    type: 'showLayer',
    description: 'Show a feedback/information layer',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  hideLayer: {
    type: 'hideLayer',
    description: 'Hide a layer',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  toggleLayer: {
    type: 'toggleLayer',
    description: 'Toggle layer visibility',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },

  // ─── Objects ────────────────────────────────────────────────────────────────
  showObject: {
    type: 'showObject',
    description: 'Show a specific object',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  hideObject: {
    type: 'hideObject',
    description: 'Hide a specific object',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  enableObject: {
    type: 'enableObject',
    description: 'Enable an object (interactive)',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  disableObject: {
    type: 'disableObject',
    description: 'Disable an object (non-interactive)',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  toggleObject: {
    type: 'toggleObject',
    description: 'Toggle object visibility',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  setFocus: {
    type: 'setFocus',
    description: 'Set keyboard focus to an element',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  scrollToObject: {
    type: 'scrollToObject',
    description: 'Scroll element into view',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },

  // ─── Media ─────────────────────────────────────────────────────────────────
  playMedia: {
    type: 'playMedia',
    description: 'Play a media element',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  pauseMedia: {
    type: 'pauseMedia',
    description: 'Pause a media element',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  stopMedia: {
    type: 'stopMedia',
    description: 'Stop and reset media playback',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  seekMedia: {
    type: 'seekMedia',
    description: 'Seek media to a timestamp',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'target', type: 'string' },
      { name: 'position', type: 'number' },
    ],
  },
  showCaption: {
    type: 'showCaption',
    description: 'Show closed captions',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  hideCaption: {
    type: 'hideCaption',
    description: 'Hide closed captions',
    isAsync: false,
    chainable: true,
    parameters: [],
  },

  // ─── Timeline ─────────────────────────────────────────────────────────────
  startTimeline: {
    type: 'startTimeline',
    description: 'Start/resume slide timeline',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  pauseTimeline: {
    type: 'pauseTimeline',
    description: 'Pause slide timeline',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },

  // ─── Animation ─────────────────────────────────────────────────────────────
  playAnimation: {
    type: 'playAnimation',
    description: 'Play a named animation',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'target', type: 'string' },
      { name: 'animation', type: 'string' },
    ],
  },
  stopAnimation: {
    type: 'stopAnimation',
    description: 'Stop an animation',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  animateObject: {
    type: 'animateObject',
    description: 'Animate an object',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'target', type: 'string' },
      { name: 'effect', type: 'string' },
      { name: 'duration', type: 'number' },
    ],
  },

  // ─── Variables ─────────────────────────────────────────────────────────────
  setVariable: {
    type: 'setVariable',
    description: 'Set a variable to a value',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'variable', type: 'string' },
      { name: 'value', type: 'any' },
    ],
  },
  adjustVariable: {
    type: 'adjustVariable',
    description: 'Adjust a numeric variable (add/subtract/set)',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'variable', type: 'string' },
      { name: 'operation', type: 'string' },
      { name: 'value', type: 'any' },
    ],
  },
  incrementCounter: {
    type: 'incrementCounter',
    description: 'Increment a counter variable by 1',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'variable', type: 'string' }],
  },
  decrementCounter: {
    type: 'decrementCounter',
    description: 'Decrement a counter variable by 1',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'variable', type: 'string' }],
  },
  resetVariable: {
    type: 'resetVariable',
    description: 'Reset a variable to its default value',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'variable', type: 'string' }],
  },
  showTooltip: {
    type: 'showTooltip',
    description: 'Display a tooltip',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'target', type: 'string' },
      { name: 'text', type: 'string' },
    ],
  },

  // ─── Quiz ──────────────────────────────────────────────────────────────────
  submitQuiz: {
    type: 'submitQuiz',
    description: 'Submit the current quiz',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  resetQuiz: {
    type: 'resetQuiz',
    description: 'Reset quiz to initial state',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'target', type: 'string' }],
  },
  resetSlide: {
    type: 'resetSlide',
    description: 'Reset all objects on the slide to initial state',
    isAsync: false,
    chainable: true,
    parameters: [],
  },

  // ─── Feedback ──────────────────────────────────────────────────────────────
  showFeedback: {
    type: 'showFeedback',
    description: 'Show a feedback popup',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'type', type: 'string' },
      { name: 'title', type: 'string' },
      { name: 'message', type: 'string' },
    ],
  },
  hideFeedback: {
    type: 'hideFeedback',
    description: 'Hide feedback popup',
    isAsync: false,
    chainable: true,
    parameters: [],
  },
  showModal: {
    type: 'showModal',
    description: 'Show a modal dialog',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'title', type: 'string' },
      { name: 'content', type: 'string' },
    ],
  },
  closeModal: {
    type: 'closeModal',
    description: 'Close the active modal',
    isAsync: false,
    chainable: true,
    parameters: [],
  },

  // ─── Navigation UI ─────────────────────────────────────────────────────────
  showNavigation: {
    type: 'showNavigation',
    description: 'Show navigation controls',
    isAsync: false,
    chainable: true,
    parameters: [],
  },
  hideNavigation: {
    type: 'hideNavigation',
    description: 'Hide navigation controls',
    isAsync: false,
    chainable: true,
    parameters: [],
  },
  lockNavigation: {
    type: 'lockNavigation',
    description: 'Lock navigation (prevent learner back/forward)',
    isAsync: false,
    chainable: true,
    parameters: [],
  },
  unlockNavigation: {
    type: 'unlockNavigation',
    description: 'Unlock navigation',
    isAsync: false,
    chainable: true,
    parameters: [],
  },

  // ─── Advanced ─────────────────────────────────────────────────────────────
  conditional: {
    type: 'conditional',
    description: 'Conditional branch — if/then/else',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'branches', type: 'array' },
      { name: 'else', type: 'array' },
    ],
  },
  delay: {
    type: 'delay',
    description: 'Wait for a duration before continuing',
    isAsync: true,
    chainable: true,
    parameters: [{ name: 'duration', type: 'number' }],
  },
  waitForInteraction: {
    type: 'waitForInteraction',
    description: 'Pause until learner interacts',
    isAsync: true,
    chainable: false,
    parameters: [],
  },
  executeJavaScript: {
    type: 'executeJavaScript',
    description: 'Execute arbitrary JavaScript (sandboxed)',
    isAsync: false,
    chainable: true,
    parameters: [{ name: 'code', type: 'string' }],
  },
  setSlideBackground: {
    type: 'setSlideBackground',
    description: 'Change slide background',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'color', type: 'string' },
      { name: 'image', type: 'string' },
    ],
  },
  fireXAPIStatement: {
    type: 'fireXAPIStatement',
    description: 'Send an xAPI statement to the LRS',
    isAsync: true,
    chainable: true,
    parameters: [
      { name: 'verb', type: 'string' },
      { name: 'object', type: 'object' },
      { name: 'result', type: 'object' },
      { name: 'context', type: 'object' },
    ],
  },
  sendEmail: {
    type: 'sendEmail',
    description: 'Send an email (server-side or via webhook)',
    isAsync: true,
    chainable: true,
    parameters: [
      { name: 'to', type: 'string' },
      { name: 'subject', type: 'string' },
      { name: 'body', type: 'string' },
    ],
  },
  openURL: {
    type: 'openURL',
    description: 'Open a URL in new tab/window',
    isAsync: false,
    chainable: true,
    parameters: [
      { name: 'url', type: 'string' },
      { name: 'target', type: 'string' },
    ],
  },
};

export const ACTION_TYPES = Object.keys(TRIGGER_ACTIONS);

export function isKnownAction(type: string): boolean {
  return type in TRIGGER_ACTIONS;
}

export function getActionDefinition(type: string): ActionDefinition | undefined {
  return TRIGGER_ACTIONS[type];
}
