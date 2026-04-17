/**
 * Stage 4 (LMS Adapter) — tests
 *
 * The LMS adapter stage validates standard-specific configuration
 * (xAPI requires LRS endpoint, SCORM requires valid mastery score),
 * surfaces standard-specific warnings (SCORM 1.2 4KB suspend limit),
 * and bakes the validated config into the published player shell so
 * the runtime can boot without external configuration.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { publish } from '../../src/publish/index.js';

function tmpDir(): string {
  return fs.mkdtempSync('pathfinder-lms-test-');
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

function readZipText(zipPath: string, entryName: string): string | null {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry(entryName);
  if (!entry) return null;
  return entry.getData().toString('utf-8');
}

function makeProject(opts: {
  id?: string;
  variables?: Record<string, { type: string; defaultValue: unknown; scope?: string }>;
} = {}): Record<string, string> {
  const variables: Record<string, { type: string; defaultValue: unknown; scope?: string }> = opts.variables ?? {
    Score: { type: 'number', defaultValue: 0, scope: 'course' },
  };
  return {
    'project.json': JSON.stringify({
      metadata: {
        id: opts.id ?? 'lms-test-001',
        title: 'LMS Adapter Test',
        author: 'Tester',
        language: 'en',
      },
      slides: [
        {
          id: 'slide-1',
          title: 'One',
          background: { type: 'solid', color: '#FFF' },
          objects: {
            t1: { type: 'text', rect: { x: 0, y: 0, w: 100, h: 50 }, content: 'Hi' },
          },
          zOrder: ['t1'],
          triggers: [],
        },
      ],
      variables,
      navigation: {
        entrySlide: 'slide-1',
        slides: ['slide-1'],
        showNavigationArrows: true,
        showProgressBar: false,
      },
    }),
    'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
  };
}

describe('Stage 4: LMS Adapter — xAPI validation', () => {
  it('errors when xAPI is selected without an LRS endpoint', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'xapi',
      quality: 'low',
      // no lrsEndpoint
    });
    expect(report.errors.some((e) => e.code === 'XAPI_MISSING_LRS_ENDPOINT')).toBe(true);
    expect(report.success).toBe(false);
  });

  it('errors when LRS endpoint is not a valid URL', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'xapi',
      quality: 'low',
      lrsEndpoint: 'not-a-url',
    });
    expect(report.errors.some((e) => e.code === 'XAPI_INVALID_LRS_ENDPOINT')).toBe(true);
  });

  it('warns when xAPI has an LRS endpoint but no auth header', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'xapi',
      quality: 'low',
      lrsEndpoint: 'https://lrs.example.com/xapi',
    });
    expect(report.warnings.some((w) => w.code === 'XAPI_MISSING_AUTH')).toBe(true);
    expect(report.success).toBe(true);
  });

  it('succeeds when xAPI has both endpoint and auth', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'xapi',
      quality: 'low',
      lrsEndpoint: 'https://lrs.example.com/xapi',
      lrsAuth: 'Basic dXNlcjpwYXNz',
    });
    expect(report.errors).toHaveLength(0);
    expect(report.warnings.find((w) => w.code === 'XAPI_MISSING_AUTH')).toBeUndefined();
    expect(report.success).toBe(true);
  });

  it('accepts http:// endpoints (but warns)', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'xapi',
      quality: 'low',
      lrsEndpoint: 'http://lrs.example.com/xapi',
      lrsAuth: 'Basic abc',
    });
    expect(report.errors.some((e) => e.code === 'XAPI_INVALID_LRS_ENDPOINT')).toBe(false);
    expect(report.warnings.some((w) => w.code === 'XAPI_INSECURE_LRS_ENDPOINT')).toBe(true);
  });

  it('does not require LRS endpoint for non-xAPI standards', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    expect(report.errors.some((e) => e.code === 'XAPI_MISSING_LRS_ENDPOINT')).toBe(false);
  });
});

describe('Stage 4: LMS Adapter — SCORM mastery score validation', () => {
  it('errors when masteryScore is below 0', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'scorm2004',
      quality: 'low',
      masteryScore: -10,
    });
    expect(report.errors.some((e) => e.code === 'SCORM_INVALID_MASTERY_SCORE')).toBe(true);
  });

  it('errors when masteryScore is above 100', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'scorm12',
      quality: 'low',
      masteryScore: 150,
    });
    expect(report.errors.some((e) => e.code === 'SCORM_INVALID_MASTERY_SCORE')).toBe(true);
  });

  it('errors when masteryScore is not a finite number', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'scorm12',
      quality: 'low',
      masteryScore: NaN,
    });
    expect(report.errors.some((e) => e.code === 'SCORM_INVALID_MASTERY_SCORE')).toBe(true);
  });

  it('accepts masteryScore = 0', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'scorm12',
      quality: 'low',
      masteryScore: 0,
    });
    expect(report.errors.some((e) => e.code === 'SCORM_INVALID_MASTERY_SCORE')).toBe(false);
  });

  it('accepts masteryScore = 100', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'scorm2004',
      quality: 'low',
      masteryScore: 100,
    });
    expect(report.errors.some((e) => e.code === 'SCORM_INVALID_MASTERY_SCORE')).toBe(false);
  });

  it('does not validate masteryScore for non-SCORM standards', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
      masteryScore: 9999,
    });
    expect(report.errors.some((e) => e.code === 'SCORM_INVALID_MASTERY_SCORE')).toBe(false);
  });
});

describe('Stage 4: LMS Adapter — SCORM 1.2 suspend-data warning', () => {
  it('warns when SCORM 1.2 course has many variables (4KB risk)', async () => {
    const manyVars: Record<string, { type: string; defaultValue: unknown; scope: string }> = {};
    // Each variable adds ~50+ bytes to the JSON state (key + type wrapper + value).
    // 80 variables comfortably exceed the 4KB SCORM 1.2 suspend_data limit.
    for (let i = 0; i < 80; i++) {
      manyVars[`Var_With_A_Long_Name_${i}`] = {
        type: 'text',
        defaultValue: 'a typical default value that takes up some space',
        scope: 'course',
      };
    }
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject({ variables: manyVars }));
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'scorm12',
      quality: 'low',
    });
    expect(report.warnings.some((w) => w.code === 'SCORM12_SUSPEND_DATA_RISK')).toBe(true);
  });

  it('does not warn for SCORM 2004 (64KB limit)', async () => {
    const manyVars: Record<string, { type: string; defaultValue: unknown; scope: string }> = {};
    for (let i = 0; i < 80; i++) {
      manyVars[`Var_With_A_Long_Name_${i}`] = {
        type: 'text',
        defaultValue: 'a typical default value that takes up some space',
        scope: 'course',
      };
    }
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject({ variables: manyVars }));
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'scorm2004',
      quality: 'low',
    });
    expect(report.warnings.some((w) => w.code === 'SCORM12_SUSPEND_DATA_RISK')).toBe(false);
  });

  it('does not warn for small SCORM 1.2 courses', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'scorm12',
      quality: 'low',
    });
    expect(report.warnings.some((w) => w.code === 'SCORM12_SUSPEND_DATA_RISK')).toBe(false);
  });
});

describe('Stage 4: LMS Adapter — config injection into player shell', () => {
  it('bakes lrsEndpoint into the player shell for xAPI', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const outPath = path.join(tmp, 'out.zip');
    const report = await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'xapi',
      quality: 'low',
      lrsEndpoint: 'https://lrs.example.com/xapi',
      lrsAuth: 'Basic abc123',
    });
    expect(report.success).toBe(true);
    const shell = readZipText(outPath, 'player/player-shell.html');
    expect(shell).not.toBeNull();
    expect(shell!).toContain('https://lrs.example.com/xapi');
  });

  it('bakes lrsAuth into the player shell for xAPI', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const outPath = path.join(tmp, 'out.zip');
    await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'xapi',
      quality: 'low',
      lrsEndpoint: 'https://lrs.example.com/xapi',
      lrsAuth: 'Basic abc123',
    });
    const shell = readZipText(outPath, 'player/player-shell.html');
    expect(shell!).toContain('Basic abc123');
  });

  it('bakes masteryScore into the player shell for SCORM', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const outPath = path.join(tmp, 'out.zip');
    await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'scorm2004',
      quality: 'low',
      masteryScore: 75,
    });
    const shell = readZipText(outPath, 'player/player-shell.html');
    expect(shell).not.toBeNull();
    expect(shell!).toMatch(/masteryScore[^,}]*75/);
  });

  it('escapes injected lrs values to prevent script injection', async () => {
    const tmp = tmpDir();
    const zipPath = makeTestZip(makeProject());
    const outPath = path.join(tmp, 'out.zip');
    await publish({
      inputPath: zipPath,
      outputPath: outPath,
      standard: 'xapi',
      quality: 'low',
      lrsEndpoint: 'https://lrs.example.com/xapi',
      lrsAuth: 'Basic abc</script><script>alert(1)</script>',
    });
    const shell = readZipText(outPath, 'player/player-shell.html');
    // The closing </script> tag must be escaped so it cannot break out of the
    // injected config script block.
    expect(shell!).not.toMatch(/Basic abc<\/script><script>alert\(1\)<\/script>/);
  });
});
