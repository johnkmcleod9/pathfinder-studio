/**
 * Pathfinder Studio CLI
 *
 * Public surface:
 *   - `runCli(argv, io?)` — callable from Node code or tests; returns an
 *     exit code (0 = success, 1 = runtime failure, 2 = usage error).
 *   - Module-as-entry-point guard at the bottom invokes runCli() with
 *     process.argv and exits with its return code. Importing this file
 *     (e.g. from tests) does NOT trigger the CLI.
 *
 * Subcommands:
 *   - `validate <schema> <file>` — validate a JSON file against a schema
 *   - `validate --check-schemas|--strict|--self` — self-check all schemas
 *   - `publish <input.pathfinder> -o <out.zip> -s <standard> [...]`
 *   - `--help`
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { publish } from './publish/index.js';
import type { OutputStandard, QualityPreset } from './publish/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Dynamic require for CJS Ajv modules
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const AjvCtor = require('ajv') as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const addFormatsFn = require('ajv-formats') as any;
const Ajv = AjvCtor.default ?? AjvCtor;
const addFormats = addFormatsFn.default ?? addFormatsFn;

// ---- Schema registry ----

const SCHEMAS: Record<string, object> = {
  project:  JSON.parse(readFileSync(resolve(__dirname, 'schemas/project.schema.json'),  'utf8')),
  slide:    JSON.parse(readFileSync(resolve(__dirname, 'schemas/slide.schema.json'),    'utf8')),
  trigger:  JSON.parse(readFileSync(resolve(__dirname, 'schemas/trigger.schema.json'),  'utf8')),
  variable: JSON.parse(readFileSync(resolve(__dirname, 'schemas/variable.schema.json'), 'utf8')),
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

function validateData(schemaName: string, data: unknown): ValidationResult {
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

// ---- IO contract ----

export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

// ---- Help text ----

function topLevelHelp(): string {
  return `Pathfinder Studio CLI

Usage:
  cli.ts <command> [options]

Commands:
  publish <input.pathfinder>        Publish a .pathfinder ZIP to a target standard
  validate <schema> <file>          Validate a JSON file against a schema
  validate --check-schemas          Validate all registered schemas are well-formed
  validate --strict                 Run strict validation on all schemas
  validate --self                   Self-validate all compiled schemas
  --help                            Show this help

Run \`cli.ts publish --help\` for publish-specific options.
`;
}

function publishHelp(): string {
  return `Pathfinder Studio — publish

Usage:
  cli.ts publish <input.pathfinder> -o <output.zip> -s <standard> [options]

Required:
  -o, --output <path>         Output file path
  -s, --standard <standard>   One of: scorm12, scorm2004, xapi, html5

Options:
  -q, --quality <level>       low | medium | high (default: medium)
  --mastery-score <n>         Mastery score 0-100 (SCORM only, default: 80)
  --lrs-endpoint <url>        xAPI LRS endpoint URL
  --lrs-auth <token>          xAPI LRS authorization header
  --validate-only             Validate without writing an output package
  -h, --help                  Show this help

Examples:
  cli.ts publish course.pathfinder -o course.zip -s scorm2004 --mastery-score 80
  cli.ts publish course.pathfinder -o course.zip -s html5 --quality high
  cli.ts publish course.pathfinder -o out.zip -s html5 --validate-only
`;
}

// ---- publish subcommand ----

const VALID_STANDARDS: OutputStandard[] = ['scorm12', 'scorm2004', 'xapi', 'html5'];
const VALID_QUALITIES: QualityPreset[] = ['low', 'medium', 'high'];

interface PublishArgs {
  input: string;
  output: string;
  standard: OutputStandard;
  quality?: QualityPreset;
  masteryScore?: number;
  lrsEndpoint?: string;
  lrsAuth?: string;
  validateOnly: boolean;
}

type ParseResult =
  | { ok: true; args: PublishArgs }
  | { ok: false; error: string }
  | { ok: 'help' };

function parsePublishArgs(argv: string[]): ParseResult {
  let input: string | undefined;
  let output: string | undefined;
  let standard: string | undefined;
  let quality: string | undefined;
  let masteryScore: number | undefined;
  let lrsEndpoint: string | undefined;
  let lrsAuth: string | undefined;
  let validateOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const need = (): string | null => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) {
        // step back so the outer loop doesn't skip a legitimate flag
        i--;
        return null;
      }
      return v;
    };

    switch (t) {
      case '-h':
      case '--help':
        return { ok: 'help' };

      case '-o':
      case '--output': {
        const v = need();
        if (v === null) return { ok: false, error: '--output/-o requires a value' };
        output = v;
        break;
      }

      case '-s':
      case '--standard': {
        const v = need();
        if (v === null) return { ok: false, error: '--standard/-s requires a value' };
        standard = v;
        break;
      }

      case '-q':
      case '--quality': {
        const v = need();
        if (v === null) return { ok: false, error: '--quality/-q requires a value' };
        quality = v;
        break;
      }

      case '--mastery-score': {
        const v = need();
        if (v === null) return { ok: false, error: '--mastery-score requires a value' };
        const n = Number(v);
        if (!Number.isFinite(n)) {
          return { ok: false, error: `--mastery-score must be a number, got "${v}"` };
        }
        masteryScore = n;
        break;
      }

      case '--lrs-endpoint': {
        const v = need();
        if (v === null) return { ok: false, error: '--lrs-endpoint requires a value' };
        lrsEndpoint = v;
        break;
      }

      case '--lrs-auth': {
        const v = need();
        if (v === null) return { ok: false, error: '--lrs-auth requires a value' };
        lrsAuth = v;
        break;
      }

      case '--validate-only':
        validateOnly = true;
        break;

      default:
        if (t.startsWith('-')) {
          return { ok: false, error: `Unknown flag: "${t}"` };
        }
        if (input !== undefined) {
          return { ok: false, error: `Unexpected positional argument: "${t}"` };
        }
        input = t;
    }
  }

  if (input === undefined) return { ok: false, error: 'Missing required <input.pathfinder> argument' };
  if (output === undefined) return { ok: false, error: 'Missing required --output/-o flag' };
  if (standard === undefined) return { ok: false, error: 'Missing required --standard/-s flag' };

  if (!VALID_STANDARDS.includes(standard as OutputStandard)) {
    return {
      ok: false,
      error: `Unknown standard "${standard}". Valid values: ${VALID_STANDARDS.join(', ')}`,
    };
  }

  if (quality !== undefined && !VALID_QUALITIES.includes(quality as QualityPreset)) {
    return {
      ok: false,
      error: `Unknown quality "${quality}". Valid values: ${VALID_QUALITIES.join(', ')}`,
    };
  }

  return {
    ok: true,
    args: {
      input,
      output,
      standard: standard as OutputStandard,
      quality: quality as QualityPreset | undefined,
      masteryScore,
      lrsEndpoint,
      lrsAuth,
      validateOnly,
    },
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function handlePublish(argv: string[], io: CliIO): Promise<number> {
  const parsed = parsePublishArgs(argv);
  if (parsed.ok === 'help') {
    io.stdout(publishHelp());
    return 0;
  }
  if (parsed.ok === false) {
    io.stderr(`Error: ${parsed.error}\n\n${publishHelp()}`);
    return 2;
  }

  const args = parsed.args;

  // Verify input exists up front — the pipeline would fail later, but this
  // gives a crisper error earlier.
  if (!existsSync(args.input)) {
    io.stderr(`Error: Input file not found: "${args.input}"\n`);
    return 1;
  }

  try {
    const report = await publish({
      inputPath: args.input,
      outputPath: args.output,
      standard: args.standard,
      quality: args.quality ?? 'medium',
      masteryScore: args.masteryScore,
      lrsEndpoint: args.lrsEndpoint,
      lrsAuth: args.lrsAuth,
      validateOnly: args.validateOnly,
    });

    if (!report.success) {
      io.stderr(`✗ Publish failed (${report.errors.length} error${report.errors.length === 1 ? '' : 's'}):\n`);
      for (const e of report.errors) {
        io.stderr(`  [stage ${e.stage}] ${e.code}: ${e.message}\n`);
      }
      if (report.warnings.length > 0) {
        io.stderr(`\nWarnings (${report.warnings.length}):\n`);
        for (const w of report.warnings) {
          io.stderr(`  ${w.code}: ${w.message}\n`);
        }
      }
      return 1;
    }

    if (args.validateOnly) {
      io.stdout(`✓ Valid — ${report.slideCount} slide(s), standard=${args.standard}\n`);
      io.stdout(`  duration: ${report.duration}ms\n`);
      for (const w of report.warnings) {
        io.stdout(`  warning: ${w.code}: ${w.message}\n`);
      }
      return 0;
    }

    io.stdout(`✓ Published: ${report.outputPath ?? args.output}\n`);
    io.stdout(`  standard: ${args.standard}\n`);
    io.stdout(`  slides:   ${report.slideCount}\n`);
    if (report.mediaCount > 0) {
      const opt = report.mediaOptimized;
      const saved = report.mediaBytesSaved;
      io.stdout(
        `  media:    ${report.mediaCount}` +
          (opt > 0 ? ` (${opt} optimized, ${formatBytes(saved)} saved)` : '') +
          `\n`
      );
    }
    if (report.packageSize !== undefined) {
      io.stdout(`  size:     ${formatBytes(report.packageSize)}\n`);
    }
    io.stdout(`  duration: ${report.duration}ms\n`);
    if (report.checksum) {
      io.stdout(`  sha256:   ${report.checksum}\n`);
    }
    if (report.warnings.length > 0) {
      io.stdout(`  warnings: ${report.warnings.length}\n`);
    }
    return 0;
  } catch (err) {
    const e = err as Error;
    io.stderr(`Error: ${e.message}\n`);
    return 1;
  }
}

// ---- validate subcommand ----

function selfCheckSchemas(io: CliIO, label: string): number {
  io.stdout(`${label}...\n`);
  let allOk = true;
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    try {
      ajv.compile(schema);
      io.stdout(`✓ Schema "${name}" is valid\n`);
    } catch (e) {
      io.stderr(`✗ Schema "${name}" failed to compile: ${e}\n`);
      allOk = false;
    }
  }
  if (!allOk) return 1;
  io.stdout(`\nAll schemas are valid.\n`);
  return 0;
}

function handleValidate(argv: string[], io: CliIO): number {
  const subcommand = argv[0];

  if (subcommand === '--check-schemas') {
    return selfCheckSchemas(io, 'Validating schema files');
  }
  if (subcommand === '--strict') {
    return selfCheckSchemas(io, 'Running strict schema validation');
  }
  if (subcommand === '--self') {
    return selfCheckSchemas(io, 'Self-validating schemas');
  }

  // validate <schema> <file>
  const schemaName = argv[0];
  const filePath = argv[1];

  if (!schemaName || !filePath) {
    io.stderr(`Usage: cli.ts validate <schema> <file>\n`);
    return 2;
  }

  if (!['project', 'slide', 'trigger', 'variable'].includes(schemaName)) {
    io.stderr(`Unknown schema: ${schemaName}. Valid: project, slide, trigger, variable\n`);
    return 2;
  }

  try {
    const data = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
    const result = validateData(schemaName, data);

    if (result.valid) {
      io.stdout(`✓ "${filePath}" is valid against "${schemaName}" schema\n`);
      if (result.warnings.length > 0) {
        io.stdout(`\nWarnings:\n`);
        result.warnings.forEach((w) => io.stdout(`  ⚠ ${w}\n`));
      }
      return 0;
    }
    io.stderr(`✗ "${filePath}" failed validation:\n`);
    result.errors.forEach((e) => {
      io.stderr(`  ${e.path}: ${e.message} (${e.keyword})\n`);
    });
    return 1;
  } catch (e) {
    io.stderr(`Error: ${e}\n`);
    return 1;
  }
}

// ---- Main dispatch ----

/**
 * Run the CLI with the given args. Returns an exit code.
 * Does NOT call process.exit.
 */
export async function runCli(argv: string[], io?: Partial<CliIO>): Promise<number> {
  const fullIO: CliIO = {
    stdout: io?.stdout ?? ((s: string) => { process.stdout.write(s); }),
    stderr: io?.stderr ?? ((s: string) => { process.stderr.write(s); }),
  };

  const command = argv[0];

  if (!command || command === '--help' || command === '-h') {
    fullIO.stdout(topLevelHelp());
    return 0;
  }

  if (command === 'publish') {
    return handlePublish(argv.slice(1), fullIO);
  }

  if (command === 'validate') {
    return handleValidate(argv.slice(1), fullIO);
  }

  // Legacy top-level schema flags (preserved for CI and package.json "validate" script).
  if (command === '--check-schemas') {
    return selfCheckSchemas(fullIO, 'Validating schema files');
  }
  if (command === '--strict' || command === '--self') {
    return selfCheckSchemas(fullIO, 'Running strict schema validation');
  }

  fullIO.stdout(topLevelHelp());
  return 1;
}

// ---- Module entry guard ----

// Only run as a script when invoked directly (e.g. via `tsx src/cli.ts`).
// Importing this module from tests or other code MUST NOT trigger the CLI.
const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write(`${e}\n`);
      process.exit(1);
    });
}

