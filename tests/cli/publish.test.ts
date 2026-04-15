/**
 * CLI: publish subcommand
 *
 * Drives the publish pipeline through the CLI. The public contract is
 * `runCli(argv, io)` which returns an exit code and writes through the
 * supplied io object — no dependency on process.argv / process.exit.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore — adm-zip has no types published
import AdmZip from 'adm-zip';
import { runCli } from '../../src/cli.js';

// ---- Helpers ----

function tmpDir(): string {
  return fs.mkdtempSync('pathfinder-cli-test-');
}

interface Captured {
  out: string;
  err: string;
  exitCode: number;
}

async function run(argv: string[]): Promise<Captured> {
  let out = '';
  let err = '';
  const exitCode = await runCli(argv, {
    stdout: (s: string) => { out += s; },
    stderr: (s: string) => { err += s; },
  });
  return { out, err, exitCode };
}

const VALID_PROJECT = {
  'project.json': JSON.stringify({
    schemaVersion: '1.0.0',
    formatVersion: '1.0',
    metadata: {
      id: 'cli-course-001',
      title: 'CLI Test Course',
      author: 'Tester',
      language: 'en',
    },
    slides: [
      {
        id: 'slide-1',
        title: 'Hello',
        background: { type: 'solid', color: '#FFF' },
        objects: {
          t1: {
            type: 'text',
            rect: { x: 10, y: 10, w: 500, h: 100 },
            content: '<p>Hi</p>',
          },
        },
        zOrder: ['t1'],
        triggers: [],
      },
    ],
    variables: {},
    navigation: {
      entrySlide: 'slide-1',
      slides: ['slide-1'],
      showNavigationArrows: true,
    },
  }),
  'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
};

function makeValidZip(): string {
  const dir = tmpDir();
  const zipPath = path.join(dir, 'in.pathfinder');
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(VALID_PROJECT)) {
    zip.addFile(name, Buffer.from(content, 'utf-8'));
  }
  zip.writeZip(zipPath);
  return zipPath;
}

function makeInvalidZip(): string {
  const dir = tmpDir();
  const zipPath = path.join(dir, 'in.pathfinder');
  const zip = new AdmZip();
  zip.addFile('project.json', Buffer.from(JSON.stringify({
    metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
    slides: [{ title: 'No ID' }], // missing id → validation failure
    variables: {},
    navigation: { entrySlide: 's1', slides: [], showNavigationArrows: false },
  })));
  zip.addFile('manifest.json', Buffer.from('{"version":"1.0","assets":{}}'));
  zip.writeZip(zipPath);
  return zipPath;
}

// ---- Tests ----

describe('CLI: help / discoverability', () => {
  it('top-level --help lists the publish subcommand', async () => {
    const r = await run(['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.out.toLowerCase()).toContain('publish');
  });

  it('`publish --help` prints publish-specific usage', async () => {
    const r = await run(['publish', '--help']);
    expect(r.exitCode).toBe(0);
    expect(r.out).toMatch(/publish/i);
    expect(r.out).toMatch(/--standard|-s/);
    expect(r.out).toMatch(/--output|-o/);
  });
});

describe('CLI: publish success path', () => {
  it('publishes a valid .pathfinder to html5', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run(['publish', input, '-o', output, '--standard', 'html5']);
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
    expect(fs.statSync(output).size).toBeGreaterThan(0);
  });

  it('publishes to scorm2004 with mastery score', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run([
      'publish', input,
      '-o', output,
      '-s', 'scorm2004',
      '--mastery-score', '85',
    ]);
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
    const zip = new AdmZip(output);
    expect(zip.getEntry('imsmanifest.xml')).not.toBeNull();
  });

  it('publishes to scorm12', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run(['publish', input, '-o', output, '-s', 'scorm12']);
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
  });

  it('publishes to xapi', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run([
      'publish', input,
      '-o', output,
      '-s', 'xapi',
      '--lrs-endpoint', 'https://lrs.example.com',
      '--lrs-auth', 'Basic abc',
    ]);
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
  });

  it('accepts long-form --output and --standard', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run([
      'publish', input,
      '--output', output,
      '--standard', 'html5',
    ]);
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
  });

  it('respects --quality level', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run([
      'publish', input,
      '-o', output,
      '-s', 'html5',
      '--quality', 'low',
    ]);
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
  });

  it('prints a success summary with standard and slide count', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run(['publish', input, '-o', output, '-s', 'html5']);
    expect(r.exitCode).toBe(0);
    expect(r.out).toMatch(/html5/i);
    expect(r.out).toMatch(/slide/i);
    expect(r.out).toMatch(/1/);
  });

  it('prints the output path on success', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run(['publish', input, '-o', output, '-s', 'html5']);
    expect(r.out).toContain(output);
  });

  it('omits media line when course has no media', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run(['publish', input, '-o', output, '-s', 'html5']);
    expect(r.out).not.toMatch(/media:/);
  });

  it('prints media count + savings when course has compressible media', async () => {
    // A fixture with one optimizable SVG so Stage 5 has work to do.
    const dir = tmpDir();
    const inputPath = path.join(dir, 'in.pathfinder');
    const zip = new AdmZip();
    zip.addFile(
      'media/big.svg',
      Buffer.from(
        '<?xml version="1.0"?><!-- this comment will be stripped by the optimizer to save bytes -->' +
          '<svg xmlns="http://www.w3.org/2000/svg"   width="10"   height="10"><rect x="0" y="0"/></svg>',
        'utf-8'
      )
    );
    zip.addFile(
      'project.json',
      Buffer.from(JSON.stringify({
        metadata: { id: 'm', title: 'M', author: 'A', language: 'en' },
        slides: [{ id: 's', title: 'S', background: { type: 'solid', color: '#fff' }, objects: {}, zOrder: [], triggers: [] }],
        variables: {},
        navigation: { entrySlide: 's', slides: ['s'], showNavigationArrows: true },
      }))
    );
    zip.addFile(
      'manifest.json',
      Buffer.from(JSON.stringify({
        version: '1.0',
        assets: { big: { path: 'media/big.svg', size: 200, mimeType: 'image/svg+xml' } },
      }))
    );
    zip.writeZip(inputPath);

    const output = path.join(dir, 'out.zip');
    const r = await run(['publish', inputPath, '-o', output, '-s', 'html5']);
    expect(r.exitCode).toBe(0);
    expect(r.out).toMatch(/media:\s+1/);
    expect(r.out).toMatch(/optimized/);
    expect(r.out).toMatch(/saved/);
  });
});

describe('CLI: publish --validate-only', () => {
  it('succeeds but writes no output file', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run([
      'publish', input,
      '-o', output,
      '-s', 'html5',
      '--validate-only',
    ]);
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(output)).toBe(false);
  });

  it('prints a validation-only marker', async () => {
    const input = makeValidZip();
    const r = await run([
      'publish', input,
      '-o', path.join(tmpDir(), 'out.zip'),
      '-s', 'html5',
      '--validate-only',
    ]);
    expect(r.out.toLowerCase()).toMatch(/valid/);
  });
});

describe('CLI: publish usage errors (exit code 2)', () => {
  it('errors when input path is missing', async () => {
    const r = await run(['publish']);
    expect(r.exitCode).toBe(2);
    expect(r.err.length).toBeGreaterThan(0);
  });

  it('errors when --output is missing', async () => {
    const r = await run(['publish', 'some.pathfinder', '-s', 'html5']);
    expect(r.exitCode).toBe(2);
    expect(r.err).toMatch(/output|-o/i);
  });

  it('errors when --standard is missing', async () => {
    const r = await run(['publish', 'some.pathfinder', '-o', 'out.zip']);
    expect(r.exitCode).toBe(2);
    expect(r.err).toMatch(/standard|-s/i);
  });

  it('errors on unknown --standard value', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run(['publish', input, '-o', output, '-s', 'bogus']);
    expect(r.exitCode).toBe(2);
    expect(r.err).toMatch(/bogus|standard/i);
  });

  it('errors on unknown --quality value', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run([
      'publish', input,
      '-o', output,
      '-s', 'html5',
      '--quality', 'ultra',
    ]);
    expect(r.exitCode).toBe(2);
    expect(r.err).toMatch(/ultra|quality/i);
  });

  it('errors on non-numeric --mastery-score', async () => {
    const input = makeValidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run([
      'publish', input,
      '-o', output,
      '-s', 'scorm2004',
      '--mastery-score', 'eighty',
    ]);
    expect(r.exitCode).toBe(2);
    expect(r.err).toMatch(/mastery/i);
  });
});

describe('CLI: publish runtime errors (exit code 1)', () => {
  it('errors when input file does not exist', async () => {
    const r = await run([
      'publish',
      '/nonexistent/path/to/file.pathfinder',
      '-o', path.join(tmpDir(), 'out.zip'),
      '-s', 'html5',
    ]);
    expect(r.exitCode).toBe(1);
    expect(r.err.length).toBeGreaterThan(0);
  });

  it('fails with exit code 1 when project has validation errors', async () => {
    const input = makeInvalidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run(['publish', input, '-o', output, '-s', 'html5']);
    expect(r.exitCode).toBe(1);
    expect(fs.existsSync(output)).toBe(false);
    expect(r.err.length).toBeGreaterThan(0);
  });

  it('reports error codes to stderr when validation fails', async () => {
    const input = makeInvalidZip();
    const output = path.join(tmpDir(), 'out.zip');
    const r = await run(['publish', input, '-o', output, '-s', 'html5']);
    // Each error has a code like SLIDE_MISSING_ID — make sure one shows up.
    expect(r.err).toMatch(/[A-Z_]{4,}/);
  });
});

describe('CLI: preserves existing schema commands', () => {
  // Sanity: refactoring the CLI around runCli() must not break the
  // `validate --check-schemas` path the CI pipeline relies on.
  it('runs `validate --check-schemas` and exits 0', async () => {
    const r = await run(['validate', '--check-schemas']);
    expect(r.exitCode).toBe(0);
    expect(r.out).toMatch(/project|slide|trigger|variable/);
  });

  it('runs top-level --check-schemas (legacy form) and exits 0', async () => {
    const r = await run(['--check-schemas']);
    expect(r.exitCode).toBe(0);
  });
});
