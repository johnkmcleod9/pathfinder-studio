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
| `npm test` | Run all tests (vitest) |
| `npm run test:watch` | Watch mode |
| `npm run typecheck` | `tsc --noEmit` (must be 0 errors) |
| `npm run build` | Compile to `dist/` |

## Code style

- TypeScript strict mode — no `any` unless truly unavoidable.
- No comments unless the *why* is non-obvious.
- Prefer editing existing files over creating new ones.
- Tests live in `tests/` mirroring the `src/` directory structure.
