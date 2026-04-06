/**
 * Trigger Conditions — evaluates AND/OR condition groups against variable state.
 */

export type ConditionType =
  | 'variableEquals'
  | 'variableNotEquals'
  | 'variableGreaterThan'
  | 'variableLessThan'
  | 'variableGreaterThanOrEqual'
  | 'variableLessThanOrEqual'
  | 'variableContains'
  | 'variableNotContains'
  | 'variableIsEmpty'
  | 'variableIsNotEmpty'
  | 'variableMatches'
  | 'and'
  | 'or'
  | 'not';

export interface Condition {
  type: ConditionType;
  /** Variable name (for variable comparisons) */
  variable?: string;
  /** Comparison operator */
  operator?: string;
  /** Value to compare against */
  value?: unknown;
  /** For and/or groups: nested conditions */
  conditions?: Condition[];
  /** For not: single nested condition */
  condition?: Condition;
}

export interface VariableStore {
  get(name: string): unknown;
  set(name: string, value: unknown): void;
}

/**
 * Evaluate a single condition (non-group) against the variable store.
 */
function evaluateSimpleCondition(condition: Omit<Condition, 'and' | 'or' | 'not'>, vars: VariableStore): boolean {
  const { type, variable, value } = condition;

  if (!variable) return false;
  const current = vars.get(variable);

  switch (type) {
    case 'variableEquals':
      return current === value || String(current) === String(value);

    case 'variableNotEquals':
      return current !== value && String(current) !== String(value);

    case 'variableGreaterThan':
      return Number(current) > Number(value);

    case 'variableLessThan':
      return Number(current) < Number(value);

    case 'variableGreaterThanOrEqual':
      return Number(current) >= Number(value);

    case 'variableLessThanOrEqual':
      return Number(current) <= Number(value);

    case 'variableContains':
      return String(current).includes(String(value));

    case 'variableNotContains':
      return !String(current).includes(String(value));

    case 'variableIsEmpty':
      return (
        current === undefined ||
        current === null ||
        current === '' ||
        (Array.isArray(current) && current.length === 0)
      );

    case 'variableIsNotEmpty':
      return (
        current !== undefined &&
        current !== null &&
        current !== '' &&
        !(Array.isArray(current) && current.length === 0)
      );

    case 'variableMatches': {
      try {
        return new RegExp(String(value)).test(String(current));
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Evaluate a full condition tree (including AND/OR/NOT groups).
 */
export function evaluateCondition(condition: Condition, vars: VariableStore): boolean {
  const { type } = condition;

  if (type === 'and') {
    const conditions = condition.conditions ?? [];
    if (conditions.length === 0) return true;
    return conditions.every(c => evaluateCondition(c as Condition, vars));
  }

  if (type === 'or') {
    const conditions = condition.conditions ?? [];
    if (conditions.length === 0) return true;
    return conditions.some(c => evaluateCondition(c as Condition, vars));
  }

  if (type === 'not') {
    const nested = condition.condition;
    if (!nested) return true;
    return !evaluateCondition(nested, vars);
  }

  return evaluateSimpleCondition(condition, vars);
}

/**
 * Validate that a condition tree is well-formed (no circular refs).
 */
export function isConditionValid(condition: Condition, visited = new Set<string>()): boolean {
  const { type } = condition;

  if (type === 'and' || type === 'or') {
    const conditions = condition.conditions ?? [];
    return conditions.every(c => isConditionValid(c as Condition, visited));
  }

  if (type === 'not') {
    const nested = condition.condition;
    if (!nested) return false;
    return isConditionValid(nested, visited);
  }

  // Simple condition must have a variable
  return !!condition.variable;
}

/**
 * Collect all variable names referenced in a condition tree.
 */
export function collectConditionVariables(condition: Condition): Set<string> {
  const vars = new Set<string>();

  function walk(c: Condition): void {
    const { type, variable, conditions, condition: nested } = c;
    if (type === 'and' || type === 'or') {
      (conditions ?? []).forEach(sub => walk(sub as Condition));
    } else if (type === 'not') {
      if (nested) walk(nested);
    } else {
      if (variable) vars.add(variable);
    }
  }

  walk(condition);
  return vars;
}
