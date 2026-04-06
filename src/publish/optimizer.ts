/**
 * Asset optimizer — compresses images, audio, and video for publish.
 * Quality presets control optimization intensity.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { QualityPreset } from './types.js';

const execAsync = promisify(exec);

export interface OptimizeResult {
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
  optimized: boolean;
  format?: string;
  error?: string;
}

// Quality preset targets
const QUALITY_PRESETS: Record<QualityPreset, MediaQualitySettings> = {
  low: {
    imageQuality: 70,      // JPEG/WebP quality 0-100
    imageMaxW: 1280,
    imageMaxH: 720,
    audioBitrate: '64k',   // MP3 bitrate
    videoCrf: 28,          // FFmpeg CRF (higher = more compression)
    videoScale: '854:480',
  },
  medium: {
    imageQuality: 82,
    imageMaxW: 1920,
    imageMaxH: 1080,
    audioBitrate: '128k',
    videoCrf: 25,
    videoScale: '1280:720',
  },
  high: {
    imageQuality: 90,
    imageMaxW: 2560,
    imageMaxH: 1440,
    audioBitrate: '192k',
    videoCrf: 23,
    videoScale: '1920:1080',
  },
};

interface MediaQualitySettings {
  imageQuality: number;
  imageMaxW: number;
  imageMaxH: number;
  audioBitrate: string;
  videoCrf: number;
  videoScale: string;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wave': '.wav',
  'audio/webm': '.webm',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

/**
 * Determine MIME type from file extension.
 */
export function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  for (const [mime, extension] of Object.entries(MIME_TO_EXT)) {
    if (extension === ext) return mime;
  }
  return 'application/octet-stream';
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/') && !mime.includes('svg');
}

function isAudio(mime: string): boolean {
  return mime.startsWith('audio/');
}

function isVideo(mime: string): boolean {
  return mime.startsWith('video/');
}

function isSvg(mime: string): boolean {
  return mime === 'image/svg+xml';
}

/**
 * Optimize a media file in place, replacing it with an optimized version.
 * Returns optimization stats.
 */
export async function optimizeMedia(
  filePath: string,
  preset: QualityPreset = 'medium'
): Promise<OptimizeResult> {
  const stats = fs.statSync(filePath);
  const originalSize = stats.size;
  const mime = mimeFromPath(filePath);
  const settings = QUALITY_PRESETS[preset];

  try {
    if (isSvg(mime)) {
      // SVGO optimization
      return optimizeSvg(filePath, originalSize);
    }
    if (isImage(mime)) {
      return optimizeImage(filePath, originalSize, mime, settings);
    }
    if (isAudio(mime)) {
      return optimizeAudio(filePath, originalSize, settings);
    }
    if (isVideo(mime)) {
      return optimizeVideo(filePath, originalSize, settings);
    }
    // Unknown type — skip
    return { originalSize, optimizedSize: originalSize, savedBytes: 0, optimized: false };
  } catch (err: unknown) {
    const e = err as Error;
    return { originalSize, optimizedSize: originalSize, savedBytes: 0, optimized: false, error: e.message };
  }
}

async function optimizeSvg(filePath: string, originalSize: number): Promise<OptimizeResult> {
  // Basic SVG optimization: remove comments, whitespace, metadata
  const content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  let optimized = content
    // Remove XML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove XML declaration if redundant
    .replace(/<\?xml[^>]+\?>\s*/g, '')
    // Remove metadata elements
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    // Collapse whitespace
    .replace(/>\s+</g, '><')
    .trim();

  if (optimized.length < original.length) {
    fs.writeFileSync(filePath, optimized, 'utf-8');
  }

  const optimizedSize = fs.statSync(filePath).size;
  return {
    originalSize,
    optimizedSize,
    savedBytes: originalSize - optimizedSize,
    optimized: optimizedSize < originalSize,
    format: 'svg',
  };
}

async function optimizeImage(
  filePath: string,
  originalSize: number,
  mime: string,
  settings: MediaQualitySettings
): Promise<OptimizeResult> {
  const ext = path.extname(filePath).toLowerCase();
  const tmpPath = filePath + '.opt.tmp';

  try {
    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      // MozJPEG via cjpeg or use libjpeg
      // Fall back to no-op if tools not available
      return { originalSize, optimizedSize: originalSize, savedBytes: 0, optimized: false };
    }

    if (mime === 'image/png') {
      // Try oxipng or pngquant
      try {
        await execAsync(
          `pngquant --quality=${settings.imageQuality - 30}-${settings.imageQuality} --output "${tmpPath}" --force "${filePath}" 2>/dev/null || true`,
          { timeout: 30000 }
        );
        if (fs.existsSync(tmpPath)) {
          const optimizedSize = fs.statSync(tmpPath).size;
          if (optimizedSize < originalSize) {
            fs.renameSync(tmpPath, filePath);
            return {
              originalSize,
              optimizedSize,
              savedBytes: originalSize - optimizedSize,
              optimized: true,
              format: 'png',
            };
          } else {
            fs.unlinkSync(tmpPath);
          }
        }
      } catch {
        // pngquant not available
      }
      return { originalSize, optimizedSize: originalSize, savedBytes: 0, optimized: false };
    }

    if (mime === 'image/webp') {
      // cwebp for WebP optimization
      try {
        await execAsync(
          `cwebp -q ${settings.imageQuality} "${filePath}" -o "${tmpPath}" 2>/dev/null || true`,
          { timeout: 30000 }
        );
        if (fs.existsSync(tmpPath)) {
          const optimizedSize = fs.statSync(tmpPath).size;
          if (optimizedSize < originalSize) {
            fs.renameSync(tmpPath, filePath);
            return {
              originalSize,
              optimizedSize,
              savedBytes: originalSize - optimizedSize,
              optimized: true,
              format: 'webp',
            };
          } else {
            fs.unlinkSync(tmpPath);
          }
        }
      } catch {
        // cwebp not available
      }
    }

    return { originalSize, optimizedSize: originalSize, savedBytes: 0, optimized: false };
  } catch (err: unknown) {
    const e = err as Error;
    return { originalSize, optimizedSize: originalSize, savedBytes: 0, optimized: false, error: e.message };
  }
}

async function optimizeAudio(
  filePath: string,
  originalSize: number,
  settings: MediaQualitySettings
): Promise<OptimizeResult> {
  // Try FFmpeg for audio transcoding
  const tmpPath = filePath + '.opt.tmp';
  const ext = path.extname(filePath).toLowerCase();
  const targetExt = ext === '.mp3' ? '.mp3' : '.mp3';

  try {
    await execAsync(
      `ffmpeg -y -i "${filePath}" -b:a ${settings.audioBitrate} -ar 44100 "${tmpPath}" 2>/dev/null`,
      { timeout: 60000 }
    );
    if (fs.existsSync(tmpPath)) {
      const optimizedSize = fs.statSync(tmpPath).size;
      if (optimizedSize < originalSize) {
        fs.renameSync(tmpPath, filePath);
        return {
          originalSize,
          optimizedSize,
          savedBytes: originalSize - optimizedSize,
          optimized: true,
          format: 'mp3',
        };
      } else {
        fs.unlinkSync(tmpPath);
      }
    }
  } catch {
    // FFmpeg not available
  }

  return { originalSize, optimizedSize: originalSize, savedBytes: 0, optimized: false };
}

async function optimizeVideo(
  filePath: string,
  originalSize: number,
  settings: MediaQualitySettings
): Promise<OptimizeResult> {
  // FFmpeg H.264 transcoding with quality preset
  const tmpPath = filePath + '.opt.tmp';
  const ext = path.extname(filePath).toLowerCase();

  try {
    await execAsync(
      `ffmpeg -y -i "${filePath}" -c:v libx264 -crf ${settings.videoCrf} -vf "scale=${settings.videoScale}:force_original_aspect_ratio=decrease,pad=${settings.videoScale}:(ow-iw)/2:(oh-ih)/2" -c:a aac -b:a 128k -ar 44100 -movflags +faststart "${tmpPath}" 2>/dev/null`,
      { timeout: 300000 }
    );
    if (fs.existsSync(tmpPath)) {
      const optimizedSize = fs.statSync(tmpPath).size;
      if (optimizedSize < originalSize) {
        fs.renameSync(tmpPath, filePath);
        return {
          originalSize,
          optimizedSize,
          savedBytes: originalSize - optimizedSize,
          optimized: true,
          format: 'mp4',
        };
      } else {
        fs.unlinkSync(tmpPath);
      }
    }
  } catch {
    // FFmpeg not available
  }

  return { originalSize, optimizedSize: originalSize, savedBytes: 0, optimized: false };
}

/**
 * Subset a font file to only include used glyphs.
 * Reduces font file size significantly for Latin-only courses.
 */
export async function subsetFont(
  fontPath: string,
  usedGlyphs: Set<string>
): Promise<{ success: boolean; error?: string }> {
  // pyftsubset from fonttools
  const glyphsArg = Array.from(usedGlyphs).join('');
  try {
    await execAsync(
      `pyftsubset "${fontPath}" --text="${glyphsArg}" --output-file="${fontPath}.subset" 2>/dev/null || true`
    );
    const subsetPath = fontPath + '.subset';
    if (fs.existsSync(subsetPath)) {
      const origSize = fs.statSync(fontPath).size;
      const subsetSize = fs.statSync(subsetPath).size;
      if (subsetSize < origSize) {
        fs.renameSync(subsetPath, fontPath);
        return { success: true };
      }
      fs.unlinkSync(subsetPath);
    }
  } catch {
    // fonttools not available
  }
  return { success: false, error: 'pyftsubset not available' };
}
