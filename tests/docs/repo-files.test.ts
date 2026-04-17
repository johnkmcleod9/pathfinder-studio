import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

describe('Repository documentation', () => {
  it('README.md exists', () => {
    expect(existsSync(resolve(ROOT, 'README.md'))).toBe(true);
  });

  it('README contains required sections', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain('# Pathfinder Studio');
    expect(readme).toMatch(/## Install/i);
    expect(readme).toMatch(/## Quick Start/i);
    expect(readme).toMatch(/## CLI/i);
    expect(readme).toMatch(/## API/i);
  });

  it('LICENSE exists and is MIT', () => {
    const license = readFileSync(resolve(ROOT, 'LICENSE'), 'utf8');
    expect(license).toContain('MIT License');
  });

  it('CONTRIBUTING.md exists and mentions TDD', () => {
    const contributing = readFileSync(resolve(ROOT, 'CONTRIBUTING.md'), 'utf8');
    expect(contributing).toMatch(/red.*green|TDD/i);
  });
});
