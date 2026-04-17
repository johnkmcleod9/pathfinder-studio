import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import {
  publish,
  buildManifest,
  mimeFromPath,
  optimizeMedia,
} from '../../src/publish/index.js';
import type { OutputStandard } from '../../src/publish/types.js';

// ---- Test helpers ----

function makeTestZip(entries: Record<string, string | Buffer>): string {
  const tmpDir = fs.mkdtempSync('pathfinder-test-');
  const zipPath = path.join(tmpDir, 'test.zip');
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
  }
  zip.writeZip(zipPath);
  return zipPath;
}

function tmpDir(): string {
  return fs.mkdtempSync('pathfinder-publish-test-');
}

// ---- Fixture project ----

const VALID_PROJECT = {
  'project.json': JSON.stringify({
    metadata: {
      id: 'test-course-001',
      title: 'Test Course',
      author: 'Devon',
      language: 'en',
    },
    slides: [
      {
        id: 'slide-1',
        title: 'Slide 1',
        background: { type: 'solid', color: '#FFFFFF' },
        objects: {
          'text-1': {
            type: 'text',
            rect: { x: 0, y: 0, w: 1280, h: 720 },
            content: '<p>Hello World</p>',
            style: { fontSize: 24, color: '#000000' },
          },
        },
        zOrder: ['text-1'],
        triggers: [],
      },
      {
        id: 'slide-2',
        title: 'Slide 2',
        background: { type: 'solid', color: '#F0F0F0' },
        objects: {
          'btn-1': {
            type: 'button',
            rect: { x: 540, y: 300, w: 200, h: 60 },
            label: 'Next',
            style: { backgroundColor: '#1A73E8', color: '#FFFFFF' },
            triggers: [
              {
                id: 'trigger-1',
                event: { type: 'userClick' },
                action: { type: 'jumpToSlide', target: 'slide-1' },
              },
            ],
          },
        },
        zOrder: ['btn-1'],
        triggers: [],
      },
    ],
    variables: {
      CourseStarted: { type: 'trueFalse', defaultValue: false },
      Score: { type: 'number', defaultValue: 0 },
    },
    navigation: {
      entrySlide: 'slide-1',
      slides: ['slide-1', 'slide-2'],
      showNavigationArrows: true,
      showProgressBar: true,
    },
  }),
  'manifest.json': JSON.stringify({
    version: '1.0',
    assets: {},
  }),
};

// ---- Tests ----

describe('Publish Pipeline', () => {

  describe('Stage 0: Unpack', () => {
    it('rejects empty ZIP', async () => {
      const tmp = tmpDir();
      const badZip = path.join(tmp, 'empty.zip');
      fs.writeFileSync(badZip, Buffer.from('PK\x03\x04', 'binary')); // ZIP magic
      const report = await publish({
        inputPath: badZip,
        outputPath: path.join(tmp, 'out.zip'),
        standard: 'html5',
        quality: 'low',
      });
      expect(report.errors.some(e => e.code === 'INVALID_ZIP' || e.code === 'EXTRACT_FAILED')).toBe(true);
    });

    it('accepts valid .pathfinder ZIP', async () => {
      const tmp = tmpDir();
      const zipPath = makeTestZip(VALID_PROJECT);
      const report = await publish({
        inputPath: zipPath,
        outputPath: path.join(tmp, 'out.zip'),
        standard: 'html5',
        quality: 'low',
      });
      expect(report.success).toBe(true);
      expect(report.errors).toHaveLength(0);
    });
  });

  describe('Stage 1: Validate', () => {
    it('errors on missing slides', async () => {
      const tmp = tmpDir();
      const project = {
        'project.json': JSON.stringify({
          metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
          slides: [],
          variables: {},
          navigation: { entrySlide: 's1', slides: [], showNavigationArrows: false },
        }),
        'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
      };
      const zipPath = makeTestZip(project);
      const report = await publish({
        inputPath: zipPath,
        outputPath: path.join(tmp, 'out.zip'),
        standard: 'html5',
        quality: 'low',
      });
      expect(report.success).toBe(false);
    });

    it('errors on slide with no id', async () => {
      const tmp = tmpDir();
      const project = {
        'project.json': JSON.stringify({
          metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
          slides: [{ title: 'Bad' }],
          variables: {},
          navigation: { entrySlide: 's1', slides: [], showNavigationArrows: false },
        }),
        'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
      };
      const zipPath = makeTestZip(project);
      const report = await publish({
        inputPath: zipPath,
        outputPath: path.join(tmp, 'out.zip'),
        standard: 'html5',
        quality: 'low',
      });
      expect(report.errors.some(e => e.code === 'SLIDE_MISSING_ID')).toBe(true);
    });

    it('errors on invalid entry slide', async () => {
      const tmp = tmpDir();
      const project = {
        'project.json': JSON.stringify({
          metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
          slides: [{ id: 'slide-1', title: 'S1', objects: {}, triggers: [] }],
          variables: {},
          navigation: {
            entrySlide: 'nonexistent',
            slides: ['slide-1'],
            showNavigationArrows: false,
          },
        }),
        'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
      };
      const zipPath = makeTestZip(project);
      const report = await publish({
        inputPath: zipPath,
        outputPath: path.join(tmp, 'out.zip'),
        standard: 'html5',
        quality: 'low',
      });
      expect(report.errors.some(e => e.code === 'INVALID_ENTRY_SLIDE')).toBe(true);
    });
  });

  describe('Stage 4: LMS Adapter', () => {
    it('warns when publishing with validation errors', async () => {
      const tmp = tmpDir();
      const zipPath = makeTestZip({
        'project.json': JSON.stringify({
          metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
          slides: [{ title: 'No ID' }],
          variables: {},
          navigation: { entrySlide: 's1', slides: [], showNavigationArrows: false },
        }),
        'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
      });
      const report = await publish({
        inputPath: zipPath,
        outputPath: path.join(tmp, 'out.zip'),
        standard: 'scorm2004',
        quality: 'low',
      });
      expect(report.warnings.some(w => w.code === 'PUBLISHING_WITH_ERRORS')).toBe(true);
    });
  });

  describe('Stage 7: Output', () => {
    it('reports duration for each stage', async () => {
      const tmp = tmpDir();
      const zipPath = makeTestZip(VALID_PROJECT);
      const report = await publish({
        inputPath: zipPath,
        outputPath: path.join(tmp, 'out.zip'),
        standard: 'html5',
        quality: 'low',
      });
      expect(report.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('All standards', () => {
    const standards: OutputStandard[] = ['scorm12', 'scorm2004', 'xapi', 'html5'];
    for (const std of standards) {
      it(`runs successfully with standard=${std}`, async () => {
        const tmp = tmpDir();
        const zipPath = makeTestZip(VALID_PROJECT);
        const outPath = path.join(tmp, `out-${std}.zip`);
        const report = await publish({
          inputPath: zipPath,
          outputPath: outPath,
          standard: std,
          quality: 'low',
          // xAPI requires an LRS endpoint + auth; supply both so this
          // smoke test only fails on actual pipeline regressions.
          ...(std === 'xapi'
            ? { lrsEndpoint: 'https://lrs.example.com/xapi', lrsAuth: 'Basic abc' }
            : {}),
        });
        expect(report.success).toBe(true);
        expect(report.standard).toBe(std);
        expect(report.stageDurations).toBeDefined();
      });
    }
  });
});

describe('SCORM Manifest Builder', () => {
  it('builds valid manifest for SCORM 2004', () => {
    const manifest = buildManifest(
      'course-001',
      'My Course',
      'scorm2004',
      ['slide-1', 'slide-2'],
      ['course.json', 'pathfinder-runtime.js'],
      80
    );
    expect(manifest.identifier).toBe('MANIFEST_course-001');
    expect(manifest.organizations).toHaveLength(1);
    expect(manifest.organizations[0].items).toHaveLength(2);
    expect(manifest.resources.length).toBeGreaterThan(2); // slides + metadata
  });

  it('builds valid manifest for SCORM 1.2', () => {
    const manifest = buildManifest(
      'course-002',
      'SCORM 12 Course',
      'scorm12',
      ['slide-1'],
      ['course.json']
    );
    expect(manifest.identifier).toBe('MANIFEST_course-002');
    expect(manifest.organizations[0].items[0].resource).toContain('res_');
  });

  it('sanitizes identifiers', () => {
    const manifest = buildManifest(
      'Course With Spaces & Symbols!',
      'Title',
      'html5',
      ['slide-1', 'slide-2'],
      []
    );
    expect(manifest.identifier).toBe('MANIFEST_Course_With_Spaces___Symbols_');
    expect(manifest.organizations[0].items[0].identifier).toBe('item_slide-1');
  });

  it('sets mastery score in SCORM 2004 parameters', () => {
    const manifest = buildManifest(
      'test',
      'T',
      'scorm2004',
      ['s1'],
      [],
      85
    );
    const item = manifest.organizations[0].items[0];
    expect(item.parameters).toContain('mastery_score=85');
  });
});

describe('Media optimizer', () => {
  it('detects MIME type from file path', () => {
    expect(mimeFromPath('/path/to/image.png')).toBe('image/png');
    expect(mimeFromPath('/path/to/video.mp4')).toBe('video/mp4');
    expect(mimeFromPath('/path/to/audio.mp3')).toBe('audio/mpeg');
    expect(mimeFromPath('/path/to/file.svg')).toBe('image/svg+xml');
    expect(mimeFromPath('/path/to/file.unknown')).toBe('application/octet-stream');
  });

  it('returns no-op result for unknown files', async () => {
    const tmp = tmpDir();
    const unknownFile = path.join(tmp, 'file.unknown');
    fs.writeFileSync(unknownFile, Buffer.from('content'));
    const result = await optimizeMedia(unknownFile, 'medium');
    expect(result.optimized).toBe(false);
  });
});
