/**
 * Pathfinder Studio — top-level public API.
 *
 * Consumers should import from this entry rather than reaching into
 * subpaths so refactors of the internal directory layout don't break
 * downstream code.  Subpath imports (./publish, ./pipeline, etc.)
 * remain available for tree-shaking, but are not part of the stable
 * surface guaranteed by semver.
 */

// ---- Publish pipeline ----

export {
  publish,
  cancel,
  PublishPipeline,
  buildManifest,
  buildScormManifest,
  renderManifestXml,
  generateScorm12Manifest,
  validateScorm12Manifest,
  optimizeMedia,
  mimeFromPath,
  subsetFont,
  assemblePackage,
} from './publish/index.js';

export type {
  PublishOptions,
  PublishReport,
  PublishError,
  PublishWarning,
  OutputStandard,
  QualityPreset,
  StageId,
  CourseIR,
  RuntimeCourse,
  ImsManifest,
  ImsOrganization,
  ImsItem,
  ImsResource,
  ImsMetadata,
  MediaAssetIR,
  SlideIR,
  ObjectIR,
  RectIR,
  LayerIR,
  BackgroundIR,
  MediaRefIR,
  ResolvedTriggerIR,
  ActionNodeIR,
  VariableIR,
  QuizStateMachineIR,
  NavigationIR,
  CourseMetadataIR,
  ConditionIR,
  InteractionIR,
  VisibilityIR,
  ConditionalVisibilityIR,
  Scorm12ManifestOpts,
  Scorm12ValidationResult,
} from './publish/index.js';

// ---- SCORM 2004 / 1.2 / xAPI runtime adapter source strings ----
// These are JS source as strings — emitted into published packages.
// Exposed so custom packagers can compose alternative bundles.

export {
  SCORM_2004_ADAPTER,
  SCORM_12_ADAPTER,
  XAPI_ADAPTER,
} from './publish/scorm-manifest.js';

export { BROWSER_RUNTIME } from './publish/browser-runtime.js';

// ---- xAPI tincan.xml generator/validator ----

export {
  generateTinCanXml,
  validateTinCanXml,
  TINCAN_NAMESPACE,
  type TinCanOptions,
  type TinCanSlide,
  type TinCanValidationResult,
} from './publish/tincan.js';

// ---- Pipeline (parse, validate, compile, save, load) ----

export {
  parseProjectFile,
  classifyParseError,
  ParseError,
  validateZipFile,
  validateZipStructure,
  validateProjectSchema,
  loadProject,
  loadProjectFromFile,
  saveProject,
  saveProjectToFile,
  migrateProject,
  registerMigration,
  compareVersions,
  CURRENT_SCHEMA_VERSION,
  CURRENT_FORMAT_VERSION,
  createManifest,
  addAsset,
  removeAsset,
  listAssets,
  verifyAsset,
  contentHash,
  hashPath,
  mimeFromFilename,
  InvalidZipError,
  LoadValidationError,
} from './pipeline/index.js';

export type {
  ParsedProject,
  ParseResult,
  ParseErrorCode,
  ZipValidationResult,
  ZipFileValidationResult,
  ValidationIssue,
  LoadOptions,
  LoadResult,
  LoadIssue,
  SaveOptions,
  SaveResult,
  MigrationStep,
  MigrationResult,
  Manifest,
  AssetEntry,
} from './pipeline/index.js';

// ---- Compiler (Stage 3 internals exposed for direct IR use) ----

export {
  compileCourseIR,
  buildRuntimeCourse,
} from './publish/compiler.js';

// Pipeline stage names (0..7)
export { STAGE_NAMES } from './publish/types.js';

// ---- CLI ----

export { runCli } from './cli.js';
