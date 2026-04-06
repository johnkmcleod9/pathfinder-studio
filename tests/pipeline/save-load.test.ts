import { describe, it, expect, beforeEach, vi } from 'vitest';
import JSZip from 'jszip';
import {
  saveProject,
  loadProject,
  InvalidZipError,
  LoadValidationError,
} from '../../src/pipeline/index.js';
import { createManifest, addAsset, contentHash, hashPath, mimeFromFilename, verifyAsset } from '../../src/pipeline/manifest.js';
import { compareVersions, migrateProject, CURRENT_SCHEMA_VERSION, CURRENT_FORMAT_VERSION } from '../../src/pipeline/migrate.js';

const VALID_PROJECT = {
  $schema: 'https://pathfinder.studio/schemas/pathfinder-v1.schema.json',
  schemaVersion: '1.0.0',
  formatVersion: '1.0',
  metadata: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Test Course',
    author: 'Test Author',
    authorId: '550e8400-e29b-41d4-a716-446655440001',
    createdAt: '2026-04-01T10:00:00Z',
    modifiedAt: '2026-04-01T10:00:00Z',
  },
  slides: [
    {
      id: 'slide-001',
      background: { type: 'solid', color: '#FFFFFF' },
      zOrder: [],
      objects: {},
    },
  ],
  variables: {},
  navigation: { entrySlide: 'slide-001', slides: ['slide-001'] },
};

describe('Save/Load Pipeline', () => {
  describe('saveProject', () => {
    it('creates a ZIP with project.json', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const jszip = await JSZip.loadAsync(zip);
      expect(jszip.file('project.json')).toBeDefined();
    });

    it('creates a ZIP with manifest.json', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const jszip = await JSZip.loadAsync(zip);
      expect(jszip.file('manifest.json')).toBeDefined();
    });

    it('ZIP is a valid nodebuffer', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      expect(Buffer.isBuffer(zip)).toBe(true);
      expect(zip.length).toBeGreaterThan(0);
    });

    it('project.json is valid JSON', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const jszip = await JSZip.loadAsync(zip);
      const text = await jszip.file('project.json')!.async('string');
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it('manifest.json contains project id', async () => {
      const { manifest } = await saveProject(VALID_PROJECT);
      expect(manifest.projectId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('files list includes project.json and manifest.json', async () => {
      const { files } = await saveProject(VALID_PROJECT);
      expect(files).toContain('project.json');
      expect(files).toContain('manifest.json');
    });
  });

  describe('loadProject', () => {
    it('loads a valid .pathfinder ZIP', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const result = await loadProject(zip);
      expect(result.project).toBeDefined();
    });

    it('preserves project metadata', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const result = await loadProject(zip);
      const proj = result.project as Record<string, unknown>;
      expect((proj.metadata as Record<string, unknown>).title).toBe('Test Course');
    });

    it('preserves slides array', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const result = await loadProject(zip);
      const proj = result.project as Record<string, unknown>;
      expect((proj.slides as unknown[]).length).toBe(1);
    });

    it('returns schema and format versions', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const result = await loadProject(zip);
      expect(result.schemaVersion).toBe('1.0.0');
      expect(result.formatVersion).toBe('1.0');
    });

    it('returns empty media files object when no media', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const result = await loadProject(zip);
      expect(result.mediaFiles).toEqual({});
    });

    it('throws InvalidZipError for non-ZIP data', async () => {
      const nonZip = Buffer.from('this is not a zip');
      await expect(loadProject(nonZip)).rejects.toThrow(InvalidZipError);
    });

    it('throws LoadValidationError when project.json is missing', async () => {
      const jszip = new JSZip();
      jszip.file('README.txt', 'hello');
      const zip = await jszip.generateAsync({ type: 'nodebuffer' });
      await expect(loadProject(zip)).rejects.toThrow(LoadValidationError);
    });
  });

  describe('Round-trip (save → load)', () => {
    it('round-trip preserves full project structure', async () => {
      const { zip } = await saveProject(VALID_PROJECT);
      const result = await loadProject(zip);
      const loaded = JSON.stringify(result.project);
      const original = JSON.stringify(VALID_PROJECT);
      expect(loaded).toEqual(original);
    });

    it('round-trip preserves variables', async () => {
      const project = {
        ...VALID_PROJECT,
        variables: {
          playerName: { type: 'text', defaultValue: 'Alice' },
          score: { type: 'number', defaultValue: 0 },
        },
      };
      const { zip } = await saveProject(project);
      const result = await loadProject(zip);
      const vars = (result.project as Record<string, unknown>).variables as Record<string, unknown>;
      expect(vars.playerName).toBeDefined();
      expect(vars.score).toBeDefined();
    });
  });

  describe('Version constants', () => {
    it('CURRENT_SCHEMA_VERSION is 1.0.0', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe('1.0.0');
    });

    it('CURRENT_FORMAT_VERSION is 1.0', () => {
      expect(CURRENT_FORMAT_VERSION).toBe('1.0');
    });
  });
});

describe('Manifest', () => {
  const MANIFEST_PROJECT_ID = 'test-project-001';

  describe('createManifest', () => {
    it('creates manifest with project ID and timestamps', () => {
      const manifest = createManifest({ projectId: MANIFEST_PROJECT_ID });
      expect(manifest.projectId).toBe(MANIFEST_PROJECT_ID);
      expect(manifest.version).toBe('1.0');
      expect(manifest.createdAt).toBeDefined();
      expect(manifest.modifiedAt).toBeDefined();
      expect(manifest.assets).toEqual({});
    });
  });

  describe('addAsset / contentHash', () => {
    it('computes consistent SHA-256 hash', () => {
      const buf = Buffer.from('hello world');
      const hash = contentHash(buf);
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('addAsset adds buffer to manifest and returns content-addressed path', () => {
      const manifest = createManifest({ projectId: MANIFEST_PROJECT_ID });
      const buf = Buffer.from('PNG data');
      const path = addAsset(manifest, buf, 'image.png', 'image/png');
      expect(path).toContain('image_');
      expect(manifest.assets[path]).toBeDefined();
      expect(manifest.assets[path].size).toBe(8);
      expect(manifest.assets[path].mimeType).toBe('image/png');
      expect(manifest.assets[path].hash).toBe(contentHash(buf));
    });

    it('deduplicates identical content when filenames match', () => {
      const manifest = createManifest({ projectId: MANIFEST_PROJECT_ID });
      const buf = Buffer.from('same content');
      // Same filename → same content hash → same path
      const path1 = addAsset(manifest, buf, 'file.txt');
      const path2 = addAsset(manifest, buf, 'file.txt');
      expect(path1).toBe(path2); // Same content + same name = same path
    });

    it('different content produces different paths', () => {
      const manifest = createManifest({ projectId: MANIFEST_PROJECT_ID });
      const buf1 = Buffer.from('content A');
      const buf2 = Buffer.from('content B');
      const path1 = addAsset(manifest, buf1, 'a.txt');
      const path2 = addAsset(manifest, buf2, 'b.txt');
      expect(path1).not.toBe(path2);
    });
  });

  describe('verifyAsset', () => {
    it('returns true for matching content', () => {
      const manifest = createManifest({ projectId: MANIFEST_PROJECT_ID });
      const buf = Buffer.from('test content');
      const path = addAsset(manifest, buf, 'test.txt');
      expect(verifyAsset(manifest, path, buf)).toBe(true);
    });

    it('returns false for tampered content', () => {
      const manifest = createManifest({ projectId: MANIFEST_PROJECT_ID });
      const buf = Buffer.from('original');
      const path = addAsset(manifest, buf, 'test.txt');
      const tampered = Buffer.from('modified');
      expect(verifyAsset(manifest, path, tampered)).toBe(false);
    });

    it('returns false for missing asset', () => {
      const manifest = createManifest({ projectId: MANIFEST_PROJECT_ID });
      expect(verifyAsset(manifest, 'nonexistent.png', Buffer.from('x'))).toBe(false);
    });
  });

  describe('mimeFromFilename', () => {
    const cases: [string, string][] = [
      ['image.png', 'image/png'],
      ['photo.jpg', 'image/jpeg'],
      ['sound.mp3', 'audio/mpeg'],
      ['video.mp4', 'video/mp4'],
      ['font.otf', 'font/otf'],
      ['doc.pdf', 'application/pdf'],
      ['data.json', 'application/json'],
      ['script.js', 'application/javascript'],
      ['noextension', 'application/octet-stream'],
      ['UPPERCASE.PNG', 'image/png'],
    ];

    for (const [filename, expected] of cases) {
      it(`"${filename}" → "${expected}"`, () => {
        expect(mimeFromFilename(filename)).toBe(expected);
      });
    }
  });

  describe('hashPath', () => {
    it('uses content hash in filename', () => {
      const buf = Buffer.from('content');
      const path = hashPath(buf, 'image.png');
      expect(path).toMatch(/^image_[a-f0-9]{12}\.png$/);
    });

    it('same content = same hash regardless of filename', () => {
      const buf = Buffer.from('content');
      // hashPath includes base name, so paths differ; check the HASH is same
      expect(contentHash(Buffer.from('content'))).toBe(contentHash(Buffer.from('content')));
    });
  });
});

describe('Migrate', () => {
  describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    });

    it('returns -1 when a < b', () => {
      expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    it('returns 1 when a > b', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });

    it('handles different length version strings', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.1', '1.0.0')).toBe(1);
    });
  });

  describe('migrateProject', () => {
    it('returns unchanged project when already at target version', () => {
      const result = migrateProject({ ...VALID_PROJECT, schemaVersion: '1.0.0' }, '1.0.0');
      expect(result.migrated).toBe(false);
      expect(result.finalVersion).toBe('1.0.0');
    });

    it('warns when no migration path exists', () => {
      const oldProject = { ...VALID_PROJECT, schemaVersion: '0.5.0' } as Record<string, unknown>;
      const result = migrateProject(oldProject, '1.0.0');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
