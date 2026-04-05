import { describe, it, expect } from 'vitest';
import { validate } from '../../src/validator.js';

describe('Trigger Schema', () => {
  describe('Trigger Events', () => {
    // Events from the architecture spec (12 listed) + forward-compat (35+ total)
    const eventTypes = [
      // Spec-listed events
      'userClick', 'timelineStarts', 'timelineEnds', 'mediaEnds', 'mediaStarts',
      'variableChanges', 'questionSubmitted', 'sliderMoves', 'dragDropComplete',
      'courseStarts', 'courseEnds', 'resultsCalculated',
      // Additional events (reaching 35+)
      'mouseEnter', 'mouseExit', 'focus', 'blur', 'keyPress',
      'timelinePaused', 'timelineResumed', 'mediaPaused', 'mediaSeeking',
      'attemptStarted', 'attemptSubmitted', 'attemptReviewed',
      'formSubmitted', 'scrollIntoView', 'animationComplete',
      'audioEnds', 'videoEnds', 'quizPassed', 'quizFailed',
      'surveyCompleted', 'linkClicked', 'buttonPressed',
      'dropdownChanged', 'checkboxChanged', 'radioChanged',
      'timerExpired', 'visitedSlides', 'visitedObjects'
    ];

    for (const event of eventTypes) {
      it(`parses event type "${event}"`, () => {
        const result = validate('trigger', {
          id: `tr-${event}`,
          event: { type: event },
          action: { type: 'jumpToSlide', target: 'slide-001' }
        });
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes(event))).toBe(false);
      });
    }

    it('warns on completely unknown event type (forward-compat)', () => {
      const result = validate('trigger', {
        id: 'tr-unknown',
        event: { type: 'someFutureEvent' },
        action: { type: 'jumpToSlide', target: 'slide-001' }
      });
      expect(result.valid).toBe(true); // Should still pass (forward compat)
      expect(result.warnings.some(w => w.includes('someFutureEvent'))).toBe(true);
    });

    it('parses event with optional source field', () => {
      const result = validate('trigger', {
        id: 'tr-with-source',
        event: { type: 'userClick', source: 'object:btn-yes-no' },
        action: { type: 'jumpToSlide', target: 'slide-002' }
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Trigger Actions', () => {
    const actionTypes = [
      // Spec-listed (14)
      'jumpToSlide', 'showLayer', 'hideLayer', 'setVariable', 'adjustVariable',
      'playMedia', 'pauseMedia', 'startTimeline', 'pauseTimeline', 'submitQuiz',
      'exitCourse', 'fireXAPIStatement', 'conditional', 'delay',
      // Additional actions (reaching 40+)
      'stopMedia', 'seekMedia', 'showObject', 'hideObject',
      'enableObject', 'disableObject', 'toggleObject', 'animateObject',
      'setFocus', 'scrollToObject', 'showTooltip',
      'playAnimation', 'stopAnimation', 'sendEmail', 'openURL',
      'showModal', 'closeModal', 'showFeedback', 'hideFeedback',
      'incrementCounter', 'decrementCounter', 'resetVariable',
      'resetQuiz', 'resetSlide', 'goBack', 'goForward',
      'showNavigation', 'hideNavigation', 'lockNavigation',
      'unlockNavigation', 'setSlideBackground', 'loadScene',
      'executeJavaScript', 'waitForInteraction', 'showCaption', 'hideCaption'
    ];

    for (const action of actionTypes) {
      it(`parses action type "${action}"`, () => {
        const result = validate('trigger', {
          id: `tr-${action}`,
          event: { type: 'userClick' },
          action: { type: action }
        });
        expect(result.valid, `"${action}" should be valid`).toBe(true);
        expect(result.warnings.some(w => w.includes(action))).toBe(false);
      });
    }

    it('warns on unknown action type (forward-compat)', () => {
      const result = validate('trigger', {
        id: 'tr-unknown-action',
        event: { type: 'userClick' },
        action: { type: 'futureActionXYZ' }
      });
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('futureActionXYZ'))).toBe(true);
    });
  });

  describe('Trigger Conditions', () => {
    const conditionTypes = [
      'variableEquals', 'variableNotEquals', 'variableGreaterThan',
      'variableLessThan', 'variableContains', 'variableIsEmpty',
      'mediaPlayed', 'slideVisited', 'attemptCount', 'scoreRange',
      'and', 'or', 'not'
    ];

    for (const cond of conditionTypes) {
      it(`parses condition type "${cond}"`, () => {
        const result = validate('trigger', {
          id: `tr-cond-${cond}`,
          event: { type: 'userClick' },
          action: { type: 'jumpToSlide', target: 'slide-001' },
          conditions: [{ type: cond, variable: 'TestVar', operator: '==', value: true }]
        });
        expect(result.valid, `"${cond}" should be valid`).toBe(true);
      });
    }

    it('parses conditional action with branches', () => {
      const result = validate('trigger', {
        id: 'tr-conditional',
        event: { type: 'userClick' },
        action: {
          type: 'conditional',
          branches: [
            {
              conditions: [{ type: 'variableEquals', variable: 'Choice', operator: '==', value: 'correct' }],
              then: [
                { type: 'adjustVariable', variable: 'Score', operation: 'add', value: 10 },
                { type: 'showLayer', target: 'layer-correct' }
              ]
            }
          ],
          else: [{ type: 'showLayer', target: 'layer-incorrect' }]
        }
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Required fields', () => {
    it('rejects a trigger missing id', () => {
      const result = validate('trigger', {
        event: { type: 'userClick' },
        action: { type: 'jumpToSlide', target: 'slide-001' }
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.keyword).toBe('required');
    });

    it('rejects a trigger missing event', () => {
      const result = validate('trigger', {
        id: 'tr-no-event',
        action: { type: 'jumpToSlide' }
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a trigger missing action', () => {
      const result = validate('trigger', {
        id: 'tr-no-action',
        event: { type: 'userClick' }
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('Optional fields', () => {
    it('accepts optional description field', () => {
      const result = validate('trigger', {
        id: 'tr-desc',
        event: { type: 'userClick' },
        action: { type: 'jumpToSlide', target: 'slide-001' },
        description: 'When user clicks → jump to next slide'
      });
      expect(result.valid).toBe(true);
    });

    it('accepts optional priority field', () => {
      const result = validate('trigger', {
        id: 'tr-priority',
        event: { type: 'userClick' },
        action: { type: 'jumpToSlide', target: 'slide-001' },
        priority: 10
      });
      expect(result.valid).toBe(true);
    });

    it('accepts disabled trigger', () => {
      const result = validate('trigger', {
        id: 'tr-disabled',
        event: { type: 'userClick' },
        action: { type: 'exitCourse', completionStatus: 'completed' },
        disabled: true
      });
      expect(result.valid).toBe(true);
    });
  });
});
