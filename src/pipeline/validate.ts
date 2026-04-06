/**
 * Validate Pipeline — validate ZIP structure and project.json content.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
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

/**
 * Validate project.json against the Pathfinder JSON schema.
 */
export function validateProjectSchema(project: unknown, schema: object): SchemaValidateResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const valid = validate(project);
  const errors: ValidationIssue[] = (validate.errors ?? []).map(err => ({
    path: err.instancePath || '/',
    message: err.message ?? 'unknown error',
    keyword: err.keyword,
    params: err.params as Record<string, unknown>,
  }));

  return { valid, errors, warnings: [] };
}
