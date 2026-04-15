/**
 * Stage 5 (Optimize) — report wire-up tests
 *
 * The optimize stage runs media compression but never propagated savings
 * to the PublishReport.  These tests pin down the report contract:
 *   - mediaCount       = total media files processed (not just optimized)
 *   - mediaOptimized   = count of files that actually got smaller
 *   - mediaBytesSaved  = sum of (originalSize - optimizedSize) across all media
 *
 * We rely on the inline SVG optimizer in src/publish/optimizer.ts because
 * it works without external binaries (cwebp, ffmpeg, pngquant). The fixture
 * SVG has comments + whitespace + redundant XML decl that the optimizer
 * strips, guaranteeing measurable savings.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { publish } from '../../src/publish/index.js';

function tmpDir(): string {
  return fs.mkdtempSync('pathfinder-opt-test-');
}

const FAT_SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- This is a comment that the optimizer should strip -->
<!-- Yet another comment with padding, padding, padding, padding, padding -->
<svg xmlns="http://www.w3.org/2000/svg"
     width="100"
     height="100"
     viewBox="0 0 100 100">
  <metadata>
    <title>Wasteful metadata block that the optimizer removes</title>
    <description>Lots of pointless text here to make the file fat.</description>
  </metadata>
  <!-- Inline comment between elements -->
  <rect x="10"   y="10"   width="80"  height="80"  fill="#3366cc" />
  <circle cx="50"   cy="50"   r="30"   fill="#ffcc00" />
</svg>
`;

function makeProjectZip(svgs: Record<string, string>): string {
  const tmp = tmpDir();
  const zipPath = path.join(tmp, 'in.pathfinder');
  const zip = new AdmZip();
  const assets: Record<string, { path: string; size: number; mimeType: string }> = {};
  for (const name of Object.keys(svgs)) {
    assets[name] = { path: `media/${name}`, size: svgs[name].length, mimeType: 'image/svg+xml' };
    zip.addFile(`media/${name}`, Buffer.from(svgs[name], 'utf-8'));
  }
  zip.addFile(
    'project.json',
    Buffer.from(
      JSON.stringify({
        metadata: { id: 'opt-001', title: 'Optimize Test', author: 'T', language: 'en' },
        slides: [
          {
            id: 's1',
            title: 'One',
            background: { type: 'solid', color: '#FFF' },
            objects: { t1: { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 }, content: 'Hi' } },
            zOrder: ['t1'],
            triggers: [],
          },
        ],
        variables: {},
        navigation: { entrySlide: 's1', slides: ['s1'], showNavigationArrows: true, showProgressBar: false },
      }),
      'utf-8'
    )
  );
  zip.addFile(
    'manifest.json',
    Buffer.from(JSON.stringify({ version: '1.0', assets }), 'utf-8')
  );
  zip.writeZip(zipPath);
  return zipPath;
}

describe('Stage 5: Optimize — report wire-up', () => {
  it('reports total media count, not just optimized count', async () => {
    const tmp = tmpDir();
    const zipPath = makeProjectZip({
      'fat.svg': FAT_SVG,
      // A trivially-tiny SVG that the optimizer can't shrink further.
      'tiny.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    expect(report.success).toBe(true);
    expect(report.mediaCount).toBe(2);
  });

  it('reports mediaOptimized as count of files that got smaller', async () => {
    const tmp = tmpDir();
    const zipPath = makeProjectZip({
      'fat.svg': FAT_SVG,
      'tiny.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    expect(report.mediaOptimized).toBe(1);
  });

  it('reports mediaBytesSaved > 0 when the optimizer compressed something', async () => {
    const tmp = tmpDir();
    const zipPath = makeProjectZip({ 'fat.svg': FAT_SVG });
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    expect(report.mediaBytesSaved).toBeGreaterThan(0);
  });

  it('reports mediaBytesSaved as sum across multiple optimized files', async () => {
    const tmp = tmpDir();
    const zipPath = makeProjectZip({
      'fat-1.svg': FAT_SVG,
      'fat-2.svg': FAT_SVG,
    });
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    // Both copies start identical; both should compress to similar sizes.
    expect(report.mediaOptimized).toBe(2);
    // Savings from one fat svg, doubled, is what we'd expect.
    const singleSavings = FAT_SVG.length - 200; // generous lower bound
    expect(report.mediaBytesSaved).toBeGreaterThanOrEqual(singleSavings);
  });

  it('reports zero savings when no media is present', async () => {
    const tmp = tmpDir();
    const zipPath = makeProjectZip({});
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    expect(report.mediaCount).toBe(0);
    expect(report.mediaOptimized).toBe(0);
    expect(report.mediaBytesSaved).toBe(0);
  });

  it('reports zero savings when files cannot be compressed', async () => {
    const tmp = tmpDir();
    const zipPath = makeProjectZip({
      'tiny.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    const report = await publish({
      inputPath: zipPath,
      outputPath: path.join(tmp, 'out.zip'),
      standard: 'html5',
      quality: 'low',
    });
    expect(report.mediaCount).toBe(1);
    expect(report.mediaOptimized).toBe(0);
    expect(report.mediaBytesSaved).toBe(0);
  });
});
