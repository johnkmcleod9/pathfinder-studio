/**
 * Validate Pipeline — validate ZIP structure and project.json content.
 */

import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = (AjvModule as any).default ?? AjvModule;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = (addFormatsModule as any).default ?? addFormatsModule;
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { SchemaValidateResult } from '../schemas/validate.js';

export interface ValidationIssue {
  path: string;
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
}

export interface ZipValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  warnings: string[];
}

/** Validate the structure of a .pathfinder ZIP (without parsing content). */
export function validateZipStructure(zipPaths: string[]): ZipValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];
  const pathSet = new Set(zipPaths);

  // Required files
  if (!pathSet.has('project.json')) {
    issues.push({ path: '/', message: 'project.json is required', keyword: 'required' });
  }

  // Well-known paths that shouldn't appear
  const forbidden = ['/etc/passwd', '..', '/tmp/', 'C:\\'];
  for (const p of zipPaths) {
    for (const f of forbidden) {
      if (p.includes(f)) {
        issues.push({ path: p, message: `Path traversal attempt detected: "${p}"`, keyword: 'security' });
      }
    }
  }

  // Check for manifest consistency
  if (pathSet.has('manifest.json')) {
    // Check media/ directory is referenced in manifest (advisory only)
    const mediaPaths = zipPaths.filter(p => p.startsWith('media/'));
    if (mediaPaths.length === 0 && pathSet.has('manifest.json')) {
      warnings.push('manifest.json exists but no media/ directory found');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

// ---- File-level ZIP structure validation ---------------------------------

export interface ZipFileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Recognised media extensions for files inside `media/`. */
const RECOGNIZED_EXTENSIONS: ReadonlySet<string> = new Set([
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  // Audio
  'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac',
  // Video
  'mp4', 'webm', 'mov', 'm4v', 'avi',
  // Docs
  'pdf', 'txt', 'md',
  // Data
  'json', 'xml', 'yaml', 'yml', 'vtt', 'srt',
  // Archive / binary payload
  'zip',
]);

/** Executables — rejected anywhere in the archive. */
const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'app', 'dmg', 'msi', 'deb', 'pkg', 'rpm',
  'sh', 'bat', 'cmd', 'ps1', 'vbs', 'scr',
  'jar', 'apk', 'ipa',
]);

/** OS-metadata files that should not ship but are safe to warn-and-strip. */
const HIDDEN_FILENAMES: ReadonlySet<string> = new Set([
  '.DS_Store', 'Thumbs.db', 'Desktop.ini',
]);

/**
 * Fast container-level validation of a .pathfinder ZIP. Runs before
 * parseProjectFile() when you want a cheap "is this shaped right at all?"
 * check — e.g. from a drag-and-drop UI.
 */
export async function validateZipFile(zipPath: string): Promise<ZipFileValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Read file ───────────────────────────────────────────────────────
  let buffer: Buffer;
  try {
    buffer = await readFile(zipPath);
  } catch (e) {
    const msg = (e as NodeJS.ErrnoException).code === 'ENOENT'
      ? `File not found: "${zipPath}"`
      : `Cannot read file "${zipPath}"`;
    errors.push(msg);
    return { valid: false, errors, warnings };
  }

  // ── Open ZIP ────────────────────────────────────────────────────────
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    errors.push(`"${zipPath}" is not a valid ZIP archive`);
    return { valid: false, errors, warnings };
  }

  const paths = Object.keys(zip.files);

  // ── Required root entries ───────────────────────────────────────────
  if (!zip.file('project.json')) {
    errors.push('Required file "project.json" is missing from the ZIP root');
  }
  if (!zip.file('manifest.json')) {
    errors.push('Required file "manifest.json" is missing from the ZIP root');
  }

  // ── media/ directory (any entry prefixed with "media/") ────────────
  const hasMediaDir = paths.some((p) => p.startsWith('media/'));
  if (!hasMediaDir) {
    errors.push('Required "media/" directory is missing from the ZIP');
  }

  // ── Walk every file for security + extension checks ────────────────
  for (const p of paths) {
    if (zip.files[p].dir) continue;

    // macOS resource-fork directories — warn and skip.
    if (p.startsWith('__MACOSX/') || p.includes('/__MACOSX/')) {
      warnings.push(`macOS resource-fork entry "${p}" — safe to strip`);
      continue;
    }

    const basename = p.split('/').pop() ?? p;

    // Hidden OS-metadata files — warn and skip.
    if (HIDDEN_FILENAMES.has(basename)) {
      warnings.push(`Hidden OS-metadata file "${p}" — safe to strip (e.g. .DS_Store, Thumbs.db)`);
      continue;
    }

    // Extension inspection (.foo.bar → "bar")
    const dotIdx = basename.lastIndexOf('.');
    const ext = dotIdx > 0 ? basename.slice(dotIdx + 1).toLowerCase() : '';

    if (ext && EXECUTABLE_EXTENSIONS.has(ext)) {
      errors.push(`Executable file "${p}" rejected for security (.${ext} is not permitted)`);
      continue;
    }

    // Only warn for unrecognized extensions inside media/ — we allow
    // arbitrary files outside media/ (e.g. project.json, manifest.json,
    // quiz-banks.json, fonts/, backup/, etc.).
    if (p.startsWith('media/') && ext && !RECOGNIZED_EXTENSIONS.has(ext)) {
      warnings.push(`Unrecognized media extension in "${p}" — ".${ext}" is not in the allow-list`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate project.json against the Pathfinder JSON schema.
 */
export function validateProjectSchema(project: unknown, schema: object): SchemaValidateResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const valid = validate(project);
  const errors: ValidationIssue[] = (validate.errors ?? []).map((err: { instancePath?: string; message?: string; keyword: string; params?: unknown }) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'unknown error',
    keyword: err.keyword,
    params: err.params as Record<string, unknown>,
  }));

  return { valid, errors, warnings: [] };
}
