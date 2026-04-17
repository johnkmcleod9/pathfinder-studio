# Pathfinder Studio

TypeScript library and CLI for the `.pathfinder` course file format.
Parse, compile, and publish interactive e-learning courses to
SCORM 1.2, SCORM 2004 4th Edition, xAPI (TinCan), or standalone HTML5.

## Install

```bash
npm install pathfinder-studio
```

## Quick Start

```ts
import { publish } from 'pathfinder-studio';

const report = await publish('course.pathfinder', {
  std: 'scorm2004',
  outputPath: './out/course.zip',
});

console.log(report.ok ? 'Published!' : report.errors);
```

## CLI

```bash
# Publish a course
npx pathfinder publish course.pathfinder -o course.zip --std scorm2004

# Inspect a course (slides, objects, quiz, issues)
npx pathfinder inspect course.pathfinder
npx pathfinder inspect course.pathfinder --json

# Validate a project JSON against a schema
npx pathfinder validate project project.json
```

### Options

| Flag | Description |
|------|-------------|
| `-o, --output` | Output ZIP path |
| `--std` | Target standard: `scorm12`, `scorm2004`, `xapi`, `html5` |
| `--quality` | Quality preset: `draft`, `normal`, `high` |
| `--json` | Machine-readable JSON output (inspect) |

## API

The library exports everything needed to build custom publishing workflows:

```ts
import {
  publish,
  PublishPipeline,
  buildManifest,
  compileCourseIR,
  buildRuntimeCourse,
  optimizeMedia,
  assemblePackage,
  STAGE_NAMES,
} from 'pathfinder-studio';
```

Subpath imports are available for tree-shaking:

```ts
import { QuizEngine } from 'pathfinder-studio/quiz';
import { VariableStore } from 'pathfinder-studio/variables';
import { TriggerEngine } from 'pathfinder-studio/triggers';
```

See the TypeScript declarations (`dist/*.d.ts`) for full type documentation.

## Development

```bash
npm install
npm test          # Run all tests (vitest)
npm run typecheck # tsc --noEmit
npm run build     # Compile to dist/
```

## License

[MIT](./LICENSE)
