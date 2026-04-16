/**
 * Migration Pipeline — schema version upgrades for .pathfinder projects.
 *
 * The .pathfinder formatVersion and schemaVersion change independently:
 * - formatVersion: ZIP structure changes (e.g., new directories)
 * - schemaVersion: JSON schema changes (e.g., new fields, renamed fields)
 *
 * Migration strategy:
 * 1. Detect current version from project.json
 * 2. Apply sequential migrations (each migration step handles one version bump)
 * 3. Validate after each step
 * 4. Return the migrated project
 *
 * Supported migrations are declared as a chain of transformers.
 */

export interface MigrationStep {
  fromVersion: string;
  toVersion: string;
  description: string;
  migrate: (project: Record<string, unknown>) => Record<string, unknown>;
}

export interface MigrationResult {
  migrated: boolean;
  originalVersion: string;
  finalVersion: string;
  steps: string[];
  project: Record<string, unknown>;
  warnings: string[];
}

const MIGRATIONS: MigrationStep[] = [];

/**
 * Register a migration step. Call this to add migrations.
 */
export function registerMigration(step: MigrationStep): void {
  MIGRATIONS.push(step);
  MIGRATIONS.sort((a, b) => compareVersions(a.fromVersion, b.fromVersion));
}

/**
 * Apply all necessary migrations to bring project to current schemaVersion.
 */
export function migrateProject(
  project: Record<string, unknown>,
  targetVersion: string = CURRENT_SCHEMA_VERSION
): MigrationResult {
  const originalVersion = (project.schemaVersion as string) ?? '0.0.0';
  const steps: string[] = [];
  const warnings: string[] = [];

  let current = { ...project };
  let version = originalVersion;

  while (compareVersions(version, targetVersion) < 0) {
    const migration = MIGRATIONS.find(m => compareVersions(m.fromVersion, version) === 0);

    if (!migration) {
      warnings.push(
        `No migration path from schemaVersion "${version}" to "${targetVersion}". ` +
        `Project may not be fully compatible.`
      );
      break;
    }

    try {
      current = migration.migrate(current);
      version = migration.toVersion;
      steps.push(`${migration.fromVersion} → ${migration.toVersion}: ${migration.description}`);
    } catch (e) {
      warnings.push(`Migration failed at ${version} → ${migration.toVersion}: ${e}`);
      break;
    }
  }

  return {
    migrated: steps.length > 0,
    originalVersion,
    finalVersion: version,
    steps,
    project: current,
    warnings,
  };
}

export const CURRENT_SCHEMA_VERSION = '1.0.0';
export const CURRENT_FORMAT_VERSION = '1.0';

/**
 * Compare semantic versions: returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }
  return 0;
}

/**
 * Rename a field in the project (supports nested paths like "metadata.title").
 */
/**
 * Rename a field within `obj` using a dot-separated `from` path.
 * Exposed so registered migrations can use it without re-implementing
 * dotted-path traversal each time.
 */
export function renameField(
  obj: Record<string, unknown>,
  from: string,
  to: string
): void {
  const parts = from.split('.');
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof current !== 'object' || current === null) return;
    current = (current as Record<string, unknown>)[parts[i]];
  }
  if (typeof current !== 'object' || current === null) return;
  const lastKey = parts[parts.length - 1];
  if (lastKey in (current as Record<string, unknown>)) {
    (current as Record<string, unknown>)[to] = (current as Record<string, unknown>)[lastKey];
    delete (current as Record<string, unknown>)[lastKey];
  }
}

// ─── Example: register built-in migrations ───────────────────────────────────────
// These would be populated as migrations are actually needed for version bumps.
// Example migration:
// registerMigration({
//   fromVersion: '1.0.0',
//   toVersion: '1.1.0',
//   description: 'Rename legacySlideId to slideId in triggers',
//   migrate: (project) => {
//     for (const slide of (project.slides as any[] ?? [])) {
//       for (const trigger of (slide.triggers ?? [])) {
//         if ('legacySlideId' in trigger) {
//           trigger.slideId = trigger.legacySlideId;
//           delete trigger.legacySlideId;
//         }
//       }
//     }
//     project.schemaVersion = '1.1.0';
//     return project;
//   }
// });
