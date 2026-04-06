/**
 * Pathfinder Studio CLI
 * Validates .pathfinder project files and schemas.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Dynamic require for CJS Ajv modules
// eslint-disable-next-line @typescript-eslint/no-require-imports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvCtor = require('ajv') as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormatsFn = require('ajv-formats') as any;
const Ajv = AjvCtor.default ?? AjvCtor;
const addFormats = addFormatsFn.default ?? addFormatsFn;

// Schema registry
const SCHEMAS: Record<string, object> = {
  project:  JSON.parse(readFileSync(resolve(__dirname, 'schemas/project.schema.json'),  'utf8')),
  slide:    JSON.parse(readFileSync(resolve(__dirname, 'schemas/slide.schema.json'),    'utf8')),
  trigger:  JSON.parse(readFileSync(resolve(__dirname, 'schemas/trigger.schema.json'), 'utf8')),
  variable: JSON.parse(readFileSync(resolve(__dirname, 'schemas/variable.schema.json'),'utf8')),
};

const ajv = new Ajv({ allErrors: true, verbose: true, strict: false });
addFormats(ajv);

const validators = Object.fromEntries(
  Object.entries(SCHEMAS).map(([name, schema]) => [name, ajv.compile(schema)])
);

interface ValidationResult {
  valid: boolean;
  errors: { path: string; message: string; keyword: string }[];
  warnings: string[];
}

function validate(schemaName: string, data: unknown): ValidationResult {
  const validator = validators[schemaName];
  if (!validator) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }
  const valid = validator(data);
  return {
    valid,
    errors: (validator.errors ?? []).map((err: { instancePath: string; message?: string; keyword: string }) => ({
      path: err.instancePath || '/',
      message: err.message ?? 'unknown',
      keyword: err.keyword,
    })),
    warnings: [],
  };
}

// CLI entrypoint
const args = process.argv.slice(2);
const command = args[0];

function help() {
  console.log(`Pathfinder Studio CLI
Usage:
  cli.ts validate <schema> <file>   Validate a JSON file against a schema
  cli.ts --check-schemas            Validate all schemas are valid JSON Schema
  cli.ts --strict                   Run strict validation on all schemas
  cli.ts --self                     Validate all schemas compile correctly
  cli.ts --help                     Show this help
`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    help();
    return;
  }

  // Handle validate subcommand
  if (command === 'validate') {
    const subcommand = args[1];

    if (subcommand === '--check-schemas') {
      // Check all schemas are valid JSON Schema documents
      console.log('Validating schema files...');
      let allOk = true;
      for (const [name, schema] of Object.entries(SCHEMAS)) {
        try {
          ajv.compile(schema);
          console.log(`✓ Schema "${name}" is valid`);
        } catch (e: unknown) {
          console.error(`✗ Schema "${name}" failed to compile: ${e}`);
          allOk = false;
        }
      }
      if (!allOk) process.exit(1);
      console.log('\nAll schemas are valid.');
      return;
    }

    if (subcommand === '--strict') {
      // Validate each schema compiles cleanly (self-validation)
      console.log('Running strict schema validation...');
      let allOk = true;
      for (const [name, schema] of Object.entries(SCHEMAS)) {
        try {
          ajv.compile(schema);
          console.log(`✓ Schema "${name}" passes strict validation`);
        } catch (e: unknown) {
          console.error(`✗ Schema "${name}" error: ${e}`);
          allOk = false;
        }
      }
      if (!allOk) process.exit(1);
      console.log('\nAll schemas pass strict validation.');
      return;
    }

    if (subcommand === '--self') {
      // Self-validation: compile each schema (ensures it's valid JSON Schema)
      console.log('Self-validating schemas...');
      let allOk = true;
      for (const [name, schema] of Object.entries(SCHEMAS)) {
        try {
          ajv.compile(schema);
          console.log(`✓ Schema "${name}" compiles OK`);
        } catch (e: unknown) {
          console.error(`✗ Schema "${name}" failed to compile: ${e}`);
          allOk = false;
        }
      }
      if (!allOk) process.exit(1);
      return;
    }

    // Validate a specific file: validate <schema> <file>
    const schemaName = args[1];
    const filePath = args[2];

    if (!schemaName || !filePath) {
      console.error('Usage: cli.ts validate <schema> <file>');
      process.exit(1);
    }

    if (!['project', 'slide', 'trigger', 'variable'].includes(schemaName)) {
      console.error(`Unknown schema: ${schemaName}. Valid: project, slide, trigger, variable`);
      process.exit(1);
    }

    try {
      const data = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
      const result = validate(schemaName, data);

      if (result.valid) {
        console.log(`✓ "${filePath}" is valid against "${schemaName}" schema`);
        if (result.warnings.length > 0) {
          console.log('\nWarnings:');
          result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
        }
      } else {
        console.error(`✗ "${filePath}" failed validation:`);
        result.errors.forEach(e => {
          console.error(`  ${e.path}: ${e.message} (${e.keyword})`);
        });
        process.exit(1);
      }
    } catch (e: unknown) {
      console.error(`Error: ${e}`);
      process.exit(1);
    }
    return;
  }

  // Handle direct flags (without validate subcommand)
  if (command === '--check-schemas') {
    console.log('Validating schema files...');
    let allOk = true;
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      try {
        ajv.compile(schema);
        console.log(`✓ Schema "${name}" is valid`);
      } catch (e: unknown) {
        console.error(`✗ Schema "${name}" failed: ${e}`);
        allOk = false;
      }
    }
    if (!allOk) process.exit(1);
    console.log('\nAll schemas are valid.');
    return;
  }

  if (command === '--strict' || command === '--self') {
    console.log('Running strict schema validation...');
    let allOk = true;
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      try {
        ajv.compile(schema);
        console.log(`✓ Schema "${name}" passes strict validation`);
      } catch (e: unknown) {
        console.error(`✗ Schema "${name}" error: ${e}`);
        allOk = false;
      }
    }
    if (!allOk) process.exit(1);
    console.log('\nAll schemas pass strict validation.');
    return;
  }

  help();
  process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
