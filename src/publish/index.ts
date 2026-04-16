/**
 * Pathfinder Publish Pipeline — Public API
 */

export {
  PublishPipeline,
  publish,
  cancel,
  buildManifest,
} from './pipeline.js';

export { buildScormManifest, renderManifestXml } from './scorm-manifest.js';

export {
  generateScorm12Manifest,
  validateScorm12Manifest,
  type Scorm12ManifestOpts,
  type Scorm12ValidationResult,
} from './imsmanifest.js';

export {
  optimizeMedia,
  mimeFromPath,
  subsetFont,
} from './optimizer.js';

export { assemblePackage } from './packager.js';

export { STAGE_NAMES } from './types.js';

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
  GradientIR,
  EventIR,
  ConditionalBranchIR,
  QuizQuestionIR,
  QuizOptionIR,
  NavigationIR,
  ImsMetadata,
  ImsSequencing,
  ImsRollupRule,
  ImsObjective,
} from './types.js';
