// Pipeline module public exports
export { saveProject, saveProjectToFile, type SaveOptions, type SaveResult } from './save.js';
export { loadProject, loadProjectFromFile, type LoadOptions, type LoadResult, InvalidZipError, LoadValidationError } from './load.js';
export { validateZipStructure, validateZipFile, validateProjectSchema, type ZipValidationResult, type ZipFileValidationResult, type ValidationIssue } from './validate.js';
export { migrateProject, registerMigration, compareVersions, CURRENT_SCHEMA_VERSION, CURRENT_FORMAT_VERSION, type MigrationStep, type MigrationResult } from './migrate.js';
export { createManifest, addAsset, removeAsset, listAssets, verifyAsset, contentHash, hashPath, mimeFromFilename, type Manifest, type AssetEntry } from './manifest.js';
export { parseProjectFile, classifyParseError, ParseError, type ParseErrorCode, type ParsedProject, type ParseResult } from './parse.js';
