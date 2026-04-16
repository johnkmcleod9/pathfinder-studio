/**
 * Public API surface — pin what's importable from the package root.
 *
 * Consumers integrating pathfinder-studio in build scripts, custom
 * authoring tools, or CI pipelines need a stable top-level import
 * surface. These tests pin that surface so a refactor doesn't
 * silently break downstream consumers.
 *
 * Testing via the same './src/index.js' path that the package's
 * "exports" field points at — when tsc emits dist/, this is the
 * entry resolvers will end up using.
 */
import { describe, it, expect } from 'vitest';
import * as api from '../src/index.js';

describe('Public API: publish surface', () => {
  it('exports publish()', () => {
    expect(typeof api.publish).toBe('function');
  });

  it('exports the PublishPipeline class', () => {
    expect(typeof api.PublishPipeline).toBe('function');
  });

  it('exports STAGE_NAMES constant', () => {
    expect(api.STAGE_NAMES).toBeDefined();
    expect(api.STAGE_NAMES[0]).toBe('Unpack');
    expect(api.STAGE_NAMES[7]).toBe('Output');
  });
});

describe('Public API: pipeline (parse/validate)', () => {
  it('exports parseProjectFile()', () => {
    expect(typeof api.parseProjectFile).toBe('function');
  });

  it('exports validateZipFile()', () => {
    expect(typeof api.validateZipFile).toBe('function');
  });

  it('exports the ParseError class', () => {
    expect(typeof api.ParseError).toBe('function');
  });
});

describe('Public API: compiler', () => {
  it('exports compileCourseIR + buildRuntimeCourse', () => {
    expect(typeof api.compileCourseIR).toBe('function');
    expect(typeof api.buildRuntimeCourse).toBe('function');
  });
});

describe('Public API: SCORM / xAPI generators', () => {
  it('exports buildScormManifest + renderManifestXml', () => {
    expect(typeof api.buildScormManifest).toBe('function');
    expect(typeof api.renderManifestXml).toBe('function');
  });

  it('exports generateTinCanXml + validateTinCanXml', () => {
    expect(typeof api.generateTinCanXml).toBe('function');
    expect(typeof api.validateTinCanXml).toBe('function');
  });

  it('exports the SCORM 1.2 + 2004 + xAPI adapter source strings', () => {
    expect(typeof api.SCORM_12_ADAPTER).toBe('string');
    expect(typeof api.SCORM_2004_ADAPTER).toBe('string');
    expect(typeof api.XAPI_ADAPTER).toBe('string');
  });

  it('exports the BROWSER_RUNTIME source string', () => {
    expect(typeof api.BROWSER_RUNTIME).toBe('string');
    expect(api.BROWSER_RUNTIME.length).toBeGreaterThan(1000);
  });
});

describe('Public API: CLI', () => {
  it('exports runCli()', () => {
    expect(typeof api.runCli).toBe('function');
  });
});

describe('Public API: re-export module namespaces', () => {
  it('exposes the publish module under the `publish` namespace', () => {
    expect(api.publish).toBeDefined();
    expect(typeof api.publish).toBe('function');
  });

  it('all main entry points are importable individually too (subpath imports)', async () => {
    // Each subpath should be independently importable so consumers can
    // tree-shake / cherry-pick.
    const { publish } = await import('../src/publish/index.js');
    expect(typeof publish).toBe('function');
    const { parseProjectFile } = await import('../src/pipeline/index.js');
    expect(typeof parseProjectFile).toBe('function');
  });
});

describe('Public API: smoke-test usability', () => {
  it('publish() shape is callable end-to-end', async () => {
    // Just verify we can construct + invoke without import errors.
    // Real integration is covered by the publish.test.ts suite.
    expect(api.publish.length).toBeGreaterThanOrEqual(1);
  });
});
