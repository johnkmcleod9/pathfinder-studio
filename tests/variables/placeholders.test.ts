import { describe, it, expect, beforeEach } from 'vitest';
import { VariableStore } from '../../src/variables/store.js';
import { expandPlaceholders, collectPlaceholders, validatePlaceholders } from '../../src/variables/placeholders.js';

function makeStore(): VariableStore {
  const store = new VariableStore();
  store.define('playerName', 'text');
  store.define('score', 'number');
  store.define('highScore', 'number');
  store.define('isActive', 'boolean');
  store.define('tags', 'list');
  store.set('playerName', 'Alice');
  store.set('score', 950);
  store.set('highScore', 1200);
  store.set('isActive', true);
  store.set('tags', ['winner', 'champion']);
  return store;
}

describe('Placeholders', () => {
  let store: VariableStore;

  beforeEach(() => {
    store = makeStore();
  });

  describe('expandPlaceholders — %var% syntax', () => {
    it('expands a single variable', () => {
      const result = expandPlaceholders('Hello, %playerName%!', store);
      expect(result.text).toBe('Hello, Alice!');
      expect(result.referencedVariables).toContain('playerName');
    });

    it('expands multiple variables', () => {
      const result = expandPlaceholders('Score: %score% / %highScore%', store);
      expect(result.text).toBe('Score: 950 / 1,200');
    });

    it('expands mixed text and variables', () => {
      const result = expandPlaceholders('Player %playerName% scored %score% points.', store);
      expect(result.text).toBe('Player Alice scored 950 points.');
    });

    it('leaves unresolved variables as-is by default', () => {
      const result = expandPlaceholders('Unknown: %unknownVar%', store);
      expect(result.text).toBe('Unknown: %unknownVar%');
      expect(result.unresolvedVariables).toContain('unknownVar');
    });

    it('removes unresolved variables when leaveUnresolved=false', () => {
      const result = expandPlaceholders('Missing: %unknown%', store, { leaveUnresolved: false });
      expect(result.text).toBe('Missing: ');
    });

    it('handles no variables in text', () => {
      const result = expandPlaceholders('Static text only.', store);
      expect(result.text).toBe('Static text only.');
      expect(result.referencedVariables).toHaveLength(0);
    });

    it('handles empty string', () => {
      const result = expandPlaceholders('', store);
      expect(result.text).toBe('');
    });

    it('handles boolean expansion', () => {
      const result = expandPlaceholders('Active: %isActive%', store);
      expect(result.text).toBe('Active: true');
    });

    it('handles list expansion', () => {
      const result = expandPlaceholders('Tags: %tags%', store);
      expect(result.text).toBe('Tags: winner,champion');
    });

    it('empty variable becomes empty string', () => {
      store.define('empty', 'text');
      const result = expandPlaceholders('Val: %empty%', store);
      expect(result.text).toBe('Val: ');
    });
  });

  describe('expandPlaceholders — {{var}} syntax', () => {
    it('expands double-brace syntax', () => {
      const result = expandPlaceholders('Name: {{playerName}}', store);
      expect(result.text).toBe('Name: Alice');
    });

    it('expands both syntaxes in same text', () => {
      const result = expandPlaceholders('%playerName% ({{score}})', store);
      expect(result.text).toBe('Alice (950)');
    });

    it('skips {{}} when doubleBrace=false', () => {
      const result = expandPlaceholders('Name: {{playerName}}', store, { doubleBrace: false });
      expect(result.text).toBe('Name: {{playerName}}');
    });
  });

  describe('System variable expansion', () => {
    it('expands %system.date%', () => {
      const result = expandPlaceholders('Date: %system.date%', store);
      // Date formatted per locale (default: numeric). Just check it contains a 4-digit year.
      expect(result.text).toMatch(/\d{4}/);
    });

    it('references system variables as well as author variables', () => {
      const result = expandPlaceholders('Today is %system.date%, player: %playerName%', store);
      expect(result.referencedVariables).toContain('system.date');
      expect(result.referencedVariables).toContain('playerName');
    });
  });

  describe('Duration formatting', () => {
    it('formats duration as hh:mm:ss when over 1 hour', () => {
      store.define('elapsed', 'duration');
      store.set('elapsed', 3661); // 1h 1m 1s
      const result = expandPlaceholders('%elapsed%', store);
      expect(result.text).toBe('1:01:01');
    });

    it('formats duration as mm:ss when under 1 hour', () => {
      store.define('elapsedShort', 'duration');
      store.set('elapsedShort', 125); // 2m 5s
      const result = expandPlaceholders('%elapsedShort%', store);
      expect(result.text).toBe('02:05');
    });


  });

  describe('collectPlaceholders', () => {
    it('extracts variable names', () => {
      const result = collectPlaceholders('Hello %playerName%, your score is %score%');
      expect(result.tokens).toEqual(['playerName', 'score']);
    });

    it('deduplicates repeated references', () => {
      const result = collectPlaceholders('%score% / %score%');
      expect(result.tokens).toEqual(['score']);
    });

    it('detects both syntax styles', () => {
      const result = collectPlaceholders('%a% and {{b}}');
      expect(result.hasPercentStyle).toBe(true);
      expect(result.hasDoubleBraceStyle).toBe(true);
    });
  });

  describe('validatePlaceholders', () => {
    it('valid text with placeholders', () => {
      expect(validatePlaceholders('Hello %name%').valid).toBe(true);
    });

    it('unclosed % placeholder is invalid', () => {
      const result = validatePlaceholders('Hello %name');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unclosed');
    });

    it('unclosed {{ is invalid', () => {
      const result = validatePlaceholders('Hello {{name');
      expect(result.valid).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('%% (empty placeholder) is left as-is', () => {
      const result = expandPlaceholders('%%', store);
      expect(result.text).toBe('%%');
    });

    it('variable at start of text', () => {
      const result = expandPlaceholders('%playerName% is playing!', store);
      expect(result.text).toBe('Alice is playing!');
    });

    it('variable at end of text', () => {
      const result = expandPlaceholders('Score: %score%', store);
      expect(result.text).toBe('Score: 950');
    });

    it('consecutive variables', () => {
      const result = expandPlaceholders('%playerName%%score%', store);
      expect(result.text).toBe('Alice950');
    });

    it('placeholder with surrounding punctuation', () => {
      const result = expandPlaceholders('(score: %score%)', store);
      expect(result.text).toBe('(score: 950)');
    });
  });
});
