/**
 * Pathfinder Publish Pipeline
 *
 * 8-stage compiler producing SCORM 1.2, SCORM 2004, xAPI, or HTML5 packages.
 *
 * Stage 0: Unpack .pathfinder ZIP
 * Stage 1: Validate JSON schema + media references
 * Stage 2: Normalize + resolve variable references
 * Stage 3: Compile Intermediate Representation (IR)
 * Stage 4: LMS adapter compilation (standard-specific)
 * Stage 5: Optimize assets
 * Stage 6: Package ZIP with imsmanifest.xml
 * Stage 7: Output + report
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore — adm-zip has no types published
import AdmZip from 'adm-zip';
import {
  PublishOptions,
  PublishReport,
  CourseIR,
  StageId,
  OutputStandard,
  ImsManifest,
  RuntimeCourse,
} from './types.js';
import { buildScormManifest } from './scorm-manifest.js';
import { optimizeMedia } from './optimizer.js';
import { compileCourseIR, buildRuntimeCourse } from './compiler.js';
import { assemblePackage } from './packager.js';

// ---- Pipeline ----

export class PublishPipeline {
  private opts: PublishOptions;
  private report: Omit<PublishReport, 'duration'> & { duration?: number };
  private startTime: number = 0;
  private cancelled = false;
  private baseDir: string;
  private stageStart: Record<StageId, number> = {} as Record<StageId, number>;
  private extractDir: string;
  private workDir: string;
  private courseIR?: CourseIR;
  private runtimeCourse?: RuntimeCourse;
  private mediaHashes: Map<string, string> = new Map();

  constructor(opts: PublishOptions) {
    this.opts = {
      validateOnly: false,
      masteryScore: 80,
      ...opts,
      quality: opts.quality ?? 'medium',
    };
    this.report = {
      success: false,
      slideCount: 0,
      mediaCount: 0,
      standard: this.opts.standard,
      quality: this.opts.quality,
      stageDurations: {} as Record<StageId, number>,
      errors: [],
      warnings: [],
    };
    this.baseDir = this.opts.basePath || fs.mkdtempSync('pathfinder-publish-');
    this.extractDir = path.join(this.baseDir, 'extracted');
    this.workDir = path.join(this.baseDir, 'work');
  }

  // ---- Public API ----

  async run(onProgress?: (stage: StageId, progress: number, msg?: string) => void): Promise<PublishReport> {
    this.startTime = Date.now();
    const stages: Array<() => Promise<void>> = [
      () => this.stage0_Unpack(),
      () => this.stage1_Validate(),
      () => this.stage2_Normalize(),
      () => this.stage3_CompileIR(),
      () => this.stage4_LmsAdapter(),
      () => this.stage5_Optimize(),
      () => this.stage6_Package(),
      () => this.stage7_Output(),
    ];

    for (let i = 0; i < stages.length; i++) {
      if (this.cancelled) break;
      const stage = i as StageId;
      this.stageStart[stage] = Date.now();
      onProgress?.(stage, 0, `Stage ${i}: ${['Unpack','Validate','Normalize','Compile IR','LMS Adapter','Optimize','Package','Output'][i]}`);
      try {
        await stages[i]();
      } catch (err: unknown) {
        const e = err as Error;
        this.error(stage, 'STAGE_FAILED', e.message, e.stack);
        break;
      }
      this.report.stageDurations[stage] = Date.now() - this.stageStart[stage];
      onProgress?.(stage, 100);
    }

    return this.buildReport();
  }

  cancel(): void {
    this.cancelled = true;
  }

  // ---- Helpers ----

  private error(stage: StageId, code: string, message: string, detail?: string): void {
    this.report.errors.push({ stage, code, message, detail });
  }

  private warn(code: string, message: string): void {
    this.report.warnings.push({ code, message });
  }

  private stageDuration(stage: StageId): number {
    return this.report.stageDurations[stage] ?? 0;
  }

  // ---- Stage 0: Unpack ----

  private async stage0_Unpack(): Promise<void> {
    fs.mkdirSync(this.extractDir, { recursive: true });
    let zip: AdmZip;
    try {
      zip = new AdmZip(this.opts.inputPath);
    } catch {
      this.error(0, 'INVALID_ZIP', 'Input file is not a valid ZIP archive');
      return;
    }
    try {
      zip.extractAllTo(this.extractDir, true);
    } catch {
      this.error(0, 'EXTRACT_FAILED', 'Failed to extract ZIP archive');
      return;
    }

    // Verify required files exist
    const required = ['project.json', 'manifest.json'];
    for (const f of required) {
      if (!fs.existsSync(path.join(this.extractDir, f))) {
        this.error(0, 'MISSING_REQUIRED_FILE', `Missing required file: ${f}`);
      }
    }

    // Verify ZIP integrity via AdmZip
    const entries = zip.getEntries();
    if (entries.length === 0) {
      this.error(0, 'EMPTY_ZIP', 'Input ZIP contains no files');
    }
  }

  // ---- Stage 1: Validate ----

  private async stage1_Validate(): Promise<void> {
    const projectPath = path.join(this.extractDir, 'project.json');
    const raw = fs.readFileSync(projectPath, 'utf-8');

    let project: Record<string, unknown>;
    try {
      project = JSON.parse(raw);
    } catch {
      this.error(1, 'INVALID_JSON', 'project.json is not valid JSON');
      return;
    }

    // Validate required top-level fields
    const requiredFields = ['metadata', 'slides', 'variables', 'navigation'];
    for (const field of requiredFields) {
      if (!project[field]) {
        this.error(1, 'MISSING_FIELD', `Missing required field: ${field}`);
      }
    }

    // Validate slides array
    const slides = project['slides'] as Record<string, unknown>[] | undefined;
    if (!slides) {
      this.error(1, 'NO_SLIDES', 'Project has no slides');
      return;
    }

    // Validate each slide has required fields
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide['id']) {
        this.error(1, 'SLIDE_MISSING_ID', `Slide at index ${i} has no id`);
      }
      if (!slide['objects']) {
        this.error(1, 'SLIDE_MISSING_OBJECTS', `Slide ${slide['id']} has no objects`);
      }
    }

    // Validate navigation
    const nav = project['navigation'] as Record<string, unknown> | undefined;
    if (nav) {
      const entrySlide = nav['entrySlide'] as string | undefined;
      const slideIds = new Set(slides?.map((s) => s['id'] as string) ?? []);
      if (entrySlide && !slideIds.has(entrySlide)) {
        this.error(1, 'INVALID_ENTRY_SLIDE', `Entry slide "${entrySlide}" not found in slides`);
      }
    }

    // Validate trigger targets
    this.validateTriggerTargets(slides ?? []);

    // Check manifest media files exist
    await this.validateMediaReferences();
  }

  private validateTriggerTargets(slides: Record<string, unknown>[]): void {
    const slideIds = new Set(slides.map((s) => s['id'] as string));
    const layerIds = new Set<string>();

    // Collect layer IDs per slide
    for (const slide of slides) {
      const objects = slide['objects'] as Record<string, Record<string, unknown>> | undefined;
      const layers = slide['layers'] as Record<string, Record<string, unknown>>[] | undefined;
      if (layers) {
        for (const layer of layers) {
          layerIds.add(layer['id'] as string);
        }
      }
      if (objects) {
        for (const [objId, obj] of Object.entries(objects)) {
          const triggers = obj['triggers'] as Record<string, unknown>[] | undefined;
          if (triggers) {
            for (const trigger of triggers) {
              const action = trigger['action'] as Record<string, unknown> | undefined;
              if (!action) continue;
              const actionType = action['type'] as string;
              if (actionType === 'jumpToSlide') {
                const target = action['target'] as string;
                if (!slideIds.has(target)) {
                  this.error(1, 'INVALID_TRIGGER_TARGET', `jumpToSlide target "${target}" not found`, `Slide: ${slide['id']}, Object: ${objId}`);
                }
              }
              if (actionType === 'showLayer' || actionType === 'hideLayer') {
                const target = action['target'] as string;
                if (!layerIds.has(target)) {
                  this.warn('UNKNOWN_LAYER', `Layer "${target}" referenced but not defined in slide ${slide['id']}`);
                }
              }
            }
          }
        }
      }
    }
  }

  private async validateMediaReferences(): Promise<void> {
    const manifestPath = path.join(this.extractDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      this.warn('NO_MANIFEST', 'No manifest.json found — skipping media validation');
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { assets?: Record<string, { path: string; size: number; mimeType: string }> };
    const mediaDir = path.join(this.extractDir, 'media');
    const contentDir = path.join(this.extractDir, 'content');

    if (manifest.assets) {
      for (const [assetId, asset] of Object.entries(manifest.assets)) {
        const fullPath = path.join(this.extractDir, asset.path);
        if (!fs.existsSync(fullPath)) {
          this.error(1, 'MISSING_MEDIA', `Media asset "${assetId}" references "${asset.path}" which does not exist`);
        }
      }
    }

    // Check media dir exists
    if (!fs.existsSync(mediaDir) && !fs.existsSync(contentDir)) {
      this.warn('NO_MEDIA_DIR', 'No media/ or content/ directory found — course may have no media');
    }
  }

  // ---- Stage 2: Normalize ----

  private async stage2_Normalize(): Promise<void> {
    // Resolve content-addressed media IDs — the manifest tracks the mapping.
    // No additional normalization needed at this stage beyond what
    // stage 3 (Compile IR) handles.
  }

  // ---- Stage 3: Compile IR ----

  private async stage3_CompileIR(): Promise<void> {
    const projectPath = path.join(this.extractDir, 'project.json');
    const manifestPath = path.join(this.extractDir, 'manifest.json');
    const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8')) as Record<string, unknown>;
    const manifest = fs.existsSync(manifestPath)
      ? (JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>)
      : {};

    this.courseIR = compileCourseIR(project, manifest);
    this.runtimeCourse = buildRuntimeCourse(this.courseIR, {
      standard: this.opts.standard,
      masteryScore: this.opts.masteryScore,
      lrsEndpoint: this.opts.lrsEndpoint,
      lrsAuth: this.opts.lrsAuth,
    });
    this.report.slideCount = this.courseIR.slides.length;

    // Pre-populate media hash map for packager (content-addressed paths)
    for (const asset of this.courseIR.mediaManifest) {
      this.mediaHashes.set(asset.hash || asset.id, asset.srcPath || asset.path);
    }
  }

  // ---- Stage 4: LMS Adapter ----

  private async stage4_LmsAdapter(): Promise<void> {
    if (this.report.errors.length > 0) {
      this.warn('PUBLISHING_WITH_ERRORS', 'Continuing despite validation errors');
    }
  }

  // ---- Stage 5: Optimize ----

  private async stage5_Optimize(): Promise<void> {
    const mediaDir = path.join(this.extractDir, 'media');
    const contentDir = path.join(this.extractDir, 'content');
    const dirs = [mediaDir, contentDir].filter((d) => fs.existsSync(d));
    let optimized = 0;
    for (const dir of dirs) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        const result = await optimizeMedia(filePath, this.opts.quality);
        if (result.optimized) optimized++;
      }
    }
    this.report.mediaCount = optimized;
  }

  // ---- Stage 6: Package ----

  private async stage6_Package(): Promise<void> {
    fs.mkdirSync(this.workDir, { recursive: true });

    // Skip packaging if validation has failed or validateOnly is set.
    if (this.report.errors.length > 0) return;
    if (this.opts.validateOnly) return;
    if (!this.runtimeCourse) {
      this.error(6, 'NO_COMPILED_COURSE', 'Cannot package — no compiled course IR');
      return;
    }

    try {
      const result = await assemblePackage(
        {
          course: this.runtimeCourse,
          courseIR: this.courseIR,
          extractDir: this.extractDir,
          workDir: this.workDir,
          mediaHashes: this.mediaHashes,
        },
        {
          standard: this.opts.standard,
          quality: this.opts.quality ?? 'medium',
          masteryScore: this.opts.masteryScore,
          title: this.runtimeCourse.metadata.title,
          author: this.runtimeCourse.metadata.author,
          language: this.runtimeCourse.metadata.language,
          lrsEndpoint: this.opts.lrsEndpoint,
          lrsAuth: this.opts.lrsAuth,
        },
        this.opts.outputPath
      );

      this.report.outputPath = this.opts.outputPath;
      this.report.checksum = result.checksum;
    } catch (err: unknown) {
      const e = err as Error;
      this.error(6, 'PACKAGE_FAILED', `Failed to assemble package: ${e.message}`, e.stack);
    }
  }

  // ---- Stage 7: Output ----

  private async stage7_Output(): Promise<void> {
    // If validation failed or validateOnly, no file was written — report stops here.
    if (this.report.errors.length > 0) return;
    if (this.opts.validateOnly) return;
    if (!this.report.outputPath) return;

    // Populate final output metadata now that the ZIP exists on disk.
    try {
      const stat = fs.statSync(this.report.outputPath);
      this.report.packageSize = stat.size;
    } catch (err: unknown) {
      const e = err as Error;
      this.error(7, 'OUTPUT_MISSING', `Output file not found after packaging: ${e.message}`);
    }
  }

  // ---- Report ----

  private buildReport(): PublishReport {
    const success = this.report.errors.length === 0;
    const report: PublishReport = {
      success,
      slideCount: this.report.slideCount,
      mediaCount: this.report.mediaCount,
      standard: this.report.standard,
      quality: this.report.quality,
      stageDurations: this.report.stageDurations,
      errors: this.report.errors,
      warnings: this.report.warnings,
      duration: Date.now() - this.startTime,
    };
    // Only include output metadata when a package was actually written.
    if (success && !this.opts.validateOnly && this.report.outputPath) {
      report.outputPath = this.report.outputPath;
      if (this.report.packageSize !== undefined) report.packageSize = this.report.packageSize;
      if (this.report.checksum) report.checksum = this.report.checksum;
    }
    return report;
  }
}

// ---- Convenience API ----

export async function publish(
  opts: PublishOptions,
  onProgress?: (stage: StageId, progress: number, msg?: string) => void
): Promise<PublishReport> {
  const pipeline = new PublishPipeline(opts);
  return pipeline.run(onProgress);
}

export function cancel(pipeline: PublishPipeline): void {
  pipeline.cancel();
}

// ---- SCORM Manifest Builder ----

export function buildManifest(
  projectId: string,
  title: string,
  standard: OutputStandard,
  slides: string[],
  files: string[],
  masteryScore?: number
): ImsManifest {
  return buildScormManifest(projectId, title, standard, slides, files, masteryScore);
}
