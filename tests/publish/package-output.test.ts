/**
 * Stage 6 (Package) + Stage 7 (Output) — tests
 *
 * Drives the end-to-end publish flow: given a valid .pathfinder ZIP
 * the pipeline should produce a real output ZIP with a compiled
 * course.json, record checksum/packageSize in the report, and
 * include standard-specific artifacts (imsmanifest.xml for SCORM,
 * index.html for html5, etc.).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { publish } from '../../src/publish/index.js';
import type { RuntimeCourse } from '../../src/publish/types.js';

function tmpDir(): string {
  return fs.mkdtempSync('pathfinder-pkg-test-');
}

function makeTestZip(entries: Record<string, string | Buffer>): string {
  const tmp = tmpDir();
  const zipPath = path.join(tmp, 'in.pathfinder');
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
  }
  zip.writeZip(zipPath);
  return zipPath;
}

function readZipJson<T = unknown>(zipPath: string, entryName: string): T | null {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry(entryName);
  if (!entry) return null;
  return JSON.parse(entry.getData().toString('utf-8')) as T;
}

function hasZipEntry(zipPath: string, entryName: string): boolean {
  const zip = new AdmZip(zipPath);
  return zip.getEntry(entryName) !== null;
}

const VALID_PROJECT = {
  'project.json': JSON.stringify({
    metadata: { id: 'pkg-001', title: 'Package Test', author: 'Tester', language: 'en' },
    slides: [
      {
        id: 'slide-1',
        title: 'One',
        background: { type: 'solid', color: '#FFF' },
        objects: {
          't1': {
            type: 'text',
            rect: { x: 10, y: 10, w: 500, h: 100 },
            content: '<p>Hi</p>',
          },
        },
        zOrder: ['t1'],
        triggers: [],
      },
    ],
    variables: {
      Score: { type: 'number', defaultValue: 0, scope: 'course' },
    },
    navigation: {
      entrySlide: 'slide-1',
      slides: ['slide-1'],
      showNavigationArrows: true,
      showProgressBar: false,
    },
  }),
  'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
};

describe('Stage 6: Package', () => {
  it('writes an output ZIP at the specified path', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    const report = await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
    });
    expect(report.success).toBe(true);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.statSync(outPath).size).toBeGreaterThan(0);
  });

  it('includes course.json in the output ZIP', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
    });
    expect(hasZipEntry(outPath, 'course.json')).toBe(true);
  });

  it('course.json has compiled slides, variables, and metadata', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
    });
    const course = readZipJson<RuntimeCourse>(outPath, 'course.json');
    expect(course).not.toBeNull();
    expect(course!.format).toBe('pathfinder-v1');
    expect(course!.metadata.id).toBe('pkg-001');
    expect(course!.slides).toHaveLength(1);
    expect(course!.slides[0].id).toBe('slide-1');
    expect(course!.variables['Score']).toBeDefined();
  });

  it('SCORM 2004 package includes imsmanifest.xml', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    const report = await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'scorm2004',
      quality: 'low',
      masteryScore: 80,
    });
    expect(report.success).toBe(true);
    expect(hasZipEntry(outPath, 'imsmanifest.xml')).toBe(true);
  });

  it('SCORM 1.2 package includes imsmanifest.xml', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    const report = await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'scorm12',
      quality: 'low',
    });
    expect(report.success).toBe(true);
    expect(hasZipEntry(outPath, 'imsmanifest.xml')).toBe(true);
  });

  it('html5 package includes index.html', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
    });
    expect(hasZipEntry(outPath, 'index.html')).toBe(true);
  });

  it('html5 package contains a real PathfinderRuntime IIFE (not the placeholder)', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
    });
    const zip = new AdmZip(outPath);
    const runtime = zip.getEntry('pathfinder-runtime.js')?.getData().toString('utf-8');
    expect(runtime).toBeDefined();
    expect(runtime).toContain('PathfinderRuntime');
    expect(runtime).toContain('navigateNext');
    expect(runtime).toContain('navigatePrev');
    expect(runtime).not.toContain('Placeholder');
  });

  it('does NOT write output when validation fails', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip({
      'project.json': JSON.stringify({
        metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
        slides: [{ title: 'No ID' }], // missing id
        variables: {},
        navigation: { entrySlide: 's1', slides: [], showNavigationArrows: false },
      }),
      'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
    });
    const outPath = path.join(tmp, 'out.zip');
    const report = await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
    });
    expect(report.success).toBe(false);
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it('skips output writing when validateOnly is true', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    const report = await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
      validateOnly: true,
    });
    expect(report.success).toBe(true);
    expect(fs.existsSync(outPath)).toBe(false);
  });
});

describe('Stage 7: Output report', () => {
  it('reports outputPath, packageSize, and checksum on success', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    const report = await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
    });
    expect(report.success).toBe(true);
    expect(report.outputPath).toBe(outPath);
    expect(report.packageSize).toBeGreaterThan(0);
    expect(report.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports slideCount matching compiled slides', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const outPath = path.join(tmp, 'out.zip');
    const report = await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'html5',
      quality: 'low',
    });
    expect(report.slideCount).toBe(1);
  });

  it('records a stage duration for every stage', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(VALID_PROJECT);
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    for (let stage = 0; stage <= 7; stage++) {
      expect(report.stageDurations[stage as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7]).toBeGreaterThanOrEqual(0);
    }
  });

  it('omits checksum and outputPath when validation fails', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip({
      'project.json': JSON.stringify({
        metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
        slides: [],
        variables: {},
        navigation: { entrySlide: 's1', slides: [], showNavigationArrows: false },
      }),
      'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
    });
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    expect(report.success).toBe(false);
    expect(report.checksum).toBeUndefined();
    expect(report.outputPath).toBeUndefined();
  });
});
