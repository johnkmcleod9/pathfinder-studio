# Contributing to Pathfinder Studio

## Development workflow

This project follows strict **red/green TDD**:

1. **Red** — Write a failing test that specifies the desired behavior.
2. **Green** — Write the minimum code to make the test pass.
3. **Commit** — One commit per feature/fix, with a descriptive message.

Every pull request must keep the full test suite green and `tsc --noEmit` at
zero errors.

## Getting started

```bash
git clone <repo-url>
cd pathfinder-studio
npm install
npm test
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all unit/integration tests (vitest) |
| `npm run test:watch` | Watch mode |
| `npm run typecheck` | `tsc --noEmit` (must be 0 errors) |
| `npm run build` | Compile to `dist/` |
| `npm run test:e2e` | Real-browser end-to-end tests (Playwright) |
| `npm run test:e2e:update` | Regenerate visual screenshot baselines |
| `npm run test:e2e:install` | One-time Chromium download for Playwright |

## Code style

- TypeScript strict mode — no `any` unless truly unavoidable.
- No comments unless the *why* is non-obvious.
- Prefer editing existing files over creating new ones.
- Tests live in `tests/` mirroring the `src/` directory structure.

## End-to-end tests

The Playwright suite under `tests/e2e/` compiles a rich `.pathfinder` fixture
through the real publish pipeline, serves the output over HTTP, and drives it
in Chromium. It's the only layer that catches issues jsdom unit tests miss —
CSS rendering, real mouse/keyboard events, media-element behavior, and
published-package wiring.

First-time setup:

```bash
npm run test:e2e:install   # downloads Chromium (~90 MiB)
npm run test:e2e
```

**When to add an e2e spec**

Any change that affects what ships in the published package (the browser
runtime, the compiler, the packager, or the emitted `index.html`) should get
a Playwright test proving the packaged course still behaves correctly in a
real browser. Add a new `test(...)` block in
`tests/e2e/demo-course.spec.ts`, or a new spec file if the scenario needs
its own fixture.

**Visual regression**

Tests that call `toHaveScreenshot()` compare against baselines in
`tests/e2e/demo-course.spec.ts-snapshots/`. When an intentional visual
change lands, regenerate the baselines with `npm run test:e2e:update` and
commit the new PNGs. Review the diff visually — a bad baseline silently
papers over real regressions.
