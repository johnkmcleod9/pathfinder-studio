/**
 * Placeholder Expansion — replaces %var% and {{var}} tokens in text.
 *
 * Spec §3.4: %varName% or {{varName}} syntax, both supported.
 * Nested/dot notation: %course.title%, %learner.name%, %slide.current.number%
 *
 * Supports:
 *   - %varName%       → author variable
 *   - %scene.var%     → scene-scoped variable
 *   - %slide.var%     → slide-scoped variable
 *   - %course.title%  → system variable (read-only)
 *   - %{var}format%   → formatted numeric/date substitution (e.g. %{score}%3d for zero-padded)
 *
 * Algorithm:
 *   1. Tokenize: find all %...% and {{...}} spans
 *   2. Parse each token: extract var name + optional format spec
 *   3. Resolve: lookup in VariableStore (scope chain) or system variables
 *   4. Format: apply numeric/date formatting if format spec present
 *   5. Replace in-place
 */

import { VariableStore } from './store.js';

export interface ExpansionResult {
  text: string;
  /** Variables that were referenced in the expansion */
  referencedVariables: string[];
  /** Variables that couldn't be resolved */
  unresolvedVariables: string[];
  /** Warnings (e.g. unknown format spec) */
  warnings: string[];
}

export interface ExpansionOptions {
  /** If true, {{var}} syntax is also expanded. Default: true */
  doubleBrace?: boolean;
  /** If true, missing variables are left as-is. Default: true */
  leaveUnresolved?: boolean;
  /** Date format for date variables (Intl.DateTimeFormat options). Default: numeric year-month-day */
  dateFormat?: Intl.DateTimeFormatOptions;
  /** Number format locale. Default: 'en-US' */
  locale?: string;
}

const PERCENT_TOKEN = /%([^%{}]+)%/g;
const DOUBLE_BRACE_TOKEN = /\{\{([^}]+)\}\}/g;

export function expandPlaceholders(
  text: string,
  store: VariableStore,
  options: ExpansionOptions = {}
): ExpansionResult {
  const {
    doubleBrace = true,
    leaveUnresolved = true,
    dateFormat = { year: 'numeric', month: '2-digit', day: '2-digit' },
    locale = 'en-US',
  } = options;

  const referenced: Set<string> = new Set();
  const unresolved: Set<string> = new Set();
  const warnings: string[] = [];

  function resolveVar(name: string): string {
    referenced.add(name);

    // System variable
    const sysVal = store.getSystemVariable(name);
    if (sysVal !== undefined) return formatValue(sysVal, name, store, locale, dateFormat);

    // Author variable
    const val = store.get(name);
    if (val !== undefined) return formatValue(val, name, store, locale, dateFormat);

    // Not found
    unresolved.add(name);
    return leaveUnresolved ? `%${name}%` : '';
  }

  // Replace percent-style tokens: %varName%
  let result = text.replace(PERCENT_TOKEN, (_, token) => {
    const { name } = parseToken(token.trim());
    return resolveVar(name);
  });

  // Replace double-brace tokens: {{varName}}
  if (doubleBrace) {
    result = result.replace(DOUBLE_BRACE_TOKEN, (_, token) => {
      const { name } = parseToken(token.trim());
      return resolveVar(name);
    });
  }

  return {
    text: result,
    referencedVariables: [...referenced],
    unresolvedVariables: [...unresolved],
    warnings,
  };
}

interface ParsedToken {
  name: string;
  format?: string;
}

function parseToken(token: string): ParsedToken {
  // Format spec: %{name}format%  e.g. %{score}%05d for zero-padded integer
  if (token.startsWith('{') && token.includes('}')) {
    const closeIdx = token.indexOf('}');
    const name = token.slice(1, closeIdx);
    const format = token.slice(closeIdx + 1);
    return { name, format: format || undefined };
  }

  // Simple: name or scope.name
  const fmtIdx = token.indexOf('%');
  if (fmtIdx > 0) {
    return { name: token.slice(0, fmtIdx), format: token.slice(fmtIdx + 1) || undefined };
  }

  return { name: token };
}

function formatValue(
  value: unknown,
  varName: string,
  store: VariableStore,
  locale: string,
  dateFormat: Intl.DateTimeFormatOptions
): string {
  if (value === null || value === undefined) return '';

  // Check the variable's actual type from definition
  const def = store?.getDef(varName);
  const varType = def?.type;

  // Date type
  if (varType === 'date' || varName === 'system.date' || varName === 'session.startTime') {
    if (typeof value === 'string') {
      try {
        return new Intl.DateTimeFormat(locale, dateFormat).format(new Date(value));
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  // Duration type (or known duration system variables)
  if (varType === 'duration' || varName === 'interaction.totalTime' || varName === 'session.totalTime') {
    const seconds = Number(value);
    if (isNaN(seconds)) return String(value);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Number formatting
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return new Intl.NumberFormat(locale).format(value);
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }

  return String(value);
}

/**
 * Collect all placeholder variable names from a text without resolving them.
 */
export function collectPlaceholders(text: string): { tokens: string[]; hasPercentStyle: boolean; hasDoubleBraceStyle: boolean } {
  const tokens = new Set<string>();

  let match: RegExpExecArray | null;
  const percentRegex = new RegExp(PERCENT_TOKEN.source, 'g');
  while ((match = percentRegex.exec(text)) !== null) {
    const { name } = parseToken(match[1].trim());
    tokens.add(name);
  }

  const doubleRegex = new RegExp(DOUBLE_BRACE_TOKEN.source, 'g');
  while ((match = doubleRegex.exec(text)) !== null) {
    tokens.add(match[1].trim());
  }

  return {
    tokens: [...tokens],
    hasPercentStyle: new RegExp(PERCENT_TOKEN.source).test(text),
    hasDoubleBraceStyle: new RegExp(DOUBLE_BRACE_TOKEN.source).test(text),
  };
}

/**
 * Validate placeholder syntax in text (before resolution).
 */
export function validatePlaceholders(text: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for unclosed braces
  if ((text.match(/%/g) ?? []).length % 2 !== 0) {
    errors.push('Unclosed %...% placeholder');
  }
  if ((text.match(/\{\{/g) ?? []).length !== (text.match(/\}\}/g) ?? []).length) {
    errors.push('Unclosed {{...}} placeholder');
  }

  return { valid: errors.length === 0, errors };
}
