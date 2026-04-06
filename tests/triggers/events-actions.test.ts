import { describe, it, expect } from 'vitest';
import { EVENT_TYPES, isKnownEvent, getEventDefinition } from '../../src/triggers/events.js';
import { ACTION_TYPES, isKnownAction, getActionDefinition } from '../../src/triggers/actions.js';

describe('Events', () => {
  it('exports all 35+ event types', () => {
    expect(EVENT_TYPES.length).toBeGreaterThanOrEqual(35);
  });

  it('isKnownEvent returns true for all known events', () => {
    for (const type of EVENT_TYPES) {
      expect(isKnownEvent(type), `Event "${type}" should be known`).toBe(true);
    }
  });

  it('isKnownEvent returns false for unknown events', () => {
    expect(isKnownEvent('unknownEventXYZ')).toBe(false);
  });

  it('getEventDefinition returns definition for known events', () => {
    const def = getEventDefinition('userClick');
    expect(def).toBeDefined();
    expect(def!.description).toBe('User clicks an object');
    expect(def!.hasSource).toBe(true);
  });

  it('getEventDefinition returns undefined for unknown events', () => {
    expect(getEventDefinition('fakeEvent')).toBeUndefined();
  });

  it('all known events have required fields', () => {
    for (const type of EVENT_TYPES) {
      const def = getEventDefinition(type)!;
      expect(def.type).toBe(type);
      expect(def.description.length).toBeGreaterThan(0);
      expect(['before', 'main', 'after']).toContain(def.phase);
    }
  });

  it('includes all spec-listed events', () => {
    const specEvents = [
      'userClick', 'timelineStarts', 'timelineEnds', 'mediaEnds', 'mediaStarts',
      'variableChanges', 'questionSubmitted', 'sliderMoves', 'dragDropComplete',
      'courseStarts', 'courseEnds', 'resultsCalculated',
    ];
    for (const event of specEvents) {
      expect(EVENT_TYPES, `"${event}" should be in EVENT_TYPES`).toContain(event);
    }
  });
});

describe('Actions', () => {
  it('exports all 40+ action types', () => {
    expect(ACTION_TYPES.length).toBeGreaterThanOrEqual(40);
  });

  it('isKnownAction returns true for all known actions', () => {
    for (const type of ACTION_TYPES) {
      expect(isKnownAction(type), `Action "${type}" should be known`).toBe(true);
    }
  });

  it('isKnownAction returns false for unknown actions', () => {
    expect(isKnownAction('unknownActionXYZ')).toBe(false);
  });

  it('getActionDefinition returns definition for known actions', () => {
    const def = getActionDefinition('jumpToSlide');
    expect(def).toBeDefined();
    expect(def!.description).toBe('Navigate to a specific slide');
    expect(def!.isAsync).toBe(false);
    expect(def!.chainable).toBe(true);
    expect(def!.parameters).toContainEqual({ name: 'target', type: 'string' });
  });

  it('getActionDefinition returns undefined for unknown actions', () => {
    expect(getActionDefinition('fakeAction')).toBeUndefined();
  });

  it('all known actions have required fields', () => {
    for (const type of ACTION_TYPES) {
      const def = getActionDefinition(type)!;
      expect(def.type).toBe(type);
      expect(def.description.length).toBeGreaterThan(0);
      expect(typeof def.isAsync).toBe('boolean');
      expect(typeof def.chainable).toBe('boolean');
      expect(Array.isArray(def.parameters)).toBe(true);
    }
  });

  it('async actions are correctly marked', () => {
    for (const type of ACTION_TYPES) {
      const def = getActionDefinition(type)!;
      // delay and waitForInteraction are async
      if (['delay', 'waitForInteraction', 'fireXAPIStatement', 'sendEmail'].includes(type)) {
        expect(def.isAsync, `"${type}" should be async`).toBe(true);
      }
    }
  });

  it('includes all spec-listed actions', () => {
    const specActions = [
      'jumpToSlide', 'showLayer', 'hideLayer', 'setVariable', 'adjustVariable',
      'playMedia', 'pauseMedia', 'startTimeline', 'pauseTimeline', 'submitQuiz',
      'exitCourse', 'fireXAPIStatement', 'conditional', 'delay',
    ];
    for (const action of specActions) {
      expect(ACTION_TYPES, `"${action}" should be in ACTION_TYPES`).toContain(action);
    }
  });

  it('conditional action has branches and else parameters', () => {
    const def = getActionDefinition('conditional')!;
    const paramNames = def.parameters.map(p => p.name);
    expect(paramNames).toContain('branches');
    expect(paramNames).toContain('else');
  });

  it('setVariable has variable and value parameters', () => {
    const def = getActionDefinition('setVariable')!;
    const paramNames = def.parameters.map(p => p.name);
    expect(paramNames).toContain('variable');
    expect(paramNames).toContain('value');
  });

  it('adjustVariable has variable, operation, and value parameters', () => {
    const def = getActionDefinition('adjustVariable')!;
    const paramNames = def.parameters.map(p => p.name);
    expect(paramNames).toContain('variable');
    expect(paramNames).toContain('operation');
    expect(paramNames).toContain('value');
  });
});
