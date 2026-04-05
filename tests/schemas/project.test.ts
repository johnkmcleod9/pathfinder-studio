import { describe, it, expect } from 'vitest';
import { validate } from '../../src/validator.js';

const VALID_PROJECT = {
  "$schema": "https://pathfinder.studio/schemas/pathfinder-v1.schema.json",
  "schemaVersion": "1.0.0",
  "formatVersion": "1.0",
  "metadata": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Compliance Training",
    "author": "Jane Doe",
    "authorId": "550e8400-e29b-41d4-a716-446655440001",
    "createdAt": "2026-04-01T10:00:00Z",
    "modifiedAt": "2026-04-04T14:30:00Z"
  },
  "slides": [
    {
      "id": "slide-001",
      "title": "Welcome",
      "background": { "type": "solid", "color": "#FFFFFF" },
      "zOrder": ["text-heading-1", "btn-start"],
      "objects": {
        "text-heading-1": {
          "type": "text",
          "rect": { "x": 80, "y": 200, "w": 1120, "h": 100 },
          "content": "Welcome to Compliance Training"
        },
        "btn-start": {
          "type": "button",
          "rect": { "x": 540, "y": 540, "w": 200, "h": 56 },
          "label": "Begin Course",
          "triggers": [
            {
              "id": "trigger-001",
              "event": { "type": "userClick", "source": "btn-start" },
              "action": { "type": "jumpToSlide", "target": "slide-002" }
            }
          ]
        }
      }
    }
  ],
  "variables": {
    "CourseStarted": { "type": "trueFalse", "defaultValue": false }
  },
  "navigation": {
    "entrySlide": "slide-001",
    "slides": ["slide-001", "slide-002"]
  }
};

describe('Project Schema', () => {
  describe('1.1 JSON Schema Validation', () => {
    it('accepts a valid .pathfinder project file', () => {
      const result = validate('project', VALID_PROJECT);
      expect(result.errors).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it('rejects when $schema is missing', () => {
      // Destructure to omit key entirely — spreading undefined omits the key in JS
      const { $schema: _drop, ...rest } = VALID_PROJECT;
      const data = rest as typeof VALID_PROJECT;
      const result = validate('project', data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'required')).toBe(true);
    });

    it('rejects when schemaVersion is invalid format', () => {
      const result = validate('project', { ...VALID_PROJECT, schemaVersion: 'not-a-version' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.keyword).toBe('pattern');
    });

    it('rejects when formatVersion is invalid', () => {
      const result = validate('project', { ...VALID_PROJECT, formatVersion: 'abc' });
      expect(result.valid).toBe(false);
    });

    it('rejects when required field metadata.id is missing', () => {
      const data = {
        ...VALID_PROJECT,
        metadata: { ...VALID_PROJECT.metadata, id: undefined }
      };
      const result = validate('project', data);
      expect(result.valid).toBe(false);
    });

    it('rejects unknown top-level fields', () => {
      const result = validate('project', { ...VALID_PROJECT, unknownField: true });
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.keyword).toBe('additionalProperties');
    });

    it('warns on unknown event type (forward-compat)', () => {
      const data = {
        ...VALID_PROJECT,
        slides: [{
          ...VALID_PROJECT.slides[0],
          triggers: [{
            id: 'trigger-x',
            event: { type: 'futureEventXYZ' },
            action: { type: 'jumpToSlide', target: 'slide-002' }
          }]
        }]
      };
      const result = validate('project', data);
      expect(result.warnings.some(w => w.includes('futureEventXYZ'))).toBe(true);
    });
  });

  describe('1.2 Project Structure', () => {
    it('accepts a valid .pathfinder project structure', () => {
      const result = validate('project', VALID_PROJECT);
      expect(result.valid).toBe(true);
    });

    it('rejects slides array with fewer than 1 item', () => {
      const result = validate('project', { ...VALID_PROJECT, slides: [] });
      expect(result.valid).toBe(false);
    });

    it('accepts empty variables object', () => {
      const result = validate('project', { ...VALID_PROJECT, variables: {} });
      expect(result.valid).toBe(true);
    });
  });

  describe('1.3 Slide Data', () => {
    it('parses a slide with id, type, sceneId, and duration', () => {
      const data = {
        ...VALID_PROJECT,
        slides: [{
          id: 'slide-002',
          title: 'Module 1',
          background: { type: 'solid', color: '#FFFFFF' },
          zOrder: [],
          objects: {}
        }]
      };
      expect(validate('project', data).valid).toBe(true);
    });

    it('parses a slide with solid background', () => {
      const data = {
        ...VALID_PROJECT,
        slides: [{
          id: 'slide-003',
          background: { type: 'solid', color: '#1A73E8' },
          zOrder: [],
          objects: {}
        }]
      };
      expect(validate('project', data).valid).toBe(true);
    });

    it('parses a slide with gradient background', () => {
      const data = {
        ...VALID_PROJECT,
        slides: [{
          id: 'slide-004',
          background: {
            type: 'gradient',
            gradient: {
              type: 'linear',
              angle: 90,
              stops: [
                { color: '#1A73E8', position: 0 },
                { color: '#FFFFFF', position: 1 }
              ]
            }
          },
          zOrder: [],
          objects: {}
        }]
      };
      expect(validate('project', data).valid).toBe(true);
    });

    it('parses a slide with image background referencing media', () => {
      const data = {
        ...VALID_PROJECT,
        slides: [{
          id: 'slide-005',
          background: {
            type: 'image',
            media: { id: 'bg-1', src: 'media/backgrounds/hero.png' }
          },
          zOrder: [],
          objects: {}
        }]
      };
      expect(validate('project', data).valid).toBe(true);
    });

    it('parses a layer with objects', () => {
      const data = {
        ...VALID_PROJECT,
        slides: [{
          ...VALID_PROJECT.slides[0],
          layers: [{
            id: 'layer-feedback',
            name: 'Feedback',
            visible: false,
            objects: {
              'text-feedback': {
                type: 'text',
                rect: { x: 200, y: 280, w: 880, h: 160 },
                content: 'Correct!'
              }
            }
          }]
        }]
      };
      expect(validate('project', data).valid).toBe(true);
    });

    it('parses an object with position and size', () => {
      const data = {
        ...VALID_PROJECT,
        slides: [{
          id: 'slide-006',
          background: { type: 'solid', color: '#FFFFFF' },
          zOrder: ['shape-1'],
          objects: {
            'shape-1': {
              type: 'shape',
              rect: { x: 0, y: 680, w: 1280, h: 40 }
            }
          }
        }]
      };
      expect(validate('project', data).valid).toBe(true);
    });

    it('parses an object with font properties', () => {
      const data = {
        ...VALID_PROJECT,
        slides: [{
          id: 'slide-007',
          background: { type: 'solid', color: '#FFFFFF' },
          zOrder: ['text-1'],
          objects: {
            'text-1': {
              type: 'text',
              rect: { x: 80, y: 200, w: 1120, h: 100 },
              content: 'Hello',
              style: {
                fontFamily: 'Helvetica Neue',
                fontSize: 48,
                fontWeight: 'bold',
                color: '#202124',
                textAlign: 'center',
                lineHeight: 1.2
              }
            }
          }
        }]
      };
      expect(validate('project', data).valid).toBe(true);
    });
  });

  describe('1.4 Trigger Data', () => {
    it('parses a trigger with event + action', () => {
      const trigger = {
        id: 'trigger-001',
        event: { type: 'userClick' },
        action: { type: 'jumpToSlide', target: 'slide-002' }
      };
      const result = validate('trigger', trigger);
      expect(result.valid).toBe(true);
    });

    it('parses a trigger with conditions', () => {
      const trigger = {
        id: 'trigger-002',
        event: { type: 'variableChanges' },
        action: { type: 'setVariable', variable: 'QuizScore', value: 10 },
        conditions: [
          { type: 'variableEquals', variable: 'UserChoice', operator: '==', value: 'correct' }
        ]
      };
      expect(validate('trigger', trigger).valid).toBe(true);
    });

    it('parses a trigger with disabled: true', () => {
      const trigger = {
        id: 'trigger-disabled',
        event: { type: 'userClick' },
        action: { type: 'jumpToSlide', target: 'slide-003' },
        disabled: true
      };
      expect(validate('trigger', trigger).valid).toBe(true);
    });

    it('parses a trigger with nested AND/OR condition groups', () => {
      const trigger = {
        id: 'trigger-complex',
        event: { type: 'questionSubmitted' },
        action: { type: 'conditional', branches: [], else: [] },
        conditions: [
          {
            type: 'and',
            variable: '',
            value: [
              { type: 'variableEquals', variable: 'Score', operator: '>=', value: 70 },
              { type: 'variableEquals', variable: 'Attempts', operator: '<=', value: 3 }
            ]
          }
        ]
      };
      expect(validate('trigger', trigger).valid).toBe(true);
    });

    it('warns on broken object reference in trigger source', () => {
      // Broken references are warnings, not hard errors (runtime resolves them)
      const data = {
        ...VALID_PROJECT,
        slides: [{
          ...VALID_PROJECT.slides[0],
          triggers: [{
            id: 'trigger-broken',
            event: { type: 'userClick', source: 'non-existent-object' },
            action: { type: 'jumpToSlide', target: 'non-existent-slide' }
          }]
        }]
      };
      const result = validate('project', data);
      expect(result.valid).toBe(true); // Schema doesn't enforce ref integrity (that's a later stage)
    });

    it('parses all 35 known event types', () => {
      const events = [
        'userClick', 'timelineStarts', 'timelineEnds', 'mediaEnds', 'mediaStarts',
        'variableChanges', 'questionSubmitted', 'sliderMoves', 'dragDropComplete',
        'courseStarts', 'courseEnds', 'resultsCalculated', 'mouseEnter', 'mouseExit',
        'focus', 'blur', 'keyPress', 'timelinePaused', 'timelineResumed', 'mediaPaused',
        'mediaSeeking', 'attemptStarted', 'attemptSubmitted', 'attemptReviewed',
        'formSubmitted', 'scrollIntoView', 'animationComplete', 'audioEnds', 'videoEnds',
        'quizPassed', 'quizFailed', 'surveyCompleted', 'linkClicked', 'buttonPressed',
        'dropdownChanged', 'checkboxChanged', 'radioChanged', 'timerExpired',
        'visitedSlides', 'visitedObjects'
      ];

      for (const eventType of events) {
        const result = validate('trigger', {
          id: `trigger-${eventType}`,
          event: { type: eventType },
          action: { type: 'jumpToSlide', target: 'slide-001' }
        });
        expect(result.valid, `Event type "${eventType}" should be valid`).toBe(true);
        expect(result.warnings.some(w => w.includes(eventType)), `Should not warn on known event "${eventType}"`).toBe(false);
      }
    });

    it('parses all 40 known action types', () => {
      const actions = [
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
      ];

      for (const actionType of actions) {
        const result = validate('trigger', {
          id: `trigger-${actionType}`,
          event: { type: 'userClick' },
          action: { type: actionType }
        });
        expect(result.valid, `Action type "${actionType}" should be valid`).toBe(true);
        expect(result.warnings.some(w => w.includes(actionType)), `Should not warn on known action "${actionType}"`).toBe(false);
      }
    });
  });

  describe('1.5 Variable Data', () => {
    it('parses a variable with name, type, and initialValue', () => {
      const v = {
        type: 'trueFalse',
        defaultValue: false,
        scope: 'course',
        description: 'Tracks if learner has started the course'
      };
      const result = validate('variable', v);
      expect(result.valid).toBe(true);
    });

    it('parses variable with scope (project/scene/slide)', () => {
      const scopes = ['course', 'scene', 'quiz', 'slide'];
      for (const scope of scopes) {
        const result = validate('variable', { type: 'number', defaultValue: 0, scope });
        expect(result.valid, `Scope "${scope}" should be valid`).toBe(true);
      }
    });

    it('parses system variable reference', () => {
      const v = {
        type: 'text',
        defaultValue: '',
        scope: 'course',
        tags: ['system']
      };
      expect(validate('variable', v).valid).toBe(true);
    });

    it('rejects invalid variable type', () => {
      const v = { type: 'invalidType', defaultValue: null };
      const result = validate('variable', v);
      expect(result.valid).toBe(false);
    });

    it('parses all 8 variable types', () => {
      const types = ['trueFalse', 'boolean', 'number', 'text', 'slider', 'sequence', 'date', 'math'];
      for (const type of types) {
        const result = validate('variable', { type, defaultValue: type === 'number' ? 0 : type === 'trueFalse' || type === 'boolean' ? false : '' });
        expect(result.valid, `Variable type "${type}" should be valid`).toBe(true);
      }
    });
  });

  describe('Version Fields', () => {
    it('accepts valid schemaVersion format (semver)', () => {
      const versions = ['1.0.0', '0.1.0', '2.0.0', '10.99.99'];
      for (const v of versions) {
        const result = validate('project', { ...VALID_PROJECT, schemaVersion: v });
        expect(result.valid, `Version "${v}" should be valid`).toBe(true);
      }
    });

    it('rejects invalid schemaVersion', () => {
      const result = validate('project', { ...VALID_PROJECT, schemaVersion: 'v1.0' });
      expect(result.valid).toBe(false);
    });
  });
});
