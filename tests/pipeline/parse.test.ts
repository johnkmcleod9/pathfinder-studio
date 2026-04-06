/**
 * Test Suite 2.1: Pipeline Stage 1 — Parse
 * Tests: .pathfinder ZIP → Project object
 *
 * TDD approach: These tests define the expected interface.
 * They are SKIPPED until Stage 1 (parse) is implemented.
 * Enable with --testNamePattern when implementing Stage 1.
 */
import { describe, it, expect } from 'vitest';

// SKIPPED: Enable with describe.skip -> describe when Stage 1 is implemented
describe.skip('Pipeline Stage 1: Parse', () => {
  // -------------------------------------------------------------------------
  // Helpers — these functions are the public API of Stage 1
  // -------------------------------------------------------------------------

  /**
   * Parse a .pathfinder ZIP file and return the Project object.
   * Throws DescriptiveParseError on failure.
   */
  async function parseProjectFile(_zipPath: string): Promise<unknown> {
    // TODO: Implement Stage 1 parser
    // Expected to:
    // 1. Open ZIP (using yauzl or similar)
    // 2. Extract project.json from root
    // 3. Extract manifest.json from root
    // 4. Validate required structure
    // 5. Return Project object
    throw new Error('Stage 1 (parse) not yet implemented');
  }

  /**
   * Classify a parse error and return a user-friendly message.
   */
  function classifyParseError(_error: unknown): { code: string; message: string } {
    // TODO: Implement error classification
    throw new Error('Stage 1 (parse) not yet implemented');
  }

  // -------------------------------------------------------------------------
  // 2.1 Parse Tests
  // -------------------------------------------------------------------------

  describe('Valid .pathfinder → Project object', () => {
    it('parses a minimal valid .pathfinder ZIP', async () => {
      // A minimal valid .pathfinder ZIP has:
      // - project.json at root with all required fields
      // - manifest.json at root
      // - content/ directory (can be empty)
      const project = await parseProjectFile('fixtures/valid-minimal.pathfinder');
      expect(project).toBeDefined();
      expect(typeof project).toBe('object');
    });

    it('extracts metadata (id, title, author, timestamps)', async () => {
      const project = await parseProjectFile('fixtures/valid-minimal.pathfinder') as Record<string, unknown>;
      expect(project).toHaveProperty('metadata');
      const meta = project.metadata as Record<string, unknown>;
      expect(meta).toHaveProperty('id');
      expect(meta).toHaveProperty('title');
      expect(meta).toHaveProperty('author');
      expect(meta).toHaveProperty('createdAt');
      expect(meta).toHaveProperty('modifiedAt');
    });

    it('extracts slides array with at least one slide', async () => {
      const project = await parseProjectFile('fixtures/valid-minimal.pathfinder') as Record<string, unknown>;
      const slides = project.slides as unknown[];
      expect(slides).toBeInstanceOf(Array);
      expect(slides.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts variables object', async () => {
      const project = await parseProjectFile('fixtures/valid-minimal.pathfinder') as Record<string, unknown>;
      expect(project).toHaveProperty('variables');
      expect(typeof project.variables).toBe('object');
    });

    it('extracts navigation with entrySlide and slides array', async () => {
      const project = await parseProjectFile('fixtures/valid-minimal.pathfinder') as Record<string, unknown>;
      expect(project).toHaveProperty('navigation');
      const nav = project.navigation as Record<string, unknown>;
      expect(nav).toHaveProperty('entrySlide');
      expect(nav).toHaveProperty('slides');
    });

    it('extracts schemaVersion and formatVersion for migration tracking', async () => {
      const project = await parseProjectFile('fixtures/valid-minimal.pathfinder') as Record<string, unknown>;
      expect(project).toHaveProperty('schemaVersion');
      expect(project).toHaveProperty('formatVersion');
    });
  });

  describe('Invalid JSON → descriptive error', () => {
    it('throws when project.json contains invalid JSON', async () => {
      await expect(parseProjectFile('fixtures/invalid-json.pathfinder'))
        .rejects.toThrow();
    });

    it('error code is JSON_PARSE_ERROR', () => {
      const error = classifyParseError(new Error('Unexpected token'));
      expect(error.code).toBe('JSON_PARSE_ERROR');
    });

    it('error message includes the filename', () => {
      const error = classifyParseError(new Error('Unexpected token'));
      expect(error.message).toMatch(/project\.json|invalid-json/);
    });

    it('error message does not leak raw JSON content', () => {
      const error = classifyParseError(new Error('Unexpected token at position 42'));
      expect(error.message).not.toMatch(/sensitive|password|secret/);
    });
  });

  describe('Missing required file → error with filename', () => {
    it('throws when project.json is missing from ZIP', async () => {
      await expect(parseProjectFile('fixtures/missing-project-json.pathfinder'))
        .rejects.toThrow();
    });

    it('error code is MISSING_FILE', () => {
      const error = classifyParseError(new Error('file not found'));
      expect(error.code).toBe('MISSING_FILE');
    });

    it('error message names the missing file', () => {
      const error = classifyParseError(new Error('file not found'));
      expect(error.message).toMatch(/project\.json/);
    });

    it('throws when manifest.json is missing from ZIP', async () => {
      await expect(parseProjectFile('fixtures/missing-manifest.pathfinder'))
        .rejects.toThrow();
    });

    it('throws when content/ directory is missing', async () => {
      await expect(parseProjectFile('fixtures/missing-content-dir.pathfinder'))
        .rejects.toThrow();
    });
  });

  describe('Media reference with no file → warning', () => {
    it('records a warning for each media reference with no matching file', async () => {
      // This test documents expected behavior for Stage 2 (media resolution)
      // but is initiated during parse
      await expect(parseProjectFile('fixtures/missing-media.pathfinder'))
        .rejects.toThrow(/media/);
    });

    it('warning includes the media path that is missing', () => {
      // TODO: After Stage 1+2 are implemented
      expect(true).toBe(true); // Placeholder for now
    });
  });

  describe('Version mismatch → warning', () => {
    it('warns when schemaVersion is newer than supported', async () => {
      // Schema version 99.0.0 is in the future
      await expect(parseProjectFile('fixtures/future-schema-version.pathfinder'))
        .rejects.toThrow(/schemaVersion/);
    });

    it('warns (does not reject) when formatVersion is slightly older', async () => {
      // formatVersion 0.9 is older but potentially migratable
      await expect(parseProjectFile('fixtures/old-format-version.pathfinder'))
        .rejects.toThrow(/formatVersion/);
    });
  });
});
