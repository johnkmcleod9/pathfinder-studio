/**
 * Asset Manifest — content-addressed asset tracking for .pathfinder ZIP.
 *
 * The manifest maps relative paths (e.g. "media/img_a3f9d2c1.png")
 * to content hashes (SHA-256) and metadata (size, MIME type, original filename).
 *
 * This enables:
 * - Deduplication: same content = same hash = only one copy in ZIP
 * - Integrity checking: verify content hasn't changed
 * - Migration: track which files need updating after schema changes
 */

import { createHash } from 'crypto';

export interface AssetEntry {
  path: string;          // Relative path in ZIP, e.g. "media/img_a3f9d2c1.png"
  hash: string;          // SHA-256 hex of content
  size: number;          // Bytes
  mimeType: string;      // e.g. "image/png"
  originalName: string;  // Original uploaded filename
  addedAt: string;       // ISO timestamp
}

export interface Manifest {
  version: string;       // Manifest schema version
  projectId: string;     // UUID of the project this manifest belongs to
  createdAt: string;
  modifiedAt: string;
  assets: Record<string, AssetEntry>;  // path → entry
}

export interface ManifestOptions {
  projectId: string;
  version?: string;
}

/** Infer MIME type from filename extension. */
export function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const MIME_TYPES: Record<string, string> = {
    // Images
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    webp: 'image/webp',
    svg:  'image/svg+xml',
    ico:  'image/x-icon',
    bmp:  'image/bmp',
    tiff: 'image/tiff',
    // Audio
    mp3:  'audio/mpeg',
    wav:  'audio/wav',
    ogg:  'audio/ogg',
    aac:  'audio/aac',
    m4a:  'audio/mp4',
    flac: 'audio/flac',
    // Video
    mp4:  'video/mp4',
    webm: 'video/webm',
    mov:  'video/quicktime',
    avi:  'video/x-msvideo',
    mkv:  'video/x-matroska',
    // Documents
    pdf:  'application/pdf',
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // Fonts
    otf:  'font/otf',
    ttf:  'font/ttf',
    woff: 'font/woff',
    woff2:'font/woff2',
    eot:  'application/vnd.ms-fontobject',
    // Data
    json: 'application/json',
    xml:  'application/xml',
    csv:  'text/csv',
    zip:  'application/zip',
    // Web
    js:   'application/javascript',
    css:  'text/css',
    html: 'text/html',
    htm:  'text/html',
  };
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/** Compute SHA-256 hash of a Buffer. */
export function contentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Content-addressable path: hashes the content and uses first 12 hex chars + extension. */
export function hashPath(buffer: Buffer, originalName: string): string {
  const hash = contentHash(buffer).slice(0, 12);
  const ext = originalName.split('.').pop() ?? '';
  const base = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${base}_${hash}.${ext}`;
}

/** Create an empty manifest. */
export function createManifest(options: ManifestOptions): Manifest {
  const now = new Date().toISOString();
  return {
    version: '1.0',
    projectId: options.projectId,
    createdAt: now,
    modifiedAt: now,
    assets: {},
  };
}

/** Add a buffer to the manifest, returning the content-addressed path. */
export function addAsset(manifest: Manifest, buffer: Buffer, originalName: string, mimeType?: string): string {
  const path = hashPath(buffer, originalName);
  if (manifest.assets[path]) return path; // Already present (dedup)

  manifest.assets[path] = {
    path,
    hash: contentHash(buffer),
    size: buffer.length,
    mimeType: mimeType ?? mimeFromFilename(originalName),
    originalName,
    addedAt: new Date().toISOString(),
  };
  manifest.modifiedAt = new Date().toISOString();
  return path;
}

/** Remove an asset by path. */
export function removeAsset(manifest: Manifest, path: string): void {
  if (manifest.assets[path]) {
    delete manifest.assets[path];
    manifest.modifiedAt = new Date().toISOString();
  }
}

/** Get all asset paths in the manifest. */
export function listAssets(manifest: Manifest): AssetEntry[] {
  return Object.values(manifest.assets);
}

/** Verify a buffer matches the manifest entry's hash. */
export function verifyAsset(manifest: Manifest, path: string, buffer: Buffer): boolean {
  const entry = manifest.assets[path];
  if (!entry) return false;
  return contentHash(buffer) === entry.hash;
}
