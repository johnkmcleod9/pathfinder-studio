/**
 * Package assembler — assembles the final ZIP with imsmanifest.xml.
 * Handles SCORM 1.2, SCORM 2004, xAPI, and HTML5-only outputs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
// @ts-ignore — adm-zip has no types published
import AdmZip from 'adm-zip';
import {
  OutputStandard,
  QualityPreset,
  RuntimeCourse,
  RuntimeSlide,
  RuntimeObject,
} from './types.js';
import {
  buildScormManifest,
  renderManifestXml,
  SCORM_2004_ADAPTER,
  SCORM_12_ADAPTER,
  XAPI_ADAPTER,
} from './scorm-manifest.js';
import { BROWSER_RUNTIME } from './browser-runtime.js';
import { generateTinCanXml } from './tincan.js';

export interface PackagerOptions {
  standard: OutputStandard;
  quality: QualityPreset;
  masteryScore?: number;
  title: string;
  author: string;
  language?: string;
  lrsEndpoint?: string;
  lrsAuth?: string;
}

export interface PackagerContext {
  course: RuntimeCourse;
  courseIR: unknown;
  extractDir: string;
  workDir: string;
  mediaHashes: Map<string, string>; // contentHash → original filename
}

/**
 * Assemble the complete output package.
 */
export async function assemblePackage(
  ctx: PackagerContext,
  opts: PackagerOptions,
  outputPath: string
): Promise<{ checksum: string; fileCount: number }> {
  const { extractDir, workDir, course, mediaHashes } = ctx;
  const zip = new AdmZip();

  // --- Shared: course.json ---
  zip.addFile(
    'course.json',
    Buffer.from(JSON.stringify(course), 'utf-8'),
    'Compiled course data'
  );

  // --- Runtime engine ---
  // Self-contained IIFE that installs `window.PathfinderRuntime`.
  // Tested independently in tests/publish/browser-runtime.test.ts.
  zip.addFile(
    'pathfinder-runtime.js',
    Buffer.from(BROWSER_RUNTIME, 'utf-8'),
    'Pathfinder browser runtime'
  );
  zip.addFile(
    'pathfinder-runtime.css',
    Buffer.from(BROWSER_RUNTIME_CSS, 'utf-8'),
    'Runtime CSS'
  );

  // --- LMS adapters ---
  if (opts.standard === 'scorm2004') {
    zip.addFile('lms/scorm-2004-adapter.js', Buffer.from(SCORM_2004_ADAPTER, 'utf-8'));
    zip.addFile('lms/suspend-data-manager.js', Buffer.from(SUSPEND_MANAGER, 'utf-8'));
  } else if (opts.standard === 'scorm12') {
    zip.addFile('lms/scorm-12-adapter.js', Buffer.from(SCORM_12_ADAPTER, 'utf-8'));
    zip.addFile('lms/suspend-data-manager.js', Buffer.from(SUSPEND_MANAGER, 'utf-8'));
  } else if (opts.standard === 'xapi') {
    zip.addFile('lms/xapi-adapter.js', Buffer.from(XAPI_ADAPTER, 'utf-8'));
    zip.addFile('lms/statement-batcher.js', Buffer.from(STATEMENT_BATCHER, 'utf-8'));
  }

  // --- Player shell ---
  zip.addFile(
    'player/player-shell.html',
    Buffer.from(buildPlayerShell(opts.standard, {
      lrsEndpoint: opts.lrsEndpoint,
      lrsAuth: opts.lrsAuth,
      masteryScore: opts.masteryScore,
    }), 'utf-8')
  );
  zip.addFile(
    'player/player.css',
    Buffer.from(buildPlayerCSS(), 'utf-8')
  );
  zip.addFile(
    'player/player-i18n.json',
    // JSON.stringify's 2nd arg is a replacer function/array, not an
    // encoding — passing 'utf-8' here used to be silently ignored
    // (TS now flags it). We don't need a replacer; pass null.
    Buffer.from(JSON.stringify(buildI18n(), null, 2), 'utf-8')
  );

  // --- SCORM manifest ---
  if (opts.standard === 'scorm2004' || opts.standard === 'scorm12') {
    const slideIds = course.navigation?.slides ?? [];
    const files = [
      'course.json',
      'pathfinder-runtime.js',
      'pathfinder-runtime.css',
      'player/player-shell.html',
      'player/player.css',
      'player/player-i18n.json',
    ];

    const manifest = buildScormManifest(
      course.metadata?.id ?? 'course',
      opts.title,
      opts.standard,
      slideIds,
      files,
      opts.masteryScore
    );

    zip.addFile('imsmanifest.xml', Buffer.from(renderManifestXml(manifest, opts.standard), 'utf-8'));

    // SCORM metadata
    zip.addFile(
      'metadata.xml',
      Buffer.from(buildMetadataXml(opts.title, opts.author, opts.language ?? 'en'), 'utf-8')
    );

    // Launch file
    zip.addFile(
      'launch.html',
      Buffer.from(buildLaunchHtml(opts.standard), 'utf-8')
    );
  }

  // --- HTML5-only entry point ---
  if (opts.standard === 'html5') {
    zip.addFile('index.html', Buffer.from(buildHtml5Index(), 'utf-8'));
  }

  // --- xAPI package descriptor ---
  if (opts.standard === 'xapi') {
    // Many LRSes (Watershed, SCORM Cloud, Yet Analytics) read tincan.xml
    // at the package root to register the activity. Without it the .zip
    // imports as opaque files and never reports statements.
    const courseId = course.metadata?.id ?? 'course';
    // Per the xAPI spec the activity id must be an absolute IRI. If the
    // course id already looks like a URL, use it; otherwise mint one
    // under a stable pathfinder.local namespace so LRSes don't reject
    // the package.
    const isIri = /^[a-z][a-z0-9+.-]*:/i.test(courseId);
    const activityId = isIri
      ? courseId
      : `https://pathfinder.local/courses/${encodeURIComponent(courseId)}`;
    const slides = (course.slides ?? []).map((s) => ({
      id: s.id,
      title: s.title || s.id,
    }));
    zip.addFile(
      'tincan.xml',
      Buffer.from(
        generateTinCanXml({
          activityId,
          title: opts.title,
          launch: 'index.html',
          description: opts.author ? `Authored by ${opts.author}` : undefined,
          language: opts.language ?? 'en-US',
          slides,
        }),
        'utf-8'
      )
    );
    // xAPI packages also need a launch entry so an LRS or content host
    // can open the .zip directly. Mirror the html5 path but include the
    // xAPI adapter wiring.
    zip.addFile('index.html', Buffer.from(buildXapiIndex(), 'utf-8'));
  }

  // --- Copy media assets ---
  const mediaDir = path.join(extractDir, 'media');
  const contentDir = path.join(extractDir, 'content');
  for (const dir of [mediaDir, contentDir]) {
    if (fs.existsSync(dir)) {
      copyDirRecursive(zip, dir, 'media', mediaHashes);
    }
  }

  // --- Copy slides (compiled) ---
  const slidesDir = path.join(workDir, 'content');
  if (fs.existsSync(slidesDir)) {
    copyDirRecursive(zip, slidesDir, 'content', new Map());
  } else {
    // Generate stub slide HTML files
    const slides = course.slides ?? [];
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const html = buildSlideHtml(slide, course, opts.standard);
      zip.addFile(`content/slide_${i + 1}.html`, Buffer.from(html, 'utf-8'));
    }
  }

  // --- Write ZIP ---
  zip.writeZip(outputPath);

  const checksum = computeChecksum(outputPath);
  const entries = zip.getEntries();
  return { checksum, fileCount: entries.length };
}

function copyDirRecursive(
  zip: AdmZip,
  srcDir: string,
  destPrefix: string,
  renameMap: Map<string, string>
): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(zip, srcPath, `${destPrefix}/${entry.name}`, renameMap);
    } else {
      const destName = renameMap.get(entry.name) ?? entry.name;
      const destPath = `${destPrefix}/${destName}`;
      zip.addFile(destPath, fs.readFileSync(srcPath));
    }
  }
}

// ---- HTML builders ----

interface PlayerShellConfig {
  lrsEndpoint?: string;
  lrsAuth?: string;
  masteryScore?: number;
}

function buildPlayerShell(standard: OutputStandard, cfg: PlayerShellConfig = {}): string {
  // Build the JSON config that gets baked into the shell.  Only emit defined
  // values so the resulting object doesn't leak undefineds into the JSON
  // serializer (which would drop them anyway, but explicitness is clearer).
  const baked: Record<string, unknown> = {};
  if (cfg.lrsEndpoint !== undefined) baked['lrsEndpoint'] = cfg.lrsEndpoint;
  if (cfg.lrsAuth !== undefined) baked['lrsAuth'] = cfg.lrsAuth;
  if (cfg.masteryScore !== undefined) baked['masteryScore'] = cfg.masteryScore;
  const configJson = jsonForScript(baked);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pathfinder Course</title>
  <link rel="stylesheet" href="player.css">
  <link rel="stylesheet" href="../pathfinder-runtime.css">
</head>
<body>
  <div id="pathfinder-course"></div>
  <div id="pathfinder-nav">
    <button id="btn-prev" aria-label="Previous">&#8592;</button>
    <span id="slide-counter"></span>
    <button id="btn-next" aria-label="Next">&#8594;</button>
  </div>
  <script src="../pathfinder-runtime.js"></script>
  <script src="../lms/${standard === 'scorm2004' ? 'scorm-2004' : standard === 'scorm12' ? 'scorm-12' : 'xapi'}-adapter.js"></script>
  <script>
    var PATHFINDER_BAKED_CONFIG = ${configJson};
    var config = Object.assign({}, PATHFINDER_BAKED_CONFIG, window.PATHFINDER_CONFIG || {});
    var courseData = null;
    var runtime = null;

    function loadCourse() {
      return fetch('../course.json')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          courseData = data;
          var lmsAdapter = null;
          if ('${standard}' === 'scorm2004' && window.SCORM2004Adapter) {
            window.SCORM2004Adapter.Initialize();
            lmsAdapter = window.SCORM2004Adapter;
          } else if ('${standard}' === 'scorm12' && window.SCORM12Adapter) {
            window.SCORM12Adapter.Initialize();
            lmsAdapter = window.SCORM12Adapter;
          } else if ('${standard}' === 'xapi' && window.XAPIAdapter) {
            window.XAPIAdapter.configure({
              endpoint: config.lrsEndpoint || '',
              auth: config.lrsAuth || '',
              activityId: courseData.metadata?.id || 'course'
            });
            lmsAdapter = window.XAPIAdapter;
            window.XAPIAdapter.initialized();
          }
          runtime = new PathfinderRuntime({
            course: courseData,
            lmsAdapter: lmsAdapter || new StandaloneAdapter(),
            container: document.getElementById('pathfinder-course')
          });
          runtime.start();
          setupNav(runtime);
        });
    }

    function setupNav(runtime) {
      document.getElementById('btn-prev').onclick = function() { runtime.navigatePrev(); };
      document.getElementById('btn-next').onclick = function() { runtime.navigateNext(); };
      runtime.on('slidechange', function(slideId, idx, total) {
        document.getElementById('slide-counter').textContent = (idx + 1) + ' / ' + total;
      });
      // Bind exit hooks so session_time + Terminate are pushed
      // even when the learner just closes the tab.  We bind both
      // beforeunload and visibilitychange because some browsers
      // (mobile Safari especially) skip beforeunload on tab swipe.
      var doTerminate = function() { try { runtime.terminate(); } catch (_) {} };
      window.addEventListener('beforeunload', doTerminate);
      window.addEventListener('pagehide', doTerminate);
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') doTerminate();
      });
    }

    window.addEventListener('load', loadCourse);
  </script>
</body>
</html>`;
}

function buildPlayerCSS(): string {
  // Player chrome shares the runtime design tokens so the nav bar
  // doesn't clash with the stage. Colors are duplicated as literal
  // values here because this stylesheet loads before the runtime CSS
  // and can't rely on :root custom properties being defined yet.
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  height: 100%;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif;
  background: #F4F4ED;
  color: #1A1A1F;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
#pathfinder-course {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 72px;
}
#pathfinder-nav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 16px 24px;
  background: rgba(26, 26, 31, 0.92);
  color: #FFFFFF;
  z-index: 100;
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  backdrop-filter: saturate(180%) blur(16px);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
#pathfinder-nav button {
  background: #3B3B98;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: background 120ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
#pathfinder-nav button:hover { background: #2D2D7A; }
#pathfinder-nav button:focus-visible {
  outline: 3px solid rgba(75, 99, 232, 0.55);
  outline-offset: 2px;
}
#pathfinder-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
#slide-counter {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
`;
}

function buildI18n(): Record<string, Record<string, string>> {
  return {
    en: {
      next: 'Next',
      previous: 'Previous',
      submit: 'Submit',
      close: 'Close',
      menu: 'Menu',
      progress: 'Slide {current} of {total}',
      correct: 'Correct!',
      incorrect: 'Incorrect',
      complete: 'Course Complete',
      passed: 'You passed!',
      failed: 'You did not pass. Please try again.',
    },
  };
}

function buildLaunchHtml(_standard: OutputStandard): string {
  // The launch wrapper is identical for SCORM 1.2 and 2004 — the LMS
  // loads it, then we hand off to the player shell which handles the
  // standard-specific adapter discovery.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Course Launch</title>
  <script>
    window.onload = function() {
      // LMS loads this — redirect to player
      window.location.href = 'player/player-shell.html';
    };
  </script>
</head>
<body>
  <p>Loading course...</p>
</body>
</html>`;
}

function buildHtml5Index(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pathfinder Course</title>
  <link rel="stylesheet" href="pathfinder-runtime.css">
  <link rel="stylesheet" href="player/player.css">
</head>
<body>
  <div id="pathfinder-course"></div>
  <div id="pathfinder-nav">
    <button id="btn-prev">&#8592; Previous</button>
    <span id="slide-counter"></span>
    <button id="btn-next">Next &#8594;</button>
  </div>
  <script src="pathfinder-runtime.js"></script>
  <script>
    var runtime = null;
    fetch('course.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        runtime = new PathfinderRuntime({
          course: data,
          lmsAdapter: {}, // Standalone — no LMS
          container: document.getElementById('pathfinder-course')
        });
        runtime.start();
        runtime.on('slidechange', function(_, idx, total) {
          document.getElementById('slide-counter').textContent = (idx + 1) + ' / ' + total;
        });
        document.getElementById('btn-prev').onclick = function() { runtime.navigatePrev(); };
        document.getElementById('btn-next').onclick = function() { runtime.navigateNext(); };
        var doTerminate = function() { try { runtime.terminate(); } catch (_) {} };
        window.addEventListener('beforeunload', doTerminate);
        window.addEventListener('pagehide', doTerminate);
      });
  </script>
</body>
</html>`;
}

function buildXapiIndex(): string {
  // xAPI launch entry — wires the XAPIAdapter so statements flow to the
  // configured LRS. The endpoint + auth come from window.PATHFINDER_CONFIG
  // which the host page (or an LRS launch redirect) is expected to set.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pathfinder Course</title>
  <link rel="stylesheet" href="pathfinder-runtime.css">
  <link rel="stylesheet" href="player/player.css">
</head>
<body>
  <div id="pathfinder-course"></div>
  <div id="pathfinder-nav">
    <button id="btn-prev">&#8592; Previous</button>
    <span id="slide-counter"></span>
    <button id="btn-next">Next &#8594;</button>
  </div>
  <script src="pathfinder-runtime.js"></script>
  <script src="lms/xapi-adapter.js"></script>
  <script>
    var config = window.PATHFINDER_CONFIG || {};
    var runtime = null;
    fetch('course.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var lmsAdapter = null;
        if (window.XAPIAdapter) {
          window.XAPIAdapter.configure({
            endpoint: config.lrsEndpoint || (data.lms && data.lms.lrsEndpoint) || '',
            auth: config.lrsAuth || (data.lms && data.lms.lrsAuth) || '',
            activityId: (data.metadata && data.metadata.id) || 'course'
          });
          window.XAPIAdapter.initialized();
          lmsAdapter = window.XAPIAdapter;
        }
        runtime = new PathfinderRuntime({
          course: data,
          lmsAdapter: lmsAdapter || {},
          container: document.getElementById('pathfinder-course')
        });
        runtime.start();
        runtime.on('slidechange', function(slideId, idx, total) {
          document.getElementById('slide-counter').textContent = (idx + 1) + ' / ' + total;
          if (window.XAPIAdapter) window.XAPIAdapter.experienced(slideId);
        });
        runtime.on('quizcomplete', function(score) {
          if (window.XAPIAdapter) {
            if (score.passed) window.XAPIAdapter.passed(score.percent / 100);
            else window.XAPIAdapter.failed(score.percent / 100);
          }
        });
        runtime.on('coursecomplete', function() {
          if (window.XAPIAdapter) window.XAPIAdapter.completed();
        });
        runtime.on('sessionend', function(payload) {
          if (window.XAPIAdapter) window.XAPIAdapter.terminate();
        });
        document.getElementById('btn-prev').onclick = function() { runtime.navigatePrev(); };
        document.getElementById('btn-next').onclick = function() { runtime.navigateNext(); };
        var doTerminate = function() { try { runtime.terminate(); } catch (_) {} };
        window.addEventListener('beforeunload', doTerminate);
        window.addEventListener('pagehide', doTerminate);
      });
  </script>
</body>
</html>`;
}

function buildSlideHtml(slide: RuntimeSlide, course: RuntimeCourse, _standard: OutputStandard): string {
  const bg = slide.background ?? { type: 'solid', color: '#FFFFFF' };
  const bgStyle = bg.type === 'solid'
    ? `background-color: ${bg.color ?? '#FFFFFF'}`
    : bg.type === 'gradient'
    ? `background: linear-gradient(${bg.angle ?? 0}deg, ${(bg.stops ?? []).map(s => s.color).join(', ')})`
    : '';

  const objectsHtml = (slide.objects ?? [])
    .map(obj => buildObjectHtml(obj))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${course.metadata?.language ?? 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(slide.title ?? 'Slide')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${course.canvas?.width ?? 1280}px;
      height: ${course.canvas?.height ?? 720}px;
      ${bgStyle}
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow: hidden;
      position: relative;
    }
  </style>
</head>
<body>
${objectsHtml}
</body>
</html>`;
}

function buildObjectHtml(obj: RuntimeObject): string {
  const [x, y, w, h] = obj.rect ?? [0, 0, 100, 100];
  switch (obj.type) {
    case 'text':
      return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${objectStyle(obj)}">${obj.content ?? ''}</div>`;
    case 'image':
      return `<img src="${obj.src ?? ''}" alt="${escapeAttr(obj.altText ?? '')}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;object-fit:contain" loading="lazy"/>`;
    case 'shape':
      return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${objectStyle(obj)}"></div>`;
    case 'button':
      return `<button style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${objectStyle(obj)}" data-object-id="${obj.id}">${obj.content ?? ''}</button>`;
    case 'video':
      return `<video src="${obj.src ?? ''}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px" controls preload="none"></video>`;
    case 'audio':
      return `<audio src="${obj.src ?? ''}" preload="none" style="display:none"></audio>`;
    default:
      return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:1px dashed #ccc" data-object-id="${obj.id}"></div>`;
  }
}

function objectStyle(obj: RuntimeObject): string {
  const s = obj.style ?? {};
  const styles: string[] = [];
  if (s['fontSize']) styles.push(`font-size: ${s['fontSize']}px`);
  if (s['fontFamily']) styles.push(`font-family: ${String(s['fontFamily'])}`);
  if (s['fontWeight']) styles.push(`font-weight: ${String(s['fontWeight'])}`);
  if (s['color']) styles.push(`color: ${String(s['color'])}`);
  if (s['textAlign']) styles.push(`text-align: ${String(s['textAlign'])}`);
  if (s['backgroundColor']) styles.push(`background-color: ${String(s['backgroundColor'])}`);
  if (s['lineHeight']) styles.push(`line-height: ${String(s['lineHeight'])}`);
  if (s['opacity'] !== undefined) styles.push(`opacity: ${Number(s['opacity'])}`);
  return styles.join(';');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Serialize a value as JSON safe for embedding inside an inline <script> tag.
 * Escapes `<`, `>`, line separators, and Unicode line/paragraph separators
 * which are valid in JSON strings but break out of HTML script context or
 * trip the JS lexer. Mirrors the convention used by serialize-javascript /
 * Next.js __NEXT_DATA__.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildMetadataXml(title: string, author: string, language: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<lom xmlns="http://www.imsglobal.org/xsd/imsmd_v1p2">
  <general>
    <identifier>${escapeXml(title)}</identifier>
    <title>
      <langstring xml:lang="${language}">${escapeXml(title)}</langstring>
    </title>
    <language>${language}</language>
  </general>
  <life-cycle>
    <contribute>
      <role>
        <value>author</value>
      </role>
      <entity>
        <vcard>BEGIN:VCARD\nFN:${escapeXml(author)}\nEND:VCARD</vcard>
      </entity>
    </contribute>
  </life-cycle>
</lom>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function computeChecksum(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

// ---- Runtime CSS ----
//
// Design language for every published Pathfinder course. Tokens live
// at :root so themes can override per-deployment by setting a subset
// of custom properties on a parent element. The defaults are tuned to
// feel premium out of the box — typography, color, spacing, motion —
// so authors don't have to specify styles per object to get a polished
// course. Inline `obj.style` overrides in project.json still apply on
// top via _applyStyle() in the runtime.

const BROWSER_RUNTIME_CSS = `/* Pathfinder Runtime CSS — Design Language v1 */

:root {
  /* ---- Color: warm, calm, trustworthy. Works for corporate,
         government, healthcare training. Override at theme layer. ---- */
  --pf-color-bg: #FAFAF7;
  --pf-color-surface: #FFFFFF;
  --pf-color-surface-muted: #F4F4ED;
  --pf-color-ink: #1A1A1F;
  --pf-color-ink-muted: #5A5A66;
  --pf-color-ink-soft: #8A8A95;
  --pf-color-border: #E8E8E0;
  --pf-color-border-strong: #C8C8C0;
  --pf-color-primary: #3B3B98;
  --pf-color-primary-hover: #2D2D7A;
  --pf-color-primary-ink: #FFFFFF;
  --pf-color-primary-soft: #EEEEFA;
  --pf-color-accent: #E07856;
  --pf-color-accent-soft: #FBEDE5;
  --pf-color-success: #2D7D5A;
  --pf-color-success-soft: #E6F3EC;
  --pf-color-danger: #B83D3D;
  --pf-color-danger-soft: #FBECEC;
  --pf-color-focus-ring: rgba(75, 99, 232, 0.35);

  /* ---- Typography ----
     Inter is the preferred face; if it isn't installed, a solid
     system stack preserves the feel without shipping a font file. */
  --pf-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --pf-font-serif: 'Fraunces', 'Source Serif Pro', Georgia, 'Times New Roman', serif;
  --pf-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;

  --pf-text-xs: 0.75rem;
  --pf-text-sm: 0.875rem;
  --pf-text-base: 1rem;
  --pf-text-lg: 1.125rem;
  --pf-text-xl: 1.375rem;
  --pf-text-2xl: 1.75rem;
  --pf-text-3xl: 2.25rem;
  --pf-text-4xl: 3rem;

  --pf-leading-tight: 1.2;
  --pf-leading-snug: 1.35;
  --pf-leading-normal: 1.55;
  --pf-leading-relaxed: 1.7;
  --pf-tracking-tight: -0.015em;
  --pf-tracking-normal: 0;

  /* ---- Spacing: 4px base grid ---- */
  --pf-space-1: 4px;
  --pf-space-2: 8px;
  --pf-space-3: 12px;
  --pf-space-4: 16px;
  --pf-space-5: 24px;
  --pf-space-6: 32px;
  --pf-space-7: 48px;
  --pf-space-8: 64px;

  /* ---- Radii ---- */
  --pf-radius-sm: 4px;
  --pf-radius-md: 8px;
  --pf-radius-lg: 12px;
  --pf-radius-xl: 20px;
  --pf-radius-pill: 999px;

  /* ---- Shadows: subtle, warm-toned ---- */
  --pf-shadow-sm: 0 1px 2px rgba(22, 22, 26, 0.06), 0 1px 3px rgba(22, 22, 26, 0.08);
  --pf-shadow-md: 0 4px 10px rgba(22, 22, 26, 0.08), 0 2px 4px rgba(22, 22, 26, 0.06);
  --pf-shadow-lg: 0 16px 40px rgba(22, 22, 26, 0.12), 0 4px 12px rgba(22, 22, 26, 0.08);

  /* ---- Motion ---- */
  --pf-motion-fast: 120ms;
  --pf-motion-normal: 200ms;
  --pf-motion-slow: 360ms;
  --pf-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --pf-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

/* ---- Slide container ---- */
.pf-slide {
  margin: 0 auto;
  position: relative;
  overflow: hidden;
  font-family: var(--pf-font-sans);
  color: var(--pf-color-ink);
  line-height: var(--pf-leading-normal);
  font-size: var(--pf-text-base);
  background: var(--pf-color-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'cv11', 'ss01', 'ss03';
}
.pf-slide *, .pf-slide *::before, .pf-slide *::after { box-sizing: border-box; }
.pf-slide [data-object-id] { box-sizing: border-box; }

/* ---- Focus visible: accessible across every interactive element ---- */
.pf-slide :focus-visible {
  outline: 3px solid var(--pf-color-focus-ring);
  outline-offset: 2px;
  border-radius: var(--pf-radius-sm);
}

/* ---- Text object: rich typography by default ---- */
.pf-object-text {
  font-size: var(--pf-text-lg);
  line-height: var(--pf-leading-normal);
  color: var(--pf-color-ink);
}
.pf-object-text h1, .pf-object-text h2, .pf-object-text h3, .pf-object-text h4 {
  font-weight: 700;
  letter-spacing: var(--pf-tracking-tight);
  line-height: var(--pf-leading-tight);
  color: var(--pf-color-ink);
}
.pf-object-text h1 { font-size: var(--pf-text-4xl); }
.pf-object-text h2 { font-size: var(--pf-text-3xl); }
.pf-object-text h3 { font-size: var(--pf-text-2xl); }
.pf-object-text h4 { font-size: var(--pf-text-xl); }
.pf-object-text h1 + *, .pf-object-text h2 + *, .pf-object-text h3 + *, .pf-object-text h4 + * {
  margin-top: var(--pf-space-3);
}
.pf-object-text p + p { margin-top: var(--pf-space-3); }
.pf-object-text strong, .pf-object-text b { font-weight: 600; color: var(--pf-color-ink); }
.pf-object-text em, .pf-object-text i { font-style: italic; }
.pf-object-text a {
  color: var(--pf-color-primary);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
.pf-object-text a:hover { color: var(--pf-color-primary-hover); }
.pf-object-text ul, .pf-object-text ol { padding-left: var(--pf-space-5); }
.pf-object-text li + li { margin-top: var(--pf-space-1); }

/* ---- Button object: the primary CTA treatment ---- */
.pf-object-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--pf-space-2);
  padding: 0 var(--pf-space-5);
  background: var(--pf-color-primary);
  color: var(--pf-color-primary-ink);
  border: none;
  border-radius: var(--pf-radius-md);
  font-family: inherit;
  font-size: var(--pf-text-base);
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: var(--pf-shadow-sm);
  transition: background var(--pf-motion-fast) var(--pf-ease-out),
              transform var(--pf-motion-fast) var(--pf-ease-out),
              box-shadow var(--pf-motion-fast) var(--pf-ease-out);
}
.pf-object-button:hover { background: var(--pf-color-primary-hover); box-shadow: var(--pf-shadow-md); }
.pf-object-button:active { transform: translateY(1px); box-shadow: var(--pf-shadow-sm); }
.pf-object-button:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

/* ---- Shape object: a soft surface card by default ---- */
.pf-object-shape {
  background: var(--pf-color-surface);
  border: 1px solid var(--pf-color-border);
  border-radius: var(--pf-radius-lg);
}

/* ---- Image object ---- */
.pf-object-image {
  object-fit: contain;
  border-radius: var(--pf-radius-md);
}

/* ---- Media (video/audio) ---- */
.pf-object-video, .pf-object-audio {
  border-radius: var(--pf-radius-md);
  background: #0A0A0F;
}

/* ---- Media fallback: when src is broken or missing ---- */
.pf-object [data-media-error],
[data-media-error] {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--pf-space-4);
  background: var(--pf-color-danger-soft);
  color: var(--pf-color-danger);
  border: 1px dashed var(--pf-color-danger);
  border-radius: var(--pf-radius-md);
  font-size: var(--pf-text-sm);
  line-height: var(--pf-leading-snug);
}

/* ---- Quiz: card, legend, option rows ---- */
.pf-quiz-question {
  padding: var(--pf-space-5);
  background: var(--pf-color-surface);
  border: 1px solid var(--pf-color-border);
  border-radius: var(--pf-radius-lg);
  box-shadow: var(--pf-shadow-sm);
  overflow: auto;
}
.pf-quiz-question fieldset { border: none; padding: 0; margin: 0; }
.pf-quiz-question legend {
  display: block;
  width: 100%;
  font-size: var(--pf-text-xl);
  font-weight: 600;
  line-height: var(--pf-leading-snug);
  color: var(--pf-color-ink);
  margin: 0 0 var(--pf-space-4);
  padding: 0;
  letter-spacing: var(--pf-tracking-tight);
}
.pf-question-options {
  display: flex;
  flex-direction: column;
  gap: var(--pf-space-2);
}
.pf-question-options label {
  display: flex;
  align-items: flex-start;
  gap: var(--pf-space-3);
  padding: var(--pf-space-3) var(--pf-space-4);
  background: var(--pf-color-bg);
  border: 1px solid var(--pf-color-border);
  border-radius: var(--pf-radius-md);
  cursor: pointer;
  font-size: var(--pf-text-base);
  color: var(--pf-color-ink);
  line-height: var(--pf-leading-snug);
  transition: background var(--pf-motion-fast) var(--pf-ease-out),
              border-color var(--pf-motion-fast) var(--pf-ease-out);
}
.pf-question-options label:hover {
  background: var(--pf-color-primary-soft);
  border-color: var(--pf-color-primary);
}
.pf-question-options label:has(input:checked) {
  background: var(--pf-color-primary-soft);
  border-color: var(--pf-color-primary);
}
.pf-question-options input[type='radio'],
.pf-question-options input[type='checkbox'] {
  margin: 4px 0 0;
  accent-color: var(--pf-color-primary);
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.pf-question-options input[type='text'] {
  padding: var(--pf-space-3) var(--pf-space-4);
  border: 1px solid var(--pf-color-border-strong);
  border-radius: var(--pf-radius-md);
  font-family: inherit;
  font-size: var(--pf-text-base);
  color: var(--pf-color-ink);
  background: var(--pf-color-surface);
  width: 100%;
  transition: border-color var(--pf-motion-fast) var(--pf-ease-out),
              box-shadow var(--pf-motion-fast) var(--pf-ease-out);
}
.pf-question-options input[type='text']:focus {
  outline: none;
  border-color: var(--pf-color-primary);
  box-shadow: 0 0 0 3px var(--pf-color-focus-ring);
}
.pf-question-options select {
  padding: var(--pf-space-2) var(--pf-space-3);
  border: 1px solid var(--pf-color-border-strong);
  border-radius: var(--pf-radius-sm);
  font-family: inherit;
  font-size: var(--pf-text-base);
  background: var(--pf-color-surface);
  color: var(--pf-color-ink);
  cursor: pointer;
}

/* Matching + sequencing rows */
.pf-quiz-match-row, .pf-quiz-seq-row {
  display: flex;
  align-items: center;
  gap: var(--pf-space-3);
  padding: var(--pf-space-3);
  background: var(--pf-color-bg);
  border: 1px solid var(--pf-color-border);
  border-radius: var(--pf-radius-md);
}
.pf-quiz-match-row > span:first-child {
  flex: 1;
  font-weight: 500;
  color: var(--pf-color-ink);
}
.pf-quiz-seq-row > span {
  flex: 1;
  color: var(--pf-color-ink);
}
.pf-quiz-seq-row button {
  padding: 0;
  width: 28px;
  height: 28px;
  background: var(--pf-color-surface);
  color: var(--pf-color-ink);
  border: 1px solid var(--pf-color-border-strong);
  border-radius: var(--pf-radius-sm);
  cursor: pointer;
  font-size: var(--pf-text-sm);
  line-height: 1;
  transition: background var(--pf-motion-fast) var(--pf-ease-out),
              border-color var(--pf-motion-fast) var(--pf-ease-out);
}
.pf-quiz-seq-row button:hover:not(:disabled) {
  background: var(--pf-color-primary-soft);
  border-color: var(--pf-color-primary);
  color: var(--pf-color-primary);
}
.pf-quiz-seq-row button:disabled { opacity: 0.3; cursor: not-allowed; }

/* ---- Reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  .pf-slide *, .pf-slide *::before, .pf-slide *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

// ---- Supporting scripts ----

const SUSPEND_MANAGER = `/**
 * Suspend data manager — serializes course state for SCORM cmi.suspend_data.
 * Handles base64 encoding, truncation for SCORM 1.2's 4KB limit,
 * and graceful degradation for state that doesn't fit.
 */
(function(global) {
  'use strict';

  var MAX_SUSPEND = {
    scorm12: 4096,
    scorm2004: 64000,
  };

  var adapter = null;
  var standard = 'scorm2004';

  function init(adapters, std) {
    adapter = adapters;
    standard = std;
  }

  function save(state) {
    var maxSize = MAX_SUSPEND[standard] || MAX_SUSPEND.scorm2004;
    var json = JSON.stringify(state);

    if (json.length > maxSize) {
      console.warn('[SuspendData] State exceeds ' + maxSize + ' bytes, truncating: ' + json.length + ' -> ' + maxSize);
      // Keep essential state: current slide, attempt count, quiz partial results
      var essential = {
        _v: 1,
        _t: Date.now(),
        slide: state.slide,
        attempt: state.attempt,
        quiz: state.quiz ? {
          id: state.quiz.id,
          responses: state.quiz.responses,
          started: state.quiz.started,
        } : undefined,
        variables: truncateVariables(state.variables, maxSize - 200),
      };
      json = JSON.stringify(essential);
    }

    var encoded = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, function(_, p) {
      return String.fromCharCode(parseInt(p, 16));
    }));

    if (adapter && adapter.SetValue) {
      adapter.SetValue(standard === 'scorm2004' ? 'cmi.suspend_data' : 'cmi.suspend_data', encoded);
    }
    return encoded.length;
  }

  function load() {
    if (!adapter || !adapter.GetValue) return {};
    var raw = adapter.GetValue(standard === 'scorm2004' ? 'cmi.suspend_data' : 'cmi.suspend_data');
    if (!raw) return {};
    try {
      var decoded = decodeURIComponent(Array.from(atob(raw), function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(decoded);
    } catch(e) {
      return {};
    }
  }

  function truncateVariables(vars, maxChars) {
    var result = {};
    var budget = maxChars;
    for (var key in vars) {
      var val = JSON.stringify(vars[key]);
      if (budget - val.length < 0) break;
      result[key] = vars[key];
      budget -= val.length + key.length + 10;
    }
    return result;
  }

  global.SuspendDataManager = { init, save, load };

})(typeof globalThis !== 'undefined' ? globalThis : window);
`;

const STATEMENT_BATCHER = `/**
 * xAPI Statement Batcher — queues statements and flushes in batches.
 * Handles retry with exponential backoff.
 */
(function(global) {
  'use strict';

  var queue = [];
  var inFlight = 0;
  var endpoint = '';
  var auth = '';
  var batchSize = 10;
  var retryDelay = 1000;
  var maxRetries = 3;

  function configure(cfg) {
    endpoint = cfg.endpoint || '';
    auth = cfg.auth || '';
    batchSize = cfg.batchSize || 10;
    retryDelay = cfg.retryDelay || 1000;
    maxRetries = cfg.maxRetries || 3;
  }

  function enqueue(statement) {
    queue.push(statement);
    flush();
  }

  function flush() {
    if (inFlight >= batchSize || queue.length === 0) return;
    var batch = queue.splice(0, batchSize);
    inFlight += batch.length;
    sendBatch(batch, 0);
  }

  function sendBatch(batch, retries) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint + '/statements', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (auth) xhr.setRequestHeader('Authorization', auth);
    xhr.withCredentials = false;

    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      inFlight -= batch.length;
      if (xhr.status === 200 || xhr.status === 204 || xhr.status === 0) {
        // Success — statements stored
      } else if (retries < maxRetries) {
        queue.unshift(...batch);
        setTimeout(function() { sendBatch(batch, retries + 1); }, retryDelay * (retries + 1));
      } else {
        console.warn('[xAPI] Failed to send ' + batch.length + ' statements after ' + maxRetries + ' retries');
      }
      if (queue.length > 0) flush();
    };

    xhr.send(JSON.stringify(batch));
  }

  global.StatementBatcher = { configure, enqueue, flush };

})(typeof globalThis !== 'undefined' ? globalThis : window);
`;
