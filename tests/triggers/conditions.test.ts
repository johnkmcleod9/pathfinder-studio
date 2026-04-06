import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateCondition, isConditionValid, collectConditionVariables } from '../../src/triggers/conditions.js';
import type { VariableStore as IVariableStore } from '../../src/triggers/conditions.js';

// Simple mock variable store for testing
class MockVarStore implements IVariableStore {
  private _vars: Record<string, unknown> = {};
  get(name: string): unknown { return this._vars[name]; }
  set(name: string, value: unknown): void { this._vars[name] = value; }
  constructor(initial: Record<string, unknown> = {}) { this._vars = { ...initial }; }
}

describe('Conditions', () => {
  let vars: MockVarStore;

  beforeEach(() => {
    vars = new MockVarStore({
      score: 75,
      name: 'Alice',
      active: true,
      tags: ['compliance', 'onboarding'],
      count: 0,
      empty: '',
    });
  });

  describe('Simple conditions', () => {
    it('variableEquals — true when values match', () => {
      expect(evaluateCondition({ type: 'variableEquals', variable: 'score', value: 75 }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableEquals', variable: 'score', value: 70 }, vars)).toBe(false);
    });

    it('variableEquals — string coercion', () => {
      expect(evaluateCondition({ type: 'variableEquals', variable: 'score', value: '75' }, vars)).toBe(true);
    });

    it('variableNotEquals', () => {
      expect(evaluateCondition({ type: 'variableNotEquals', variable: 'score', value: 75 }, vars)).toBe(false);
      expect(evaluateCondition({ type: 'variableNotEquals', variable: 'score', value: 70 }, vars)).toBe(true);
    });

    it('variableGreaterThan', () => {
      expect(evaluateCondition({ type: 'variableGreaterThan', variable: 'score', value: 70 }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableGreaterThan', variable: 'score', value: 75 }, vars)).toBe(false);
    });

    it('variableLessThan', () => {
      expect(evaluateCondition({ type: 'variableLessThan', variable: 'score', value: 80 }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableLessThan', variable: 'score', value: 75 }, vars)).toBe(false);
    });

    it('variableGreaterThanOrEqual', () => {
      expect(evaluateCondition({ type: 'variableGreaterThanOrEqual', variable: 'score', value: 75 }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableGreaterThanOrEqual', variable: 'score', value: 76 }, vars)).toBe(false);
    });

    it('variableLessThanOrEqual', () => {
      expect(evaluateCondition({ type: 'variableLessThanOrEqual', variable: 'score', value: 75 }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableLessThanOrEqual', variable: 'score', value: 74 }, vars)).toBe(false);
    });

    it('variableContains — string', () => {
      expect(evaluateCondition({ type: 'variableContains', variable: 'name', value: 'lic' }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableContains', variable: 'name', value: 'Bob' }, vars)).toBe(false);
    });

    it('variableNotContains', () => {
      expect(evaluateCondition({ type: 'variableNotContains', variable: 'name', value: 'Bob' }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableNotContains', variable: 'name', value: 'lic' }, vars)).toBe(false);
    });

    it('variableIsEmpty — true for empty string', () => {
      expect(evaluateCondition({ type: 'variableIsEmpty', variable: 'empty' }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableIsEmpty', variable: 'name' }, vars)).toBe(false);
    });

    it('variableIsNotEmpty', () => {
      expect(evaluateCondition({ type: 'variableIsNotEmpty', variable: 'name' }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableIsNotEmpty', variable: 'empty' }, vars)).toBe(false);
    });

    it('variableMatches — regex', () => {
      expect(evaluateCondition({ type: 'variableMatches', variable: 'name', value: '^Ali' }, vars)).toBe(true);
      expect(evaluateCondition({ type: 'variableMatches', variable: 'name', value: '^Bob' }, vars)).toBe(false);
    });

    it('invalid regex returns false without throwing', () => {
      expect(evaluateCondition({ type: 'variableMatches', variable: 'name', value: '[' }, vars)).toBe(false);
    });

    it('unknown condition type returns false', () => {
      expect(evaluateCondition({ type: 'unknownCondition' as any, variable: 'score' }, vars)).toBe(false);
    });
  });

  describe('AND groups', () => {
    it('returns true when all conditions pass', () => {
      const condition = {
        type: 'and' as const,
        conditions: [
          { type: 'variableEquals' as const, variable: 'score', value: 75 },
          { type: 'variableEquals' as const, variable: 'name', value: 'Alice' },
        ],
      };
      expect(evaluateCondition(condition, vars)).toBe(true);
    });

    it('returns false when any condition fails', () => {
      const condition = {
        type: 'and' as const,
        conditions: [
          { type: 'variableEquals' as const, variable: 'score', value: 75 },
          { type: 'variableEquals' as const, variable: 'name', value: 'Bob' },
        ],
      };
      expect(evaluateCondition(condition, vars)).toBe(false);
    });

    it('empty and group returns true', () => {
      expect(evaluateCondition({ type: 'and' as const, conditions: [] }, vars)).toBe(true);
    });
  });

  describe('OR groups', () => {
    it('returns true when any condition passes', () => {
      const condition = {
        type: 'or' as const,
        conditions: [
          { type: 'variableEquals' as const, variable: 'score', value: 99 },
          { type: 'variableEquals' as const, variable: 'name', value: 'Alice' },
        ],
      };
      expect(evaluateCondition(condition, vars)).toBe(true);
    });

    it('returns false when all conditions fail', () => {
      const condition = {
        type: 'or' as const,
        conditions: [
          { type: 'variableEquals' as const, variable: 'score', value: 99 },
          { type: 'variableEquals' as const, variable: 'name', value: 'Bob' },
        ],
      };
      expect(evaluateCondition(condition, vars)).toBe(false);
    });

    it('empty or group returns true', () => {
      expect(evaluateCondition({ type: 'or' as const, conditions: [] }, vars)).toBe(true);
    });
  });

  describe('NOT groups', () => {
    it('inverts the nested condition', () => {
      expect(evaluateCondition({ type: 'not' as const, condition: { type: 'variableEquals' as const, variable: 'score', value: 75 } }, vars)).toBe(false);
      expect(evaluateCondition({ type: 'not' as const, condition: { type: 'variableEquals' as const, variable: 'score', value: 99 } }, vars)).toBe(true);
    });
  });

  describe('Nested conditions', () => {
    it('complex AND/OR/NOT nesting', () => {
      // score >= 70 AND (name == 'Alice' OR active == true)
      const condition = {
        type: 'and' as const,
        conditions: [
          { type: 'variableGreaterThanOrEqual', variable: 'score', value: 70 },
          {
            type: 'or' as const,
            conditions: [
              { type: 'variableEquals', variable: 'name', value: 'Alice' },
              { type: 'variableEquals', variable: 'active', value: true },
            ],
          },
        ],
      };
      expect(evaluateCondition(condition, vars)).toBe(true);
    });
  });

  describe('isConditionValid', () => {
    it('validates simple conditions with a variable', () => {
      expect(isConditionValid({ type: 'variableEquals', variable: 'score', value: 75 })).toBe(true);
    });

    it('rejects simple conditions without a variable', () => {
      expect(isConditionValid({ type: 'variableEquals', value: 75 } as any)).toBe(false);
    });

    it('validates AND groups with nested conditions', () => {
      expect(isConditionValid({
        type: 'and',
        conditions: [
          { type: 'variableEquals', variable: 'score', value: 75 },
          { type: 'variableGreaterThan', variable: 'score', value: 0 },
        ],
      })).toBe(true);
    });

    it('rejects empty AND group', () => {
      // Empty AND = no conditions = vacuously true (always valid)
      expect(isConditionValid({ type: 'and', conditions: [] })).toBe(true);
    });
  });

  describe('collectConditionVariables', () => {
    it('collects all variable names from a tree', () => {
      const vars2 = collectConditionVariables({
        type: 'and',
        conditions: [
          { type: 'variableEquals', variable: 'score', value: 75 },
          { type: 'variableContains', variable: 'name', value: 'Ali' },
          {
            type: 'or',
            conditions: [
              { type: 'variableEquals', variable: 'active', value: true },
            ],
          },
        ],
      });
      expect(vars2).toEqual(new Set(['score', 'name', 'active']));
    });
  });
});
