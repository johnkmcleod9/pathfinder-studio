/**
 * Pipeline Stage 1 — Parse
 *
 * Strict .pathfinder → Project parser. This is the public-API wrapper a
 * consumer (CLI, editor, publish pipeline) uses to load a .pathfinder ZIP
 * and get back a validated Project object.
 *
 * Contract:
 *   - Require project.json at the root.
 *   - Require manifest.json at the root.
 *   - Require media/ directory when manifest declares any assets.
 *   - Every asset referenced in manifest.json must be present in the ZIP.
 *   - Reject incompatible schemaVersion / formatVersion.
 *
 * All failures throw a ParseError with a stable machine-readable code.
 * Non-fatal issues are collected in the returned `warnings` array.
 */
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { Manifest } from './manifest.js';
import {
  CURRENT_SCHEMA_VERSION,
  CURRENT_FORMAT_VERSION,
  compareVersions,
} from './migrate.js';

// ---- Types ----

export type ParseErrorCode =
  | 'INVALID_ZIP'
  | 'MISSING_FILE'
  | 'JSON_PARSE_ERROR'
  | 'MISSING_MEDIA'
  | 'VERSION_MISMATCH'
  | 'UNKNOWN';

export class ParseError extends Error {
  code: ParseErrorCode;
  constructor(code: ParseErrorCode, message: string) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

export interface ParsedProject {
  metadata: {
    id: string;
    title: string;
    author?: string;
    language?: string;
    createdAt?: string;
    modifiedAt?: string;
    [key: string]: unknown;
  };
  slides: unknown[];
  variables: Record<string, unknown>;
  navigation: {
    entrySlide: string;
    slides: string[];
    [key: string]: unknown;
  };
  schemaVersion: string;
  formatVersion: string;
  [key: string]: unknown;
}

export interface ParseResult {
  project: ParsedProject;
  manifest: Manifest;
  warnings: string[];
  schemaVersion: string;
  formatVersion: string;
}

// ---- Public API ----

export async function parseProjectFile(zipPath: string): Promise<ParseResult> {
  // ── Read file from disk ─────────────────────────────────────────────
  let buffer: Buffer;
  try {
    buffer = await readFile(zipPath);
  } catch (e) {
    const msg = (e as NodeJS.ErrnoException).code === 'ENOENT'
      ? `Input file not found: "${zipPath}"`
      : `Cannot read input file "${zipPath}"`;
    throw new ParseError('MISSING_FILE', msg);
  }

  // ── Open ZIP ────────────────────────────────────────────────────────
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ParseError('INVALID_ZIP', `File "${zipPath}" is not a valid ZIP archive`);
  }

  // ── Require project.json ────────────────────────────────────────────
  const projectEntry = zip.file('project.json');
  if (!projectEntry) {
    throw new ParseError(
      'MISSING_FILE',
      'Required file "project.json" is missing from the ZIP'
    );
  }

  // ── Require manifest.json ───────────────────────────────────────────
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new ParseError(
      'MISSING_FILE',
      'Required file "manifest.json" is missing from the ZIP'
    );
  }

  // ── Parse project.json (no raw content in error messages) ───────────
  const projectText = await projectEntry.async('string');
  let project: ParsedProject;
  try {
    project = JSON.parse(projectText) as ParsedProject;
  } catch {
    throw new ParseError(
      'JSON_PARSE_ERROR',
      'Invalid JSON syntax in project.json'
    );
  }

  // ── Parse manifest.json ─────────────────────────────────────────────
  const manifestText = await manifestEntry.async('string');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(manifestText) as Manifest;
  } catch {
    throw new ParseError(
      'JSON_PARSE_ERROR',
      'Invalid JSON syntax in manifest.json'
    );
  }

  const warnings: string[] = [];

  // ── media/ directory presence ───────────────────────────────────────
  const hasMediaDir = Object.keys(zip.files).some((p) => p.startsWith('media/'));
  const assets = manifest.assets ?? {};
  const hasAssets = Object.keys(assets).length > 0;

  if (hasAssets && !hasMediaDir) {
    throw new ParseError(
      'MISSING_FILE',
      'Required media/ directory is missing but manifest declares assets'
    );
  }
  if (!hasMediaDir) {
    warnings.push('No media/ directory in ZIP — project has no media assets.');
  }

  // ── Every manifest asset must have a file ───────────────────────────
  for (const [assetPath, entry] of Object.entries(assets)) {
    const zipPath = assetPath.startsWith('media/') ? assetPath : `media/${assetPath}`;
    if (!zip.file(zipPath)) {
      const name = entry.originalName ?? assetPath;
      throw new ParseError(
        'MISSING_MEDIA',
        `Media asset "${name}" referenced by manifest but file "${zipPath}" is absent from the ZIP`
      );
    }
  }

  // ── Version compatibility ──────────────────────────────────────────
  const schemaVersion = (project.schemaVersion as string) ?? 'unknown';
  const formatVersion = (project.formatVersion as string) ?? 'unknown';
  validateSchemaVersion(schemaVersion);
  validateFormatVersion(formatVersion);

  return {
    project,
    manifest,
    warnings,
    schemaVersion,
    formatVersion,
  };
}

/**
 * Classify an error (from parseProjectFile or elsewhere) into a stable
 * machine-readable code + user-facing message. Does NOT include the raw
 * error content in the message, to avoid leaking untrusted JSON or
 * filesystem strings back to the UI.
 */
export function classifyParseError(
  error: unknown
): { code: ParseErrorCode; message: string } {
  // Our own ParseError passes through with its declared code.
  if (error instanceof ParseError) {
    return { code: error.code, message: error.message };
  }

  const rawMsg = error instanceof Error ? error.message : String(error);

  // JSON syntax error (by type or by shape of Node's JSON parse errors).
  if (error instanceof SyntaxError || /unexpected token|invalid json/i.test(rawMsg)) {
    return {
      code: 'JSON_PARSE_ERROR',
      message: 'Invalid JSON syntax in project.json',
    };
  }

  // Filesystem "not found" (ENOENT, "no such file", etc.).
  if (/enoent|no such file|not found|file.*missing/i.test(rawMsg)) {
    const match = rawMsg.match(/"([^"]+\.json)"/);
    const filename = match ? match[1] : 'project.json';
    return {
      code: 'MISSING_FILE',
      message: `Required file "${filename}" is missing`,
    };
  }

  return { code: 'UNKNOWN', message: 'Unknown parse error' };
}

// ---- Internals ----

function validateSchemaVersion(schemaVersion: string): void {
  if (schemaVersion === 'unknown') {
    throw new ParseError(
      'VERSION_MISMATCH',
      'Project is missing schemaVersion; cannot verify compatibility'
    );
  }

  const [thisMajor, thisMinor] = schemaVersion.split('.').map((n) => Number(n) || 0);
  const [currMajor, currMinor] = CURRENT_SCHEMA_VERSION.split('.').map((n) => Number(n) || 0);

  // Different major = incompatible.
  if (thisMajor !== currMajor) {
    throw new ParseError(
      'VERSION_MISMATCH',
      `Project schemaVersion "${schemaVersion}" is incompatible with current schemaVersion "${CURRENT_SCHEMA_VERSION}"`
    );
  }
  // Same major, but a newer minor means the project uses fields we don't understand.
  if (thisMinor > currMinor) {
    throw new ParseError(
      'VERSION_MISMATCH',
      `Project schemaVersion "${schemaVersion}" is newer than supported "${CURRENT_SCHEMA_VERSION}"`
    );
  }
}

function validateFormatVersion(formatVersion: string): void {
  if (formatVersion === 'unknown') {
    throw new ParseError(
      'VERSION_MISMATCH',
      'Project is missing formatVersion; cannot verify compatibility'
    );
  }

  const [thisMajor] = formatVersion.split('.').map((n) => Number(n) || 0);
  const [currMajor] = CURRENT_FORMAT_VERSION.split('.').map((n) => Number(n) || 0);

  if (thisMajor !== currMajor) {
    throw new ParseError(
      'VERSION_MISMATCH',
      `Project formatVersion "${formatVersion}" is incompatible with current formatVersion "${CURRENT_FORMAT_VERSION}"`
    );
  }
  // Allow same-major / same-or-newer minor (patch-compatible).
  // Reject older minor to guard against structural regressions.
  if (compareVersions(formatVersion, CURRENT_FORMAT_VERSION) < 0) {
    throw new ParseError(
      'VERSION_MISMATCH',
      `Project formatVersion "${formatVersion}" is older than minimum supported "${CURRENT_FORMAT_VERSION}"`
    );
  }
}
