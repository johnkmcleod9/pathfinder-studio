/**
 * CLI: inspect subcommand
 *
 * Lets a course author dump a tree view of a .pathfinder file without
 * having to publish + open it in a browser. Shows: course metadata,
 * slide list, variable list, quiz summary, validation issues.
 *
 * Two output modes:
 *   - default       human-readable tree
 *   - --json        machine-readable JSON (for piping to jq, IDE plugins,
 *                   automated tooling)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore — adm-zip has no types published
import AdmZip from 'adm-zip';
import { runCli } from '../../src/cli.js';

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

const RICH_PROJECT = {
  'project.json': JSON.stringify({
    schemaVersion: '1.0.0',
    formatVersion: '1.0',
    metadata: {
      id: 'inspect-001',
      title: 'Inspectable Course',
      author: 'Devon',
      language: 'en',
    },
    slides: [
      {
        id: 'intro',
        title: 'Welcome',
        background: { type: 'solid', color: '#FFF' },
        objects: {
          headline: { type: 'text', rect: { x: 0, y: 0, w: 800, h: 100 }, content: 'Hi' },
          startBtn: {
            type: 'button',
            rect: { x: 0, y: 200, w: 100, h: 30 },
            content: 'Start',
            triggers: [{
              id: 't1', event: { type: 'userClick' },
              action: { type: 'jumpToSlide', target: 'lesson' },
            }],
          },
        },
        zOrder: ['headline', 'startBtn'],
        triggers: [],
      },
      {
        id: 'lesson',
        title: 'Lesson',
        background: { type: 'solid', color: '#FFF' },
        objects: {},
        zOrder: [],
        triggers: [],
      },
      {
        id: 'final',
        title: 'Quiz',
        background: { type: 'solid', color: '#FFF' },
        objects: {},
        zOrder: [],
        triggers: [],
      },
    ],
    variables: {
      Score: { type: 'number', defaultValue: 0, scope: 'course' },
      Name: { type: 'text', defaultValue: '', scope: 'course' },
    },
    quiz: {
      id: 'q1',
      passingScore: 70,
      attemptsAllowed: 3,
      questions: [
        { id: 'q1a', type: 'multiple_choice', text: 'Pick A', points: 5,
          options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }] },
        { id: 'q1b', type: 'true_false', text: 'Sky is blue', points: 5,
          options: [{ id: 't', text: 'true', isCorrect: true }, { id: 'f', text: 'false', isCorrect: false }] },
      ],
    },
    navigation: {
      entrySlide: 'intro',
      slides: ['intro', 'lesson', 'final'],
      showNavigationArrows: true,
    },
  }),
  'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
};

function makeZip(entries: Record<string, string | Buffer>): string {
  const dir = tmpDir();
  const zipPath = path.join(dir, 'in.pathfinder');
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
  }
  zip.writeZip(zipPath);
  return zipPath;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('CLI inspect: discoverability', () => {
  it('top-level --help mentions inspect', async () => {
    const r = await run(['--help']);
    expect(r.out.toLowerCase()).toContain('inspect');
  });

  it('inspect --help prints inspect-specific usage', async () => {
    const r = await run(['inspect', '--help']);
    expect(r.exitCode).toBe(0);
    expect(r.out).toMatch(/inspect/i);
    expect(r.out).toMatch(/--json/);
  });
});

describe('CLI inspect: usage errors', () => {
  it('exits 2 when input path is missing', async () => {
    const r = await run(['inspect']);
    expect(r.exitCode).toBe(2);
    expect(r.err.length).toBeGreaterThan(0);
  });

  it('exits 1 when input file does not exist', async () => {
    const r = await run(['inspect', '/does/not/exist.pathfinder']);
    expect(r.exitCode).toBe(1);
    expect(r.err.toLowerCase()).toMatch(/not found|no such|does not exist/);
  });
});

describe('CLI inspect: human-readable output', () => {
  it('prints the course title and id', async () => {
    const input = makeZip(RICH_PROJECT);
    const r = await run(['inspect', input]);
    expect(r.exitCode).toBe(0);
    expect(r.out).toContain('Inspectable Course');
    expect(r.out).toContain('inspect-001');
  });

  it('lists every slide id + title', async () => {
    const input = makeZip(RICH_PROJECT);
    const r = await run(['inspect', input]);
    expect(r.out).toContain('intro');
    expect(r.out).toContain('lesson');
    expect(r.out).toContain('final');
    expect(r.out).toContain('Welcome');
  });

  it('reports the slide count', async () => {
    const input = makeZip(RICH_PROJECT);
    const r = await run(['inspect', input]);
    expect(r.out).toMatch(/3 slide/);
  });

  it('lists variables with their types and default values', async () => {
    const input = makeZip(RICH_PROJECT);
    const r = await run(['inspect', input]);
    expect(r.out).toContain('Score');
    expect(r.out).toContain('number');
    expect(r.out).toContain('Name');
    expect(r.out).toContain('text');
  });

  it('shows the quiz summary with question count and passing score', async () => {
    const input = makeZip(RICH_PROJECT);
    const r = await run(['inspect', input]);
    expect(r.out).toMatch(/2 question/);
    expect(r.out).toContain('70'); // passing score
  });

  it('flags slides that are missing or have validation issues', async () => {
    const input = makeZip({
      'project.json': JSON.stringify({
        metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
        slides: [{ title: 'No ID' }], // missing id
        variables: {},
        navigation: { entrySlide: 'nope', slides: [], showNavigationArrows: false },
      }),
      'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
    });
    const r = await run(['inspect', input]);
    expect(r.out.toLowerCase()).toMatch(/issue|error|warning/);
  });
});

describe('CLI inspect: JSON mode', () => {
  it('--json emits valid JSON', async () => {
    const input = makeZip(RICH_PROJECT);
    const r = await run(['inspect', input, '--json']);
    expect(r.exitCode).toBe(0);
    expect(() => JSON.parse(r.out)).not.toThrow();
  });

  it('JSON output contains metadata + slides[] + variables{} + quiz', async () => {
    const input = makeZip(RICH_PROJECT);
    const r = await run(['inspect', input, '--json']);
    const parsed = JSON.parse(r.out) as {
      metadata: { id: string };
      slides: Array<{ id: string }>;
      variables: Record<string, unknown>;
      quiz: { questions: unknown[] };
    };
    expect(parsed.metadata.id).toBe('inspect-001');
    expect(parsed.slides.map((s) => s.id)).toEqual(['intro', 'lesson', 'final']);
    expect(Object.keys(parsed.variables)).toContain('Score');
    expect(parsed.quiz.questions).toHaveLength(2);
  });

  it('JSON output includes any validation issues array', async () => {
    const input = makeZip({
      'project.json': JSON.stringify({
        metadata: { id: 't', title: 'T', author: 'A', language: 'en' },
        slides: [{ title: 'No ID' }],
        variables: {},
        navigation: { entrySlide: 'nope', slides: [], showNavigationArrows: false },
      }),
      'manifest.json': JSON.stringify({ version: '1.0', assets: {} }),
    });
    const r = await run(['inspect', input, '--json']);
    const parsed = JSON.parse(r.out) as { issues: unknown[] };
    expect(Array.isArray(parsed.issues)).toBe(true);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it('JSON mode does not also print human-readable text', async () => {
    const input = makeZip(RICH_PROJECT);
    const r = await run(['inspect', input, '--json']);
    expect(r.out).not.toContain('Slides:');
    expect(r.out).not.toContain('Variables:');
  });
});
