/**
 * Load Pipeline — parse a .pathfinder ZIP and reconstruct full project state.
 *
 * Validates:
 * - ZIP structure (required files present)
 * - project.json is valid JSON and matches the JSON schema
 * - manifest.json is valid
 * - All media files exist and match their content hashes
 */

import JSZip from 'jszip';
import { readFile } from 'fs/promises';
import type { Manifest } from './manifest.js';

export interface LoadResult {
  project: unknown;
  manifest: Manifest;
  mediaFiles: Record<string, Buffer>;  // relative path → content
  quizBanks: unknown;
  warnings: string[];
  formatVersion: string;
  schemaVersion: string;
}

export interface LoadOptions {
  /** Skip media files (load metadata only) */
  mediaOnly?: boolean;
  /** Skip schema validation */
  skipValidation?: boolean;
  /** If true, hash mismatch warnings instead of errors */
  tolerateHashMismatch?: boolean;
}

// Per-issue record collected during load. Distinct from the
// LoadValidationError class below (which is the thrown wrapper).
export interface LoadIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/** Known required files in a .pathfinder ZIP */
const REQUIRED_FILES = ['project.json'];

/**
 * Load a .pathfinder ZIP from a Buffer.
 */
export async function loadProject(
  buffer: Buffer,
  options: LoadOptions = {}
): Promise<LoadResult> {
  const warnings: string[] = [];
  const errors: LoadIssue[] = [];

  // ── Parse ZIP ────────────────────────────────────────────────────────────
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  } catch (e) {
    throw new InvalidZipError(`Failed to parse ZIP: ${e}`);
  }

  // ── Check required files ────────────────────────────────────────────────
  for (const required of REQUIRED_FILES) {
    if (!zip.file(required)) {
      errors.push({ path: required, message: `Required file "${required}" is missing`, severity: 'error' });
    }
  }

  // ── Load project.json ─────────────────────────────────────────────────
  let project: unknown;
  if (zip.file('project.json')) {
    const projectText = await zip.file('project.json')!.async('string');
    try {
      project = JSON.parse(projectText);
    } catch (e) {
      errors.push({ path: 'project.json', message: `Invalid JSON: ${e}`, severity: 'error' });
      project = {};
    }
  } else {
    errors.push({ path: 'project.json', message: 'project.json not found', severity: 'error' });
    project = {};
  }

  // ── Load manifest.json ────────────────────────────────────────────────
  let manifest: Manifest | null = null;
  if (zip.file('manifest.json')) {
    try {
      const manifestText = await zip.file('manifest.json')!.async('string');
      manifest = JSON.parse(manifestText) as Manifest;
    } catch (e) {
      warnings.push(`manifest.json is invalid JSON: ${e}`);
    }
  } else {
    warnings.push('manifest.json not found — media integrity cannot be verified');
  }

  // ── Verify media files against manifest ───────────────────────────────
  const mediaFiles: Record<string, Buffer> = {};

  if (!options.mediaOnly && manifest) {
    for (const [path, entry] of Object.entries(manifest.assets)) {
      const zipPath = path.startsWith('media/') ? path : `media/${path}`;
      const zipEntry = zip.file(zipPath);

      if (!zipEntry) {
        errors.push({ path: zipPath, message: `Asset listed in manifest but not found in ZIP`, severity: 'error' });
        continue;
      }

      if (zipEntry.dir) {
        errors.push({ path: zipPath, message: `Asset is a directory, not a file`, severity: 'error' });
        continue;
      }

      // Load media content
      const buffer = await zipEntry.async('nodebuffer');

      if (!options.tolerateHashMismatch) {
        const { createHash } = await import('crypto');
        const hash = createHash('sha256').update(buffer).digest('hex');
        if (hash !== entry.hash) {
          errors.push({
            path: zipPath,
            message: `Content hash mismatch for "${path}" — expected ${entry.hash}, got ${hash}`,
            severity: 'error',
          });
        }
      }

      mediaFiles[path] = buffer;
    }
  }

  // ── Extract quiz banks ─────────────────────────────────────────────────
  let quizBanks: unknown = null;
  if (zip.file('quiz-banks.json')) {
    try {
      const qbText = await zip.file('quiz-banks.json')!.async('string');
      quizBanks = JSON.parse(qbText);
    } catch (e) {
      warnings.push(`quiz-banks.json is invalid JSON: ${e}`);
    }
  }

  // ── Extract versions ───────────────────────────────────────────────────
  const projectObj = project as Record<string, unknown>;
  const schemaVersion = (projectObj.schemaVersion as string) ?? 'unknown';
  const formatVersion = (projectObj.formatVersion as string) ?? 'unknown';

  // ── Report errors ────────────────────────────────────────────────────
  if (errors.length > 0) {
    const errorMsgs = errors.map(e => `[${e.severity.toUpperCase()}] ${e.path}: ${e.message}`).join('\n');
    throw new LoadValidationError(`Load failed:\n${errorMsgs}`, errors);
  }

  return {
    project,
    manifest: manifest ?? {
      version: '0.0', projectId: '', createdAt: '', modifiedAt: '', assets: {}
    },
    mediaFiles,
    quizBanks,
    warnings,
    formatVersion,
    schemaVersion,
  };
}

/**
 * Load a .pathfinder ZIP from a file path.
 */
export async function loadProjectFromFile(
  filePath: string,
  options: LoadOptions = {}
): Promise<LoadResult> {
  const buffer = await readFile(filePath);
  return loadProject(buffer, options);
}

export class InvalidZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidZipError';
  }
}

export class LoadValidationError extends Error {
  errors: LoadIssue[];
  constructor(message: string, errors: LoadIssue[]) {
    super(message);
    this.name = 'LoadValidationError';
    this.errors = errors;
  }
}
