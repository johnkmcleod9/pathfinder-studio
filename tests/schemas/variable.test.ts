import { describe, it, expect } from 'vitest';
import { validate } from '../../src/validator.js';

describe('Variable Schema', () => {
  describe('8 Variable Types', () => {
    for (const type of ['trueFalse', 'boolean', 'number', 'text', 'slider', 'sequence', 'date', 'math']) {
      it(`parses type "${type}"`, () => {
        const defaultValue =
          type === 'number' || type === 'slider' || type === 'math' ? 0 :
          type === 'date' ? '2026-01-01' :
          type === 'sequence' ? 'step-1' :
          type === 'text' ? '' :
          false;

        const result = validate('variable', { type, defaultValue });
        expect(result.valid, `"${type}" should be valid but got: ${JSON.stringify(result.errors)}`).toBe(true);
      });
    }

    it('rejects unknown variable type', () => {
      const result = validate('variable', { type: 'uuid', defaultValue: '' });
      expect(result.valid).toBe(false);
    });
  });

  describe('4 Scope Levels', () => {
    for (const scope of ['course', 'scene', 'quiz', 'slide']) {
      it(`parses scope "${scope}"`, () => {
        const result = validate('variable', { type: 'number', defaultValue: 0, scope });
        expect(result.valid, `"${scope}" should be valid`).toBe(true);
      });
    }

    it('defaults scope to "course" when omitted', () => {
      const result = validate('variable', { type: 'number', defaultValue: 0 });
      expect(result.valid).toBe(true);
    });
  });

  describe('Variable Fields', () => {
    it('parses variable with numeric min/max', () => {
      const result = validate('variable', {
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 100,
        decimalPlaces: 0
      });
      expect(result.valid).toBe(true);
    });

    it('parses text variable with maxLength', () => {
      const result = validate('variable', {
        type: 'text',
        defaultValue: '',
        maxLength: 256
      });
      expect(result.valid).toBe(true);
    });

    it('parses text variable with validValues enum', () => {
      const result = validate('variable', {
        type: 'text',
        defaultValue: 'module-1',
        validValues: ['module-1', 'module-2', 'module-3']
      });
      expect(result.valid).toBe(true);
    });

    it('parses variable with LMS mapping', () => {
      const result = validate('variable', {
        type: 'number',
        defaultValue: 0,
        exportToLMS: true,
        lmsMapping: { standard: 'scorm2004', key: 'cmi.score.raw' }
      });
      expect(result.valid).toBe(true);
    });

    it('parses course-scoped variable with persistAcrossSessions', () => {
      const result = validate('variable', {
        type: 'trueFalse',
        defaultValue: false,
        scope: 'course',
        persistAcrossSessions: true,
        exportToLMS: true
      });
      expect(result.valid).toBe(true);
    });

    it('parses variable with description and tags', () => {
      const result = validate('variable', {
        type: 'number',
        defaultValue: 0,
        description: 'Running score accumulator',
        tags: ['scoring', 'quiz']
      });
      expect(result.valid).toBe(true);
    });

    it('rejects invalid LMS standard', () => {
      const result = validate('variable', {
        type: 'number',
        defaultValue: 0,
        exportToLMS: true,
        lmsMapping: { standard: 'invalid-lms', key: 'cmi.score.raw' }
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('Required fields', () => {
    it('rejects variable missing type', () => {
      const result = validate('variable', { defaultValue: false });
      expect(result.valid).toBe(false);
    });

    it('rejects variable missing defaultValue', () => {
      const result = validate('variable', { type: 'number' });
      expect(result.valid).toBe(false);
    });
  });
});
