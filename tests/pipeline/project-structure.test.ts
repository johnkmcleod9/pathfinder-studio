/**
 * Test Suite 1.2: Project Structure Validation
 *
 * Tests the .pathfinder ZIP *container* structure — independent of JSON
 * schema validation of the contents. This is the cheap-and-fast pre-check
 * a consumer runs before handing the ZIP to parseProjectFile().
 *
 * Validates:
 *   - Required root entries (project.json, manifest.json).
 *   - project.json must be at ZIP root, not in a subdirectory.
 *   - media/ directory is present (empty dir is fine).
 *   - Media files have recognized extensions.
 *   - Executables are rejected (security).
 *   - Hidden OS files (.DS_Store, Thumbs.db) produce warnings, not errors.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore — adm-zip has no types published
import AdmZip from 'adm-zip';
import { validateZipFile } from '../../src/pipeline/validate.js';

// ---- Helpers ----

function tmpDir(): string {
  return fs.mkdtempSync('pathfinder-structure-test-');
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

const MINIMAL_STRUCTURE: ZipEntries = {
  'project.json': '{}',
  'manifest.json': '{"assets":{}}',
  'media/.keep': '',
};

// ---- Tests ----

describe('Project Structure (ZIP container)', () => {
  describe('Valid .pathfinder ZIP opens successfully', () => {
    it('opens a valid .pathfinder ZIP without error', async () => {
      const zipPath = makeTestZip(MINIMAL_STRUCTURE);
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('reports structure-level warnings array (empty on clean input)', async () => {
      const zipPath = makeTestZip(MINIMAL_STRUCTURE);
      const result = await validateZipFile(zipPath);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('project.json exists at root', () => {
    it('rejects ZIP without project.json at root', async () => {
      const zipPath = makeTestZip({
        'manifest.json': '{"assets":{}}',
        'media/.keep': '',
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('project.json'))).toBe(true);
    });

    it('rejects ZIP with project.json only in a subdirectory', async () => {
      const zipPath = makeTestZip({
        'sub/project.json': '{}',
        'manifest.json': '{"assets":{}}',
        'media/.keep': '',
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('project.json'))).toBe(true);
    });
  });

  describe('manifest.json exists at root', () => {
    it('rejects ZIP without manifest.json at root', async () => {
      const zipPath = makeTestZip({
        'project.json': '{}',
        'media/.keep': '',
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('manifest.json'))).toBe(true);
    });
  });

  describe('media/ directory exists (even if empty)', () => {
    it('rejects ZIP without a media/ directory', async () => {
      const zipPath = makeTestZip({
        'project.json': '{}',
        'manifest.json': '{"assets":{}}',
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('media'))).toBe(true);
    });
  });

  describe('Media files in media/ have valid extensions', () => {
    // Recognized: .png .jpg .jpeg .gif .webp .svg (images),
    // .mp4 .webm .mov .m4v (video), .mp3 .wav .ogg .m4a .aac .flac (audio),
    // .pdf, .zip, .json, .xml

    it('accepts media files with recognized extensions', async () => {
      const zipPath = makeTestZip({
        ...MINIMAL_STRUCTURE,
        'media/image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        'media/audio.mp3': Buffer.from([0xff, 0xfb]),
        'media/video.mp4': Buffer.from([0x00, 0x00, 0x00, 0x18]),
        'media/doc.pdf': Buffer.from('%PDF-1.4'),
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(true);
    });

    it('warns about files with unrecognized extension in media/', async () => {
      const zipPath = makeTestZip({
        ...MINIMAL_STRUCTURE,
        'media/mystery.xyz': Buffer.from('??'),
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('mystery.xyz'))).toBe(true);
    });

    it('rejects executables (.exe) anywhere in the ZIP', async () => {
      const zipPath = makeTestZip({
        ...MINIMAL_STRUCTURE,
        'media/virus.exe': Buffer.from('MZ'),
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /exe|executable/i.test(e))).toBe(true);
    });

    it('rejects macOS app bundles (.app)', async () => {
      const zipPath = makeTestZip({
        ...MINIMAL_STRUCTURE,
        'media/malware.app': Buffer.from('fake'),
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(false);
    });

    it('rejects disk images (.dmg)', async () => {
      const zipPath = makeTestZip({
        ...MINIMAL_STRUCTURE,
        'media/installer.dmg': Buffer.from('fake'),
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(false);
    });

    it('rejects shell scripts (.sh, .bat, .cmd, .ps1)', async () => {
      for (const ext of ['sh', 'bat', 'cmd', 'ps1']) {
        const zipPath = makeTestZip({
          ...MINIMAL_STRUCTURE,
          [`media/script.${ext}`]: Buffer.from('echo hi'),
        });
        const result = await validateZipFile(zipPath);
        expect(result.valid).toBe(false);
      }
    });
  });

  describe('Hidden / OS-metadata files', () => {
    it('warns about .DS_Store files in the archive', async () => {
      const zipPath = makeTestZip({
        ...MINIMAL_STRUCTURE,
        '.DS_Store': Buffer.from('macos junk'),
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('.DS_Store'))).toBe(true);
    });

    it('warns about Thumbs.db files in the archive', async () => {
      const zipPath = makeTestZip({
        ...MINIMAL_STRUCTURE,
        'Thumbs.db': Buffer.from('windows junk'),
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('Thumbs.db'))).toBe(true);
    });

    it('warns about __MACOSX/ resource-fork directories', async () => {
      const zipPath = makeTestZip({
        ...MINIMAL_STRUCTURE,
        '__MACOSX/._project.json': Buffer.from('fork'),
      });
      const result = await validateZipFile(zipPath);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('__MACOSX'))).toBe(true);
    });
  });

  describe('Invalid ZIP file', () => {
    it('reports an error when the file is not a valid ZIP', async () => {
      const dir = tmpDir();
      const bogus = path.join(dir, 'not-a-zip.pathfinder');
      fs.writeFileSync(bogus, 'definitely not a zip');
      const result = await validateZipFile(bogus);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /zip|archive/i.test(e))).toBe(true);
    });

    it('reports an error when the file does not exist', async () => {
      const result = await validateZipFile('/nonexistent/path/to/file.pathfinder');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
