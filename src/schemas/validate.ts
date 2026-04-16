import type { ValidationIssue } from '../pipeline/validate.js';

export interface SchemaValidateResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
