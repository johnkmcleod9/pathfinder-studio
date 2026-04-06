import { describe, it, expect } from 'vitest';
import {
  VARIABLE_TYPES, VARIABLE_TYPE_NAMES, getTypeDefinition,
  coerceToType, validateValue
} from '../../src/variables/types.js';

describe('Variable Types', () => {
  describe('All 10 types are defined', () => {
    for (const type of VARIABLE_TYPE_NAMES) {
      it(`"${type}" has required fields`, () => {
        const def = getTypeDefinition(type);
        expect(def.type).toBe(type);
        expect(typeof def.description).toBe('string');
        expect(def.coerceFrom).toBeDefined();
        expect(def.validate).toBeDefined();
        expect(def.serialize).toBeDefined();
        expect(def.deserialize).toBeDefined();
      });
    }

    it('exactly 10 types defined', () => {
      expect(VARIABLE_TYPE_NAMES).toHaveLength(10);
      expect(VARIABLE_TYPE_NAMES).toContain('text');
      expect(VARIABLE_TYPE_NAMES).toContain('number');
      expect(VARIABLE_TYPE_NAMES).toContain('integer');
      expect(VARIABLE_TYPE_NAMES).toContain('boolean');
      expect(VARIABLE_TYPE_NAMES).toContain('date');
      expect(VARIABLE_TYPE_NAMES).toContain('time');
      expect(VARIABLE_TYPE_NAMES).toContain('duration');
      expect(VARIABLE_TYPE_NAMES).toContain('url');
      expect(VARIABLE_TYPE_NAMES).toContain('list');
      expect(VARIABLE_TYPE_NAMES).toContain('object');
    });
  });

  describe('text type', () => {
    it('default value is empty string', () => {
      expect(getTypeDefinition('text').defaultValue).toBe('');
    });

    it('coerces any value to string', () => {
      expect(coerceToType('text', 42).value).toBe('42');
      expect(coerceToType('text', true).value).toBe('true');
      expect(coerceToType('text', null).value).toBe('');
    });

    it('validates string under 64KB', () => {
      expect(validateValue('text', 'hello').valid).toBe(true);
      expect(validateValue('text', 'a'.repeat(65_537)).valid).toBe(false);
    });
  });

  describe('number type', () => {
    it('default value is 0', () => {
      expect(getTypeDefinition('number').defaultValue).toBe(0);
    });

    it('coerces numeric string to number', () => {
      expect(coerceToType('number', '3.14').value).toBe(3.14);
    });

    it('invalid numeric string → 0 with warning', () => {
      const { value, warning } = coerceToType('number', 'not-a-number');
      expect(value).toBe(0);
      expect(warning).toContain('Could not parse');
    });

    it('validates numbers within range', () => {
      expect(validateValue('number', 0).valid).toBe(true);
      expect(validateValue('number', -9999999999999).valid).toBe(true);
      expect(validateValue('number', 9_999_999_999_999).valid).toBe(true);
      expect(validateValue('number', 'abc').valid).toBe(false);
    });
  });

  describe('integer type', () => {
    it('rounds float on coerce', () => {
      expect(coerceToType('integer', 3.7).value).toBe(4);
      expect(coerceToType('integer', 3.2).value).toBe(3);
    });

    it('rejects non-integer values', () => {
      expect(validateValue('integer', 3).valid).toBe(true);
      expect(validateValue('integer', 3.14).valid).toBe(false);
      expect(validateValue('integer', 'not-int').valid).toBe(false);
    });
  });

  describe('boolean type', () => {
    it('default is false', () => {
      expect(getTypeDefinition('boolean').defaultValue).toBe(false);
    });

    it('coerces string "true"/"1" to true', () => {
      expect(coerceToType('boolean', 'true').value).toBe(true);
      expect(coerceToType('boolean', '1').value).toBe(true);
      expect(coerceToType('boolean', 'yes').value).toBe(true);
    });

    it('coerces string "false"/"0" to false', () => {
      expect(coerceToType('boolean', 'false').value).toBe(false);
      expect(coerceToType('boolean', '0').value).toBe(false);
    });

    it('coerces numbers correctly', () => {
      expect(coerceToType('boolean', 1).value).toBe(true);
      expect(coerceToType('boolean', 0).value).toBe(false);
      expect(coerceToType('boolean', 42).value).toBe(true);
    });
  });

  describe('date type', () => {
    it('accepts valid ISO 8601 dates', () => {
      expect(validateValue('date', '2026-04-06').valid).toBe(true);
      expect(validateValue('date', '2026-04-06T12:00:00Z').valid).toBe(true);
    });

    it('rejects invalid dates', () => {
      expect(validateValue('date', 'not-a-date').valid).toBe(false);
      expect(validateValue('date', '2026-13-01').valid).toBe(false); // month 13
    });

    it('null is valid (optional field)', () => {
      expect(validateValue('date', null).valid).toBe(true);
    });
  });

  describe('time type', () => {
    it('accepts 0-86399', () => {
      expect(validateValue('time', 0).valid).toBe(true);
      expect(validateValue('time', 86399).valid).toBe(true);
      expect(validateValue('time', 43200).valid).toBe(true);
    });

    it('rejects out-of-range values', () => {
      expect(validateValue('time', -1).valid).toBe(false);
      expect(validateValue('time', 86400).valid).toBe(false);
    });
  });

  describe('duration type', () => {
    it('accepts non-negative numbers', () => {
      expect(validateValue('duration', 0).valid).toBe(true);
      expect(validateValue('duration', 120.5).valid).toBe(true);
    });

    it('rejects negative values', () => {
      expect(validateValue('duration', -1).valid).toBe(false);
    });
  });

  describe('url type', () => {
    it('accepts HTTP/HTTPS URLs', () => {
      expect(validateValue('url', 'https://example.com').valid).toBe(true);
      expect(validateValue('url', 'http://localhost:3000/path').valid).toBe(true);
    });

    it('rejects non-HTTP URLs', () => {
      expect(validateValue('url', 'ftp://files.com').valid).toBe(false);
      expect(validateValue('url', 'javascript:alert(1)').valid).toBe(false);
    });

    it('accepts empty string', () => {
      expect(validateValue('url', '').valid).toBe(true);
    });
  });

  describe('list type', () => {
    it('default is empty array', () => {
      expect(getTypeDefinition('list').defaultValue).toEqual([]);
    });

    it('validates max 1000 items', () => {
      const large = Array(1001).fill('item');
      expect(validateValue('list', large).valid).toBe(false);
      expect(validateValue('list', Array(1000).fill('item')).valid).toBe(true);
    });

    it('coerces single value to single-item array', () => {
      expect(coerceToType('list', 'hello').value).toEqual(['hello']);
      expect(coerceToType('list', ['a', 'b']).value).toEqual(['a', 'b']);
    });
  });

  describe('object type', () => {
    it('default is empty object', () => {
      expect(getTypeDefinition('object').defaultValue).toEqual({});
    });

    it('validates JSON objects', () => {
      expect(validateValue('object', { key: 'value' }).valid).toBe(true);
      expect(validateValue('object', { nested: { a: 1 } }).valid).toBe(true);
      expect(validateValue('object', 'not an object').valid).toBe(false);
      expect(validateValue('object', null).valid).toBe(false);
    });

    it('rejects objects over 64KB serialized', () => {
      const huge = { data: 'x'.repeat(70000) };
      expect(validateValue('object', huge).valid).toBe(false);
    });
  });

  describe('Serialization round-trip', () => {
    const pairs: [string, unknown][] = [
      ['text', 'Hello World'],
      ['number', 3.14159],
      ['integer', 42],
      ['boolean', true],
      ['boolean', false],
      ['duration', 3661.5],
      ['url', 'https://example.com/path?query=1'],
      ['list', ['apple', 'banana']],
      ['object', { name: 'Alice', age: 30 }],
    ];

    for (const [type, value] of pairs) {
      it(`${type}: ${JSON.stringify(value)}`, () => {
        const def = getTypeDefinition(type as any);
        const serialized = def.serialize(value);
        const { value: deserialized } = def.deserialize(serialized);
        expect(deserialized).toEqual(value);
      });
    }
  });
});
