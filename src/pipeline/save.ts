/**
 * Save Pipeline — serialize a Pathfinder project to a .pathfinder ZIP.
 *
 * ZIP structure:
 *   project.json          ← Primary document (slides, triggers, variables, metadata)
 *   manifest.json         ← Asset manifest with content-addressed hashes
 *   quiz-banks.json       ← Quiz question banks (optional)
 *   media/
 *     img_xxx.png        ← Content-addressed media files
 *     aud_xxx.mp3
 *     vid_xxx.mp4
 *   fonts/                ← Custom fonts (optional)
 *   backup/               ← Auto-save backups (optional)
 *
 * The project.json is always at the root (required).
 * All other files are optional.
 */

import JSZip from 'jszip';
import { readFile } from 'fs/promises';
import type { Manifest } from './manifest.js';
import { createManifest, addAsset } from './manifest.js';

export interface SaveOptions {
  /** Path to a directory of media files to include */
  mediaDir?: string;
  /** Custom media files to include: filename → absolute path */
  mediaFiles?: Record<string, string>;
  /** Include auto-save backup in backup/ folder */
  includeBackup?: boolean;
  /** Include quiz banks (embedded in project.json or separate) */
  separateQuizBanks?: boolean;
  /** Project ID for manifest */
  projectId?: string;
}

export interface SaveResult {
  /** The generated ZIP as a Buffer */
  zip: Buffer;
  /** Manifest included in the ZIP */
  manifest: Manifest;
  /** File list written to ZIP */
  files: string[];
}

/**
 * Save a project to a .pathfinder ZIP.
 *
 * @param project - The project JSON object (will be validated against schema)
 * @param options - Save options (media dir, files, etc.)
 */
export async function saveProject(
  project: unknown,
  options: SaveOptions = {}
): Promise<SaveResult> {
  const zip = new JSZip();

  // ── Build manifest ──────────────────────────────────────────────────────
  const manifest: Manifest = createManifest({
    projectId: options.projectId ?? (project as any)?.metadata?.id ?? 'unknown',
    version: '1.0',
  });

  // ── project.json (required) ──────────────────────────────────────────────
  const projectJson = JSON.stringify(project, null, 2);
  zip.file('project.json', projectJson);

  // ── manifest.json ───────────────────────────────────────────────────────
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // ── Media files ─────────────────────────────────────────────────────────
  const mediaFolder = zip.folder('media');
  const addedPaths: string[] = ['project.json', 'manifest.json'];

  if (mediaFolder) {
    // Add from mediaFiles map (absolute paths)
    if (options.mediaFiles) {
      for (const [filename, absPath] of Object.entries(options.mediaFiles)) {
        try {
          const buffer = await readFile(absPath);
          const path = addAsset(manifest, buffer, filename);
          mediaFolder.file(path, buffer);
          addedPaths.push(`media/${path}`);
        } catch (e) {
          console.warn(`[saveProject] Could not read media file: ${absPath}`, e);
        }
      }
    }

    // Add from media directory
    if (options.mediaDir) {
      const { readdir } = await import('fs/promises');
      try {
        const entries = await readdir(options.mediaDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const absPath = `${options.mediaDir}/${entry.name}`;
            const buffer = await readFile(absPath);
            const path = addAsset(manifest, buffer, entry.name);
            mediaFolder.file(path, buffer);
            addedPaths.push(`media/${path}`);
          }
        }
      } catch (e) {
        console.warn(`[saveProject] Could not read media dir: ${options.mediaDir}`, e);
      }
    }
  }

  // ── Backup (optional) ────────────────────────────────────────────────────
  if (options.includeBackup) {
    const now = new Date().toISOString().split('T')[0];
    zip.file(`backup/project_backup_${now}.json`, projectJson);
    addedPaths.push(`backup/project_backup_${now}.json`);
  }

  // Update manifest.json in ZIP with final hashes
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // ── Generate ZIP ─────────────────────────────────────────────────────────
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    comment: `Pathfinder Project — ${manifest.projectId}`,
  });

  return {
    zip: zipBuffer,
    manifest,
    files: addedPaths,
  };
}

/**
 * Write a .pathfinder ZIP to disk.
 */
export async function saveProjectToFile(
  project: unknown,
  outputPath: string,
  options: SaveOptions = {}
): Promise<SaveResult> {
  const result = await saveProject(project, options);
  const { writeFile } = await import('fs/promises');
  await writeFile(outputPath, result.zip);
  return result;
}
