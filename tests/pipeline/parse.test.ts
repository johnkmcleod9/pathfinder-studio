/**
 * Test Suite 2.1: Pipeline Stage 1 — Parse
 *
 * Tests the strict .pathfinder → Project parser. This is the public-API
 * wrapper that a consumer (CLI, editor, publish pipeline) uses to load
 * a .pathfinder ZIP and get back a validated Project object.
 *
 * Scope (strict mode):
 *   - Require project.json, manifest.json, and media/ dir (when any assets
 *     are declared in the manifest).
 *   - Reject incompatible schemaVersion / formatVersion.
 *   - Classify errors into stable machine-readable codes.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore — adm-zip has no types published
import AdmZip from 'adm-zip';
import {
  parseProjectFile,
  classifyParseError,
  ParseError,
} from '../../src/pipeline/parse.js';

// ---- Helpers ----

function tmpDir(): string {
  return fs.mkdtempSync('pathfinder-parse-test-');
}

interface ZipEntries {
  [name: string]: string | Buffer;
}

function makeTestZip(entries: ZipEntries): string {
  const dir = tmpDir();
  const zipPath = path.join(dir, 'in.pathfinder');
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
  }
  zip.writeZip(zipPath);
  return zipPath;
}

function validProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    formatVersion: '1.0',
    metadata: {
      id: 'course-001',
      title: 'Test Course',
      author: 'Tester',
      language: 'en',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
    },
    slides: [
      {
        id: 'slide-1',
        title: 'Hello',
        background: { type: 'solid', color: '#FFFFFF' },
        objects: {},
        zOrder: [],
        triggers: [],
      },
    ],
    variables: {},
    navigation: {
      entrySlide: 'slide-1',
      slides: ['slide-1'],
      showNavigationArrows: true,
    },
    ...overrides,
  };
}

function emptyManifest(): Record<string, unknown> {
  return {
    version: '1.0',
    projectId: 'course-001',
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    assets: {},
  };
}

function validMinimalZip(): string {
  // Minimal fixture: a valid ZIP with project.json, manifest.json,
  // and an empty media/ directory marker.
  return makeTestZip({
    'project.json': JSON.stringify(validProject()),
    'manifest.json': JSON.stringify(emptyManifest()),
    'media/.keep': '',
  });
}

// ---- 2.1 Parse Tests ----

describe('Pipeline Stage 1: Parse', () => {
  describe('Valid .pathfinder → Project object', () => {
    it('parses a minimal valid .pathfinder ZIP', async () => {
      const result = await parseProjectFile(validMinimalZip());
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.project).toBeDefined();
    });

    it('extracts metadata (id, title, author, timestamps)', async () => {
      const result = await parseProjectFile(validMinimalZip());
      const meta = result.project.metadata as Record<string, unknown>;
      expect(meta.id).toBe('course-001');
      expect(meta.title).toBe('Test Course');
      expect(meta.author).toBe('Tester');
      expect(meta.createdAt).toBeDefined();
      expect(meta.modifiedAt).toBeDefined();
    });

    it('extracts slides array with at least one slide', async () => {
      const result = await parseProjectFile(validMinimalZip());
      const slides = result.project.slides as unknown[];
      expect(slides).toBeInstanceOf(Array);
      expect(slides.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts variables object', async () => {
      const result = await parseProjectFile(validMinimalZip());
      expect(result.project.variables).toBeDefined();
      expect(typeof result.project.variables).toBe('object');
    });

    it('extracts navigation with entrySlide and slides array', async () => {
      const result = await parseProjectFile(validMinimalZip());
      const nav = result.project.navigation as Record<string, unknown>;
      expect(nav.entrySlide).toBe('slide-1');
      expect(nav.slides).toEqual(['slide-1']);
    });

    it('extracts schemaVersion and formatVersion for migration tracking', async () => {
      const result = await parseProjectFile(validMinimalZip());
      expect(result.schemaVersion).toBe('1.0.0');
      expect(result.formatVersion).toBe('1.0');
    });

    it('returns the parsed manifest alongside the project', async () => {
      const result = await parseProjectFile(validMinimalZip());
      expect(result.manifest).toBeDefined();
      expect(result.manifest.projectId).toBe('course-001');
      expect(result.manifest.assets).toEqual({});
    });

    it('returns a warnings array (empty on a clean parse)', async () => {
      const result = await parseProjectFile(validMinimalZip());
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Invalid JSON → descriptive error', () => {
    it('throws when project.json contains invalid JSON', async () => {
      const zip = makeTestZip({
        'project.json': '{ not valid json',
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      await expect(parseProjectFile(zip)).rejects.toThrow();
    });

    it('throws a ParseError with code JSON_PARSE_ERROR', async () => {
      const zip = makeTestZip({
        'project.json': '{ not valid json',
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      await expect(parseProjectFile(zip)).rejects.toMatchObject({
        name: 'ParseError',
        code: 'JSON_PARSE_ERROR',
      });
    });

    it('error message references project.json filename', async () => {
      const zip = makeTestZip({
        'project.json': '{ not valid json',
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      try {
        await parseProjectFile(zip);
      } catch (err) {
        expect((err as Error).message).toMatch(/project\.json/);
      }
    });

    it('error message does not leak raw JSON content', async () => {
      const zip = makeTestZip({
        'project.json': '{ "password": "secret123", bad syntax',
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      try {
        await parseProjectFile(zip);
      } catch (err) {
        expect((err as Error).message).not.toMatch(/secret123/);
      }
    });
  });

  describe('Missing required file → error with filename', () => {
    it('throws when project.json is missing from ZIP', async () => {
      const zip = makeTestZip({
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      await expect(parseProjectFile(zip)).rejects.toThrow();
    });

    it('throws a ParseError with code MISSING_FILE when project.json is absent', async () => {
      const zip = makeTestZip({
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      await expect(parseProjectFile(zip)).rejects.toMatchObject({
        name: 'ParseError',
        code: 'MISSING_FILE',
      });
    });

    it('error message names project.json when it is the missing file', async () => {
      const zip = makeTestZip({
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      try {
        await parseProjectFile(zip);
      } catch (err) {
        expect((err as Error).message).toMatch(/project\.json/);
      }
    });

    it('throws when manifest.json is missing from ZIP', async () => {
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject()),
        'media/.keep': '',
      });
      await expect(parseProjectFile(zip)).rejects.toMatchObject({
        code: 'MISSING_FILE',
      });
    });

    it('error message names manifest.json when it is the missing file', async () => {
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject()),
        'media/.keep': '',
      });
      try {
        await parseProjectFile(zip);
      } catch (err) {
        expect((err as Error).message).toMatch(/manifest\.json/);
      }
    });

    it('throws when media/ directory is missing AND assets are declared', async () => {
      const manifest = emptyManifest();
      manifest.assets = {
        'media/img.png': {
          path: 'media/img.png',
          hash: 'deadbeef',
          size: 1,
          mimeType: 'image/png',
          originalName: 'img.png',
          addedAt: '2026-01-01T00:00:00.000Z',
        },
      };
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject()),
        'manifest.json': JSON.stringify(manifest),
      });
      await expect(parseProjectFile(zip)).rejects.toThrow();
    });

    it('tolerates missing media/ when no assets are declared', async () => {
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject()),
        'manifest.json': JSON.stringify(emptyManifest()),
        // no media/ folder
      });
      const result = await parseProjectFile(zip);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.join(' ')).toMatch(/media/);
    });
  });

  describe('Invalid ZIP → descriptive error', () => {
    it('throws ParseError with code INVALID_ZIP when file is not a ZIP', async () => {
      const dir = tmpDir();
      const bogusPath = path.join(dir, 'bogus.pathfinder');
      fs.writeFileSync(bogusPath, 'this is not a zip file');
      await expect(parseProjectFile(bogusPath)).rejects.toMatchObject({
        code: 'INVALID_ZIP',
      });
    });
  });

  describe('Media reference with no file → error', () => {
    it('rejects when manifest declares an asset whose file is absent', async () => {
      const manifest = emptyManifest();
      manifest.assets = {
        'media/missing.png': {
          path: 'media/missing.png',
          hash: 'deadbeef',
          size: 1,
          mimeType: 'image/png',
          originalName: 'missing.png',
          addedAt: '2026-01-01T00:00:00.000Z',
        },
      };
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject()),
        'manifest.json': JSON.stringify(manifest),
        'media/.keep': '',
      });
      await expect(parseProjectFile(zip)).rejects.toMatchObject({
        code: 'MISSING_MEDIA',
      });
    });

    it('error message includes the missing media path', async () => {
      const manifest = emptyManifest();
      manifest.assets = {
        'media/gone.png': {
          path: 'media/gone.png',
          hash: 'deadbeef',
          size: 1,
          mimeType: 'image/png',
          originalName: 'gone.png',
          addedAt: '2026-01-01T00:00:00.000Z',
        },
      };
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject()),
        'manifest.json': JSON.stringify(manifest),
        'media/.keep': '',
      });
      try {
        await parseProjectFile(zip);
      } catch (err) {
        expect((err as Error).message).toMatch(/gone\.png/);
      }
    });
  });

  describe('Version mismatch → error', () => {
    it('rejects when schemaVersion is newer than supported', async () => {
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject({ schemaVersion: '99.0.0' })),
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      await expect(parseProjectFile(zip)).rejects.toMatchObject({
        code: 'VERSION_MISMATCH',
      });
    });

    it('error message references schemaVersion when that is the mismatch', async () => {
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject({ schemaVersion: '99.0.0' })),
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      try {
        await parseProjectFile(zip);
      } catch (err) {
        expect((err as Error).message).toMatch(/schemaVersion/);
      }
    });

    it('rejects when formatVersion is older than supported', async () => {
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject({ formatVersion: '0.9' })),
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      await expect(parseProjectFile(zip)).rejects.toMatchObject({
        code: 'VERSION_MISMATCH',
      });
    });

    it('error message references formatVersion when that is the mismatch', async () => {
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject({ formatVersion: '0.9' })),
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      try {
        await parseProjectFile(zip);
      } catch (err) {
        expect((err as Error).message).toMatch(/formatVersion/);
      }
    });

    it('accepts an equal-or-newer-patch schemaVersion (e.g. 1.0.1)', async () => {
      const zip = makeTestZip({
        'project.json': JSON.stringify(validProject({ schemaVersion: '1.0.1' })),
        'manifest.json': JSON.stringify(emptyManifest()),
        'media/.keep': '',
      });
      // 1.0.1 is same-major/same-minor as current 1.0.0 — should pass.
      const result = await parseProjectFile(zip);
      expect(result.schemaVersion).toBe('1.0.1');
    });
  });

  describe('classifyParseError', () => {
    it('classifies a ParseError by its own code', () => {
      const err = new ParseError('MISSING_FILE', 'project.json not found');
      const out = classifyParseError(err);
      expect(out.code).toBe('MISSING_FILE');
      expect(out.message).toMatch(/project\.json/);
    });

    it('classifies a generic JSON SyntaxError as JSON_PARSE_ERROR', () => {
      const err = new SyntaxError('Unexpected token } in JSON at position 42');
      const out = classifyParseError(err);
      expect(out.code).toBe('JSON_PARSE_ERROR');
    });

    it('classifies a "file not found" error as MISSING_FILE', () => {
      const err = new Error('ENOENT: no such file or directory, open "project.json"');
      const out = classifyParseError(err);
      expect(out.code).toBe('MISSING_FILE');
      expect(out.message).toMatch(/project\.json/);
    });

    it('classifies unknown errors as UNKNOWN', () => {
      const out = classifyParseError(new Error('something totally unexpected'));
      expect(out.code).toBe('UNKNOWN');
    });

    it('classification message does not leak sensitive substrings verbatim', () => {
      const err = new SyntaxError('Unexpected token at position 42 near "password":"hunter2"');
      const out = classifyParseError(err);
      expect(out.message).not.toMatch(/hunter2/);
    });
  });
});
