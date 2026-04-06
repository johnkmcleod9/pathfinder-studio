/**
 * Variable Types — definition, validation, and coercion.
 *
 * Spec: 10 types — text, number, integer, boolean, date, time, duration, URL, list, object
 * Type coercion rules per spec:
 *   - number → text: convert to string
 *   - text → number: parse; if NaN, set to 0 and log warning
 *   - text → boolean: "true"/"1" → true; "false"/"0" → false
 *   - number → boolean: 0 → false; everything else → true
 */

export type VariableType = 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'time' | 'duration' | 'url' | 'list' | 'object';

export interface TypeConstraint {
  maxLength?: number;       // text max characters
  min?: number;             // numeric min
  max?: number;             // numeric max
  minItems?: number;        // list min items
  maxItems?: number;        // list max items
  itemMaxLength?: number;   // list item max chars
  maxSerialized?: number;   // object/list max KB serialized
}

export interface VariableTypeDefinition {
  type: VariableType;
  description: string;
  defaultValue: unknown;
  constraints: TypeConstraint;
  coerceFrom: (value: unknown) => { value: unknown; warning?: string };
  validate: (value: unknown) => { valid: boolean; error?: string };
  serialize: (value: unknown) => string;
  deserialize: (serialized: string) => { value: unknown; warning?: string };
}

// ─── Type Definitions ─────────────────────────────────────────────────────────────

const MAX_FLOAT = 9_999_999_999_999;
const MAX_INT = 9_007_199_254_740_991;
const MAX_LIST_ITEMS = 1000;
const MAX_ITEM_LEN = 2048;
const MAX_SERIALIZED_KB = 64;
const URL_MAX_LEN = 2048;

function isValidDate(s: string): boolean {
  const d = new Date(s);
  return !isNaN(d.getTime()) && s.match(/^\d{4}-\d{2}-\d{2}/) !== null;
}

function isValidURL(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isInteger(n: number): boolean {
  return Number.isInteger(n) && Math.abs(n) <= MAX_INT;
}

export const VARIABLE_TYPES: Record<VariableType, VariableTypeDefinition> = {

  text: {
    type: 'text',
    description: 'String value, max 64KB per value',
    defaultValue: '',
    constraints: { maxLength: 65_536 },
    coerceFrom: (v) => ({ value: String(v ?? '') }),
    validate: (v) => {
      const s = String(v ?? '');
      if (s.length > 65_536) return { valid: false, error: `Text exceeds 64KB limit (${s.length} chars)` };
      return { valid: true };
    },
    serialize: (v) => String(v ?? ''),
    deserialize: (s) => ({ value: s }),
  },

  number: {
    type: 'number',
    description: 'Double-precision float, range ±9,999,999,999,999',
    defaultValue: 0,
    constraints: { min: -MAX_FLOAT, max: MAX_FLOAT },
    coerceFrom: (v) => {
      if (typeof v === 'number') return { value: v };
      const n = parseFloat(String(v));
      if (isNaN(n)) return { value: 0, warning: `Could not parse "${v}" as number, defaulting to 0` };
      return { value: n };
    },
    validate: (v) => {
      const n = Number(v);
      if (isNaN(n)) return { valid: false, error: `"${v}" is not a valid number` };
      if (Math.abs(n) > MAX_FLOAT) return { valid: false, error: `Number out of range (±${MAX_FLOAT})` };
      return { valid: true };
    },
    serialize: (v) => String(Number(v)),
    deserialize: (s) => ({ value: parseFloat(s) }),
  },

  integer: {
    type: 'integer',
    description: 'Int64, range ±9,007,199,254,740,991',
    defaultValue: 0,
    constraints: { min: -MAX_INT, max: MAX_INT },
    coerceFrom: (v) => {
      if (typeof v === 'number') return { value: Math.round(v) };
      const n = parseInt(String(v), 10);
      if (isNaN(n)) return { value: 0, warning: `Could not parse "${v}" as integer, defaulting to 0` };
      return { value: n };
    },
    validate: (v) => {
      const n = Number(v);
      if (!isInteger(n)) return { valid: false, error: `"${v}" is not a valid integer or is out of Int64 range` };
      return { valid: true };
    },
    serialize: (v) => String(Math.round(Number(v))),
    deserialize: (s) => ({ value: parseInt(s, 10) }),
  },

  boolean: {
    type: 'boolean',
    description: 'True or false, with text/number coercion',
    defaultValue: false,
    constraints: {},
    coerceFrom: (v) => {
      if (typeof v === 'boolean') return { value: v };
      if (typeof v === 'number') return { value: v !== 0 };
      const s = String(v).toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return { value: true };
      if (s === 'false' || s === '0' || s === 'no' || s === 'off') return { value: false };
      return { value: false, warning: `Could not coerce "${v}" to boolean, defaulting to false` };
    },
    validate: (v) => ({ valid: typeof v === 'boolean' }),
    serialize: (v) => String(Boolean(v)),
    deserialize: (s) => ({ value: s === 'true' }),
  },

  date: {
    type: 'date',
    description: 'ISO 8601 date string',
    defaultValue: null,
    constraints: {},
    coerceFrom: (v) => {
      const s = String(v);
      if (isValidDate(s)) return { value: s };
      return { value: null, warning: `"${s}" is not a valid ISO 8601 date` };
    },
    validate: (v) => {
      if (v === null || v === undefined) return { valid: true };
      const s = String(v);
      if (isValidDate(s)) return { valid: true };
      return { valid: false, error: `"${s}" is not a valid ISO 8601 date` };
    },
    serialize: (v) => String(v ?? ''),
    deserialize: (s) => ({ value: s || null }),
  },

  time: {
    type: 'time',
    description: 'Seconds from midnight, range 0-86399',
    defaultValue: 0,
    constraints: { min: 0, max: 86399 },
    coerceFrom: (v) => {
      const n = parseFloat(String(v));
      if (isNaN(n)) return { value: 0, warning: `Could not parse "${v}" as time, defaulting to 0` };
      return { value: Math.max(0, Math.min(86399, n)) };
    },
    validate: (v) => {
      const n = Number(v);
      if (isNaN(n) || n < 0 || n > 86399) return { valid: false, error: `Time must be 0-86399, got "${v}"` };
      return { valid: true };
    },
    serialize: (v) => String(Number(v)),
    deserialize: (s) => ({ value: parseFloat(s) }),
  },

  duration: {
    type: 'duration',
    description: 'Non-negative duration in seconds (float)',
    defaultValue: 0.0,
    constraints: { min: 0 },
    coerceFrom: (v) => {
      const n = parseFloat(String(v));
      if (isNaN(n)) return { value: 0, warning: `Could not parse "${v}" as duration, defaulting to 0` };
      return { value: Math.max(0, n) };
    },
    validate: (v) => {
      const n = Number(v);
      if (isNaN(n) || n < 0) return { valid: false, error: `Duration must be non-negative, got "${v}"` };
      return { valid: true };
    },
    serialize: (v) => String(Number(v)),
    deserialize: (s) => ({ value: parseFloat(s) }),
  },

  url: {
    type: 'url',
    description: 'HTTP/HTTPS URL, validated on set',
    defaultValue: '',
    constraints: { maxLength: URL_MAX_LEN },
    coerceFrom: (v) => {
      const s = String(v ?? '');
      if (!s) return { value: '' };
      if (isValidURL(s)) return { value: s };
      return { value: s, warning: `"${s}" is not a valid HTTP/HTTPS URL` };
    },
    validate: (v) => {
      const s = String(v ?? '');
      if (!s) return { valid: true };
      if (s.length > URL_MAX_LEN) return { valid: false, error: `URL exceeds ${URL_MAX_LEN} character limit` };
      if (!isValidURL(s)) return { valid: false, error: `"${s}" is not a valid HTTP/HTTPS URL` };
      return { valid: true };
    },
    serialize: (v) => String(v ?? ''),
    deserialize: (s) => ({ value: s }),
  },

  list: {
    type: 'list',
    description: 'JSON array of strings, max 1000 items, each max 2KB',
    defaultValue: [],
    constraints: { maxItems: MAX_LIST_ITEMS, itemMaxLength: MAX_ITEM_LEN },
    coerceFrom: (v) => {
      if (Array.isArray(v)) return { value: v.map(String) };
      return { value: [String(v)] };
    },
    validate: (v) => {
      if (!Array.isArray(v)) return { valid: false, error: 'List must be an array' };
      if (v.length > MAX_LIST_ITEMS) return { valid: false, error: `List exceeds ${MAX_LIST_ITEMS} item limit` };
      for (const item of v) {
        const s = String(item);
        if (s.length > MAX_ITEM_LEN) return { valid: false, error: `List item exceeds ${MAX_ITEM_LEN} char limit` };
      }
      return { valid: true };
    },
    serialize: (v) => JSON.stringify(Array.isArray(v) ? v : []),
    deserialize: (s) => {
      try {
        const arr = JSON.parse(s);
        if (!Array.isArray(arr)) return { value: [], warning: 'Deserialized list was not an array' };
        return { value: arr.map(String) };
      } catch {
        return { value: [], warning: 'Could not deserialize list from JSON' };
      }
    },
  },

  object: {
    type: 'object',
    description: 'JSON object, max 64KB serialized',
    defaultValue: {},
    constraints: { maxSerialized: MAX_SERIALIZED_KB },
    coerceFrom: (v) => {
      if (typeof v === 'object' && v !== null) return { value: v };
      return { value: { value: v } };
    },
    validate: (v) => {
      if (typeof v !== 'object' || v === null) return { valid: false, error: 'Object must be a JSON object' };
      const serialized = JSON.stringify(v);
      if (serialized.length > MAX_SERIALIZED_KB * 1024) {
        return { valid: false, error: `Serialized object exceeds ${MAX_SERIALIZED_KB}KB limit` };
      }
      return { valid: true };
    },
    serialize: (v) => JSON.stringify(v),
    deserialize: (s) => {
      try {
        const obj = JSON.parse(s);
        if (typeof obj !== 'object' || obj === null) return { value: {}, warning: 'Deserialized value was not an object' };
        return { value: obj };
      } catch {
        return { value: {}, warning: 'Could not deserialize object from JSON' };
      }
    },
  },
};

export const VARIABLE_TYPE_NAMES = Object.keys(VARIABLE_TYPES) as VariableType[];

export function getTypeDefinition(type: VariableType): VariableTypeDefinition {
  return VARIABLE_TYPES[type];
}

export function coerceToType(type: VariableType, value: unknown): { value: unknown; warning?: string } {
  return VARIABLE_TYPES[type].coerceFrom(value);
}

export function validateValue(type: VariableType, value: unknown): { valid: boolean; error?: string } {
  return VARIABLE_TYPES[type].validate(value);
}
