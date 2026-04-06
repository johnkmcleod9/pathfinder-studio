/**
 * Trigger Events — all 35+ event types the trigger engine supports.
 * Each event is defined with its name, description, and metadata.
 */

export interface EventDefinition {
  type: string;
  description: string;
  /** Whether the event carries a source/target object reference */
  hasSource: boolean;
  /** Whether the event fires with a payload */
  hasPayload: boolean;
  /** Execution phase: before = master triggers, main = scene/slide, after = cleanup */
  phase: 'before' | 'main' | 'after';
}

export const TRIGGER_EVENTS: Record<string, EventDefinition> = {
  // ─── User Interaction ──────────────────────────────────────────────────────
  userClick: {
    type: 'userClick',
    description: 'User clicks an object',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },
  mouseEnter: {
    type: 'mouseEnter',
    description: 'Mouse enters an object',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },
  mouseExit: {
    type: 'mouseExit',
    description: 'Mouse exits an object',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },
  focus: {
    type: 'focus',
    description: 'Element receives keyboard focus',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },
  blur: {
    type: 'blur',
    description: 'Element loses keyboard focus',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },
  keyPress: {
    type: 'keyPress',
    description: 'User presses a keyboard key',
    hasSource: false,
    hasPayload: true,
    phase: 'main',
  },
  buttonPressed: {
    type: 'buttonPressed',
    description: 'Button or button-like element is pressed',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },
  dropdownChanged: {
    type: 'dropdownChanged',
    description: 'Dropdown selection changes',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },
  checkboxChanged: {
    type: 'checkboxChanged',
    description: 'Checkbox is toggled',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },
  radioChanged: {
    type: 'radioChanged',
    description: 'Radio button selection changes',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },
  sliderMoves: {
    type: 'sliderMoves',
    description: 'Slider value changes',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },
  dragDropComplete: {
    type: 'dragDropComplete',
    description: 'Drag-drop item is dropped',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },

  // ─── Slide/Scene Timeline ──────────────────────────────────────────────────
  timelineStarts: {
    type: 'timelineStarts',
    description: 'Slide timeline begins',
    hasSource: false,
    hasPayload: false,
    phase: 'main',
  },
  timelineEnds: {
    type: 'timelineEnds',
    description: 'Slide timeline completes',
    hasSource: false,
    hasPayload: false,
    phase: 'after',
  },
  timelinePaused: {
    type: 'timelinePaused',
    description: 'Slide timeline is paused',
    hasSource: false,
    hasPayload: false,
    phase: 'main',
  },
  timelineResumed: {
    type: 'timelineResumed',
    description: 'Slide timeline resumes',
    hasSource: false,
    hasPayload: false,
    phase: 'main',
  },
  scrollIntoView: {
    type: 'scrollIntoView',
    description: 'Element scrolls into view',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },

  // ─── Media ────────────────────────────────────────────────────────────────
  mediaStarts: {
    type: 'mediaStarts',
    description: 'Media playback begins',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },
  mediaEnds: {
    type: 'mediaEnds',
    description: 'Media playback completes',
    hasSource: true,
    hasPayload: false,
    phase: 'after',
  },
  mediaPaused: {
    type: 'mediaPaused',
    description: 'Media playback is paused',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },
  mediaSeeking: {
    type: 'mediaSeeking',
    description: 'Media seeking occurs',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },
  audioEnds: {
    type: 'audioEnds',
    description: 'Audio track finishes',
    hasSource: true,
    hasPayload: false,
    phase: 'after',
  },
  videoEnds: {
    type: 'videoEnds',
    description: 'Video finishes playing',
    hasSource: true,
    hasPayload: false,
    phase: 'after',
  },

  // ─── Quiz / Assessment ────────────────────────────────────────────────────
  questionSubmitted: {
    type: 'questionSubmitted',
    description: 'Quiz question is submitted',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },
  attemptStarted: {
    type: 'attemptStarted',
    description: 'Quiz attempt begins',
    hasSource: true,
    hasPayload: false,
    phase: 'before',
  },
  attemptSubmitted: {
    type: 'attemptSubmitted',
    description: 'Quiz attempt is submitted',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },
  attemptReviewed: {
    type: 'attemptReviewed',
    description: 'Quiz attempt is reviewed',
    hasSource: true,
    hasPayload: true,
    phase: 'after',
  },
  quizPassed: {
    type: 'quizPassed',
    description: 'Quiz pass condition is met',
    hasSource: true,
    hasPayload: true,
    phase: 'after',
  },
  quizFailed: {
    type: 'quizFailed',
    description: 'Quiz fail condition is met',
    hasSource: true,
    hasPayload: true,
    phase: 'after',
  },
  resultsCalculated: {
    type: 'resultsCalculated',
    description: 'Results slide calculates score',
    hasSource: false,
    hasPayload: true,
    phase: 'after',
  },
  surveyCompleted: {
    type: 'surveyCompleted',
    description: 'Survey is completed',
    hasSource: true,
    hasPayload: true,
    phase: 'after',
  },

  // ─── Variables ────────────────────────────────────────────────────────────
  variableChanges: {
    type: 'variableChanges',
    description: 'Variable value changes',
    hasSource: false,
    hasPayload: true,
    phase: 'main',
  },

  // ─── Course / Slide Lifecycle ─────────────────────────────────────────────
  courseStarts: {
    type: 'courseStarts',
    description: 'Course entry — first slide loads',
    hasSource: false,
    hasPayload: false,
    phase: 'before',
  },
  courseEnds: {
    type: 'courseEnds',
    description: 'Course exit',
    hasSource: false,
    hasPayload: false,
    phase: 'after',
  },
  formSubmitted: {
    type: 'formSubmitted',
    description: 'Form is submitted',
    hasSource: true,
    hasPayload: true,
    phase: 'main',
  },
  linkClicked: {
    type: 'linkClicked',
    description: 'Hyperlink is clicked',
    hasSource: true,
    hasPayload: false,
    phase: 'main',
  },

  // ─── Animation ────────────────────────────────────────────────────────────
  animationComplete: {
    type: 'animationComplete',
    description: 'Animation finishes playing',
    hasSource: true,
    hasPayload: true,
    phase: 'after',
  },

  // ─── Timer ────────────────────────────────────────────────────────────────
  timerExpired: {
    type: 'timerExpired',
    description: 'Invisible countdown timer reaches zero',
    hasSource: false,
    hasPayload: true,
    phase: 'after',
  },

  // ─── Visited ──────────────────────────────────────────────────────────────
  visitedSlides: {
    type: 'visitedSlides',
    description: 'A slide has been visited',
    hasSource: false,
    hasPayload: true,
    phase: 'after',
  },
  visitedObjects: {
    type: 'visitedObjects',
    description: 'An object has been interacted with',
    hasSource: true,
    hasPayload: false,
    phase: 'after',
  },
};

export const EVENT_TYPES = Object.keys(TRIGGER_EVENTS);

export function isKnownEvent(type: string): boolean {
  return type in TRIGGER_EVENTS;
}

export function getEventDefinition(type: string): EventDefinition | undefined {
  return TRIGGER_EVENTS[type];
}
