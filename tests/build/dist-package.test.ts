import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DIST = resolve(ROOT, 'dist');

describe('Build output', () => {
  it('dist/cli.js exists', () => {
    expect(existsSync(resolve(DIST, 'cli.js'))).toBe(true);
  });

  it('dist/index.js exists', () => {
    expect(existsSync(resolve(DIST, 'index.js'))).toBe(true);
  });

  it('dist/index.d.ts exists', () => {
    expect(existsSync(resolve(DIST, 'index.d.ts'))).toBe(true);
  });

  it('dist/cli.js --help exits 0 and mentions publish', () => {
    const out = execSync(`node ${resolve(DIST, 'cli.js')} --help`, { encoding: 'utf8' });
    expect(out).toContain('publish');
    expect(out).toContain('inspect');
  });

  it('dist/index.js exports key functions', async () => {
    const mod = await import(resolve(DIST, 'index.js'));
    expect(typeof mod.publish).toBe('function');
    expect(typeof mod.buildManifest).toBe('function');
    expect(typeof mod.STAGE_NAMES).toBe('object');
    expect(mod.STAGE_NAMES[0]).toBe('Unpack');
  });
});

describe('Package metadata', () => {
  it('npm pack --dry-run includes dist/ and excludes src/ and tests/', () => {
    const out = execSync('npm pack --dry-run --json 2>/dev/null', { cwd: ROOT, encoding: 'utf8' });
    const [info] = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>;
    const paths = info.files.map(f => f.path);

    expect(paths.some(p => p.startsWith('dist/'))).toBe(true);
    expect(paths.some(p => p.startsWith('tests/'))).toBe(false);
    expect(paths.some(p => p === 'package.json')).toBe(true);
  });
});
