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
  // Player chrome (shell around the stage + bottom nav). Loaded
  // before the runtime CSS, so the literal OKLCH values here are
  // intentionally duplicated rather than referencing custom
  // properties that don't exist yet at parse time.
  //
  // Design intent: the chrome is part of the editorial paper
  // system, NOT a dark bar sitting on top of it. Secondary nav
  // button is ghost (outline), primary is solid tobacco — the
  // 60-30-10 rule made visible.
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  height: 100%;
  overflow: hidden;
  font-family: 'Alegreya Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: oklch(0.955 0.008 45);   /* paper canvas, tobacco-tinted */
  color: oklch(0.22 0.015 45);          /* body ink */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
@media (prefers-color-scheme: dark) {
  html, body {
    background: oklch(0.12 0.015 45);
    color: oklch(0.90 0.010 45);
  }
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
  position: fixed;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 16px 24px;
  background: oklch(0.985 0.007 45);    /* paper white */
  border-top: 1px solid oklch(0.86 0.011 45);
  color: oklch(0.22 0.015 45);
  z-index: 100;
  font-family: 'Alegreya Sans', ui-sans-serif, system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  #pathfinder-nav {
    background: oklch(0.16 0.015 45);
    border-top-color: oklch(0.26 0.014 45);
    color: oklch(0.90 0.010 45);
  }
}

/* Both nav buttons share metrics; the second (Next) gets the
   primary treatment, the first stays secondary/ghost so we don't
   present two equally-weighted CTAs. */
#pathfinder-nav button {
  padding: 0 20px;
  min-height: 40px;
  background: transparent;
  color: oklch(0.30 0.015 45);
  border: 1px solid oklch(0.72 0.013 45);
  border-radius: 8px;
  cursor: pointer;
  font: 500 14px/1 'Alegreya Sans', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.02em;
  transition:
    background 120ms cubic-bezier(0.25, 1, 0.5, 1),
    border-color 120ms cubic-bezier(0.25, 1, 0.5, 1),
    color 120ms cubic-bezier(0.25, 1, 0.5, 1);
}
#pathfinder-nav button:hover:not(:disabled) {
  background: oklch(0.93 0.030 45);
  border-color: oklch(0.48 0.110 45);
  color: oklch(0.32 0.085 45);
}

/* Primary = last button (Next). Tobacco fill, paper text, no shadow. */
#pathfinder-nav button#btn-next {
  background: oklch(0.48 0.110 45);
  border-color: oklch(0.48 0.110 45);
  color: oklch(0.985 0.007 45);
}
#pathfinder-nav button#btn-next:hover:not(:disabled) {
  background: oklch(0.40 0.100 45);
  border-color: oklch(0.40 0.100 45);
  color: oklch(0.985 0.007 45);
}

#pathfinder-nav button:focus-visible {
  outline: 2px solid oklch(0.55 0.15 45 / 0.55);
  outline-offset: 3px;
}
#pathfinder-nav button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  #pathfinder-nav button {
    color: oklch(0.90 0.010 45);
    border-color: oklch(0.34 0.015 45);
  }
  #pathfinder-nav button:hover:not(:disabled) {
    background: oklch(0.22 0.015 45);
    border-color: oklch(0.68 0.100 45);
    color: oklch(0.85 0.095 45);
  }
  #pathfinder-nav button#btn-next {
    background: oklch(0.68 0.100 45);
    border-color: oklch(0.68 0.100 45);
    color: oklch(0.16 0.015 45);
  }
  #pathfinder-nav button#btn-next:hover:not(:disabled) {
    background: oklch(0.75 0.095 45);
    border-color: oklch(0.75 0.095 45);
    color: oklch(0.16 0.015 45);
  }
}

#slide-counter {
  font-family: 'Alegreya Sans', ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: oklch(0.42 0.015 45);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  letter-spacing: 0.04em;
  min-width: 64px;
  text-align: center;
}
@media (prefers-color-scheme: dark) {
  #slide-counter {
    color: oklch(0.72 0.012 45);
  }
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
// Design language for every published Pathfinder course.
// Established via the Impeccable design skill; full Design Context
// lives at `.impeccable.md` in the repo root.
//
// Aesthetic direction: Crisp · Editorial · Grown-up.
// Lineage: Craft / Bear / Ghost, pulled toward editorial precision.
// Serif for learner-reading content (Alegreya), sans for UI chrome
// (Alegreya Sans) — a designed pair from Huerta Tipográfica, chosen
// explicitly outside Impeccable's reflex_fonts_to_reject list.
// Tobacco brand hue at oklch(0.48 0.11 45). Both themes (light + dark)
// designed intentionally rather than auto-inverted — dark theme gets
// its own token values that respect dark-mode depth conventions
// (lighter surfaces for elevation, reduced body font weight).
//
// Inline `obj.style` overrides from project.json still apply on top
// via _applyStyle() in the runtime.

const BROWSER_RUNTIME_CSS = `/* Pathfinder Runtime CSS — Design Language v2 (Impeccable craft) */

@import url('https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,700&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;0,900;1,400&display=swap');

/* ============================================================
   TOKENS — Light theme (default)
   Tobacco brand hue (H=45) with chroma-tinted warm neutrals.
   Every neutral carries 0.007–0.015 chroma toward hue 45, so
   the whole surface reads as a cohesive warm paper system
   rather than a cool off-white.
   ============================================================ */

:root {
  /* Neutrals — ink scale, tobacco-tinted (c≈0.007–0.015). */
  --pf-ink-50:  oklch(0.985 0.007 45);   /* paper white */
  --pf-ink-100: oklch(0.955 0.008 45);   /* surface muted */
  --pf-ink-200: oklch(0.92  0.010 45);   /* subtle surface */
  --pf-ink-300: oklch(0.86  0.011 45);   /* border subtle */
  --pf-ink-400: oklch(0.72  0.013 45);   /* border strong */
  --pf-ink-500: oklch(0.55  0.014 45);   /* tertiary text */
  --pf-ink-600: oklch(0.42  0.015 45);   /* secondary text */
  --pf-ink-700: oklch(0.30  0.015 45);   /* body emphasis */
  --pf-ink-800: oklch(0.22  0.015 45);   /* body text */
  --pf-ink-900: oklch(0.16  0.015 45);   /* heading / max contrast */
  --pf-ink-950: oklch(0.12  0.015 45);   /* dark-theme canvas */

  /* Primary — tobacco scale. Full saturation at 500. */
  --pf-primary-50:  oklch(0.97 0.015 45);
  --pf-primary-100: oklch(0.93 0.030 45);
  --pf-primary-200: oklch(0.86 0.055 45);
  --pf-primary-300: oklch(0.75 0.085 45);
  --pf-primary-400: oklch(0.62 0.100 45);
  --pf-primary-500: oklch(0.48 0.110 45);  /* TOBACCO — brand voice */
  --pf-primary-600: oklch(0.40 0.100 45);
  --pf-primary-700: oklch(0.32 0.085 45);
  --pf-primary-800: oklch(0.24 0.060 45);
  --pf-primary-900: oklch(0.17 0.035 45);

  /* Semantic — desaturated, tobacco-adjacent warmth. */
  --pf-success-600: oklch(0.48 0.080 155);
  --pf-success-100: oklch(0.94 0.020 155);
  --pf-danger-600:  oklch(0.48 0.140 25);
  --pf-danger-100:  oklch(0.94 0.025 25);

  /* Semantic surface tokens (light theme). */
  --pf-surface-canvas:  var(--pf-ink-50);
  --pf-surface-paper:   oklch(0.99 0.005 45);
  --pf-surface-raised:  oklch(1.0  0.002 45);
  --pf-surface-muted:   var(--pf-ink-100);
  --pf-surface-sunken:  var(--pf-ink-200);

  --pf-text-primary:    var(--pf-ink-900);
  --pf-text-body:       var(--pf-ink-800);
  --pf-text-secondary:  var(--pf-ink-600);
  --pf-text-tertiary:   var(--pf-ink-500);
  --pf-text-placeholder: var(--pf-ink-400);
  --pf-text-on-primary: var(--pf-ink-50);
  --pf-text-link:       var(--pf-primary-700);
  --pf-text-link-hover: var(--pf-primary-800);

  --pf-border-subtle:   var(--pf-ink-200);
  --pf-border-default:  var(--pf-ink-300);
  --pf-border-strong:   var(--pf-ink-400);

  --pf-brand:           var(--pf-primary-500);
  --pf-brand-hover:     var(--pf-primary-600);
  --pf-brand-active:    var(--pf-primary-700);
  --pf-brand-soft:      var(--pf-primary-100);
  --pf-brand-soft-border: var(--pf-primary-300);

  --pf-focus-ring: oklch(0.55 0.15 45 / 0.45);

  /* Typography — Alegreya (reading serif) + Alegreya Sans (UI).
     Chosen outside Impeccable's reflex_fonts_to_reject list; a
     designed pair from Huerta Tipográfica. Alegreya is purpose-
     built for long-form literature reading, Old Style humanist
     with real calligraphic personality. Fallback stack keeps
     layout stable if Google Fonts is blocked. */
  --pf-font-serif: 'Alegreya', ui-serif, Georgia, 'Book Antiqua', 'Times New Roman', serif;
  --pf-font-sans:  'Alegreya Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --pf-font-mono:  ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* Type scale — 1.333 ratio (perfect fourth), fixed rem for
     app UI per Impeccable typography reference. */
  --pf-text-xs:    0.75rem;     /* 12px */
  --pf-text-sm:    0.875rem;    /* 14px */
  --pf-text-base:  1.0625rem;   /* 17px — Alegreya reads better at 17 */
  --pf-text-lg:    1.4375rem;   /* 23px */
  --pf-text-xl:    1.75rem;     /* 28px */
  --pf-text-2xl:   2.25rem;     /* 36px */
  --pf-text-3xl:   3rem;        /* 48px */
  --pf-text-4xl:   4rem;        /* 64px */

  --pf-leading-tight:   1.15;
  --pf-leading-snug:    1.35;
  --pf-leading-normal:  1.55;
  --pf-leading-relaxed: 1.7;
  --pf-tracking-tight:  -0.012em;

  /* Spacing — 4pt base, semantic names. */
  --pf-space-3xs: 2px;
  --pf-space-2xs: 4px;
  --pf-space-xs:  8px;
  --pf-space-sm:  12px;
  --pf-space-md:  16px;
  --pf-space-lg:  24px;
  --pf-space-xl:  32px;
  --pf-space-2xl: 48px;
  --pf-space-3xl: 64px;
  --pf-space-4xl: 96px;

  /* Radii — restrained, editorial. Nothing pillowy. */
  --pf-radius-sm:   2px;
  --pf-radius-md:   4px;
  --pf-radius-lg:   8px;
  --pf-radius-xl:   12px;
  --pf-radius-pill: 999px;

  /* Shadows — a whisper. Most depth comes from surface + border,
     shadow is reserved for elevated overlays. */
  --pf-shadow-sm: 0 1px 2px oklch(0.2 0.02 45 / 0.05);
  --pf-shadow-md: 0 4px 16px oklch(0.2 0.02 45 / 0.06);
  --pf-shadow-lg: 0 20px 48px oklch(0.2 0.02 45 / 0.10);

  /* Motion. */
  --pf-motion-fast:   120ms;
  --pf-motion-normal: 220ms;
  --pf-motion-slow:   360ms;
  --pf-ease-out:       cubic-bezier(0.25, 1, 0.5, 1);     /* quart */
  --pf-ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);     /* snappy */
  --pf-ease-in-out:    cubic-bezier(0.65, 0, 0.35, 1);
}

/* ============================================================
   TOKENS — Dark theme
   Per Impeccable color reference: dark mode is NOT inverted
   light mode. Depth comes from surface LIGHTNESS, not shadow;
   higher elevations are LIGHTER. Body text weight reduces
   (450 instead of 500) because light-on-dark reads as heavier.
   Accents desaturate slightly to avoid the AI-neon-on-dark
   fingerprint.
   ============================================================ */

@media (prefers-color-scheme: dark) {
  :root {
    --pf-surface-canvas:  var(--pf-ink-950);
    --pf-surface-paper:   oklch(0.14 0.014 45);
    --pf-surface-raised:  oklch(0.18 0.014 45);
    --pf-surface-muted:   oklch(0.21 0.013 45);
    --pf-surface-sunken:  oklch(0.10 0.015 45);

    --pf-text-primary:    oklch(0.96 0.010 45);
    --pf-text-body:       oklch(0.90 0.010 45);
    --pf-text-secondary:  oklch(0.72 0.012 45);
    --pf-text-tertiary:   oklch(0.58 0.013 45);
    --pf-text-placeholder: oklch(0.45 0.014 45);
    --pf-text-on-primary: oklch(0.16 0.015 45);  /* dark ink on light tobacco */
    --pf-text-link:       oklch(0.78 0.100 45);
    --pf-text-link-hover: oklch(0.85 0.095 45);

    --pf-border-subtle:   oklch(0.26 0.014 45);
    --pf-border-default:  oklch(0.34 0.015 45);
    --pf-border-strong:   oklch(0.48 0.017 45);

    /* Primary lifts lighter on dark + chroma slightly down. */
    --pf-brand:           oklch(0.68 0.100 45);
    --pf-brand-hover:     oklch(0.75 0.095 45);
    --pf-brand-active:    oklch(0.82 0.085 45);
    --pf-brand-soft:      oklch(0.26 0.040 45);
    --pf-brand-soft-border: oklch(0.40 0.070 45);

    --pf-focus-ring: oklch(0.72 0.130 45 / 0.55);

    /* Semantic adjusted for dark surfaces. */
    --pf-success-600: oklch(0.72 0.090 155);
    --pf-success-100: oklch(0.22 0.028 155);
    --pf-danger-600:  oklch(0.72 0.130 25);
    --pf-danger-100:  oklch(0.22 0.035 25);

    /* Dark mode: no shadows. Use lighter surfaces for elevation. */
    --pf-shadow-sm: none;
    --pf-shadow-md: none;
    --pf-shadow-lg: 0 24px 64px oklch(0.05 0.02 45 / 0.4);
  }
}

/* ============================================================
   STAGE
   The slide is the editorial page, not a card. No drop shadow,
   no wrapping rounded-rectangle. Background surfaces are author-
   controlled via slide.background; the tokens below only apply
   when a slide declares no explicit background.
   ============================================================ */

.pf-slide {
  margin: 0 auto;
  position: relative;
  overflow: hidden;
  font-family: var(--pf-font-serif);
  font-size: var(--pf-text-base);
  font-weight: 400;
  color: var(--pf-text-body);
  line-height: var(--pf-leading-normal);
  background: var(--pf-surface-canvas);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'kern', 'liga', 'onum';
  font-variant-numeric: oldstyle-nums;
}

/* Light-text-on-dark (per slide background) reads as heavier; the
   dark theme extends line-height slightly per Impeccable guidance. */
@media (prefers-color-scheme: dark) {
  .pf-slide {
    font-weight: 450;
    line-height: calc(var(--pf-leading-normal) + 0.08);
  }
}

.pf-slide *, .pf-slide *::before, .pf-slide *::after {
  box-sizing: border-box;
}
.pf-slide [data-object-id] {
  box-sizing: border-box;
}

/* ============================================================
   FOCUS
   The ring is the same warmth as the brand, not a cold tech-blue.
   Applied inside the slide and on course chrome.
   ============================================================ */

.pf-slide :focus-visible,
#pathfinder-nav :focus-visible {
  outline: 2px solid var(--pf-focus-ring);
  outline-offset: 3px;
  border-radius: var(--pf-radius-md);
}

/* ============================================================
   TEXT OBJECTS
   Learner-reading content. Serif by default; hierarchy by
   size+weight, never by color alone. No "+icon above every
   heading" AI template.
   ============================================================ */

.pf-object-text {
  font-family: var(--pf-font-serif);
  font-size: var(--pf-text-base);
  line-height: var(--pf-leading-normal);
  color: var(--pf-text-body);
}
.pf-object-text h1,
.pf-object-text h2,
.pf-object-text h3,
.pf-object-text h4 {
  font-family: var(--pf-font-serif);
  font-weight: 700;
  letter-spacing: var(--pf-tracking-tight);
  line-height: var(--pf-leading-tight);
  color: var(--pf-text-primary);
  margin: 0;
}
.pf-object-text h1 { font-size: var(--pf-text-4xl); font-weight: 800; }
.pf-object-text h2 { font-size: var(--pf-text-3xl); }
.pf-object-text h3 { font-size: var(--pf-text-2xl); }
.pf-object-text h4 { font-size: var(--pf-text-xl); font-weight: 600; }
.pf-object-text h1 + *,
.pf-object-text h2 + *,
.pf-object-text h3 + *,
.pf-object-text h4 + * {
  margin-top: var(--pf-space-md);
}
.pf-object-text p { margin: 0; max-width: 62ch; }
.pf-object-text p + p { margin-top: var(--pf-space-md); }
.pf-object-text strong, .pf-object-text b { font-weight: 700; color: var(--pf-text-primary); }
.pf-object-text em, .pf-object-text i { font-style: italic; }
.pf-object-text a {
  color: var(--pf-text-link);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  transition: color var(--pf-motion-fast) var(--pf-ease-out);
}
.pf-object-text a:hover { color: var(--pf-text-link-hover); }
.pf-object-text ul, .pf-object-text ol { padding-left: var(--pf-space-lg); margin: 0; }
.pf-object-text li + li { margin-top: var(--pf-space-xs); }
.pf-object-text blockquote {
  margin: var(--pf-space-md) 0;
  padding: 0 0 0 var(--pf-space-md);
  border-inline-start: 1px solid var(--pf-border-default);
  font-style: italic;
  color: var(--pf-text-secondary);
}
.pf-object-text code {
  font-family: var(--pf-font-mono);
  font-size: 0.92em;
  padding: 0.1em 0.3em;
  background: var(--pf-surface-muted);
  border-radius: var(--pf-radius-sm);
}

/* ============================================================
   BUTTON OBJECTS
   UI chrome — sans-serif, confident weight, tobacco by default.
   Editorial spirit: no drop shadow (anti-AI-slop), border gives
   form at rest, hover lifts via color and subtle scale.
   ============================================================ */

.pf-object-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--pf-space-xs);
  padding: 0 var(--pf-space-lg);
  background: var(--pf-brand);
  color: var(--pf-text-on-primary);
  border: 1px solid transparent;
  border-radius: var(--pf-radius-lg);
  font-family: var(--pf-font-sans);
  font-size: var(--pf-text-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  cursor: pointer;
  transition:
    background var(--pf-motion-fast) var(--pf-ease-out),
    color var(--pf-motion-fast) var(--pf-ease-out),
    border-color var(--pf-motion-fast) var(--pf-ease-out),
    transform var(--pf-motion-fast) var(--pf-ease-out-expo);
  min-height: 44px; /* a11y tap target */
}
.pf-object-button:hover:not(:disabled) {
  background: var(--pf-brand-hover);
}
.pf-object-button:active:not(:disabled) {
  background: var(--pf-brand-active);
  transform: translateY(1px);
}
.pf-object-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ============================================================
   SHAPE OBJECTS
   Not-every-shape-is-a-card. Default to a flat tinted surface
   with a hairline border — no drop shadow. Author's inline
   styles still override for hero backdrops etc.
   ============================================================ */

.pf-object-shape {
  background: var(--pf-surface-paper);
  border: 1px solid var(--pf-border-subtle);
  border-radius: var(--pf-radius-lg);
}

/* ============================================================
   IMAGE / MEDIA
   ============================================================ */

.pf-object-image {
  object-fit: contain;
  border-radius: var(--pf-radius-lg);
}
.pf-object-video,
.pf-object-audio {
  border-radius: var(--pf-radius-lg);
  background: var(--pf-ink-950);
}

/* Media fallback: honest, not-cute. No clip-art icon — just a
   labelled panel the learner can read. */
.pf-object [data-media-error],
[data-media-error] {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--pf-space-md);
  background: var(--pf-danger-100);
  color: var(--pf-danger-600);
  border: 1px solid var(--pf-danger-600);
  border-radius: var(--pf-radius-lg);
  font-family: var(--pf-font-sans);
  font-size: var(--pf-text-sm);
  font-weight: 500;
  line-height: var(--pf-leading-snug);
}

/* ============================================================
   QUIZ
   The quiz IS a card (bounded interaction), but editorial —
   flat, bordered, no drop shadow. Legend in serif (it's
   reading content); options in serif (also reading content);
   input chrome and arrow buttons in sans.
   ============================================================ */

.pf-quiz-question {
  padding: var(--pf-space-xl);
  background: var(--pf-surface-paper);
  border: 1px solid var(--pf-border-default);
  border-radius: var(--pf-radius-xl);
  overflow: auto;
  font-family: var(--pf-font-serif);
}
.pf-quiz-question fieldset {
  border: none;
  padding: 0;
  margin: 0;
}
.pf-quiz-question legend {
  display: block;
  width: 100%;
  padding: 0;
  margin: 0 0 var(--pf-space-lg);
  font-family: var(--pf-font-serif);
  font-size: var(--pf-text-lg);
  font-weight: 600;
  line-height: var(--pf-leading-snug);
  color: var(--pf-text-primary);
  letter-spacing: var(--pf-tracking-tight);
}
.pf-question-options {
  display: flex;
  flex-direction: column;
  gap: var(--pf-space-xs);
}

/* Option rows — tinted panel, hairline border, warmth on hover,
   saturated border + soft-tobacco fill when selected. No check-
   mark decoration needed; the native accent-color does the work. */
.pf-question-options label {
  display: flex;
  align-items: flex-start;
  gap: var(--pf-space-sm);
  padding: var(--pf-space-sm) var(--pf-space-md);
  background: var(--pf-surface-canvas);
  border: 1px solid var(--pf-border-subtle);
  border-radius: var(--pf-radius-lg);
  cursor: pointer;
  font-family: var(--pf-font-serif);
  font-size: var(--pf-text-base);
  color: var(--pf-text-body);
  line-height: var(--pf-leading-snug);
  transition:
    background var(--pf-motion-fast) var(--pf-ease-out),
    border-color var(--pf-motion-fast) var(--pf-ease-out);
  min-height: 44px;
}
.pf-question-options label:hover {
  background: var(--pf-brand-soft);
  border-color: var(--pf-brand-soft-border);
}
.pf-question-options label:has(input:checked) {
  background: var(--pf-brand-soft);
  border-color: var(--pf-brand);
  color: var(--pf-text-primary);
}
.pf-question-options input[type='radio'],
.pf-question-options input[type='checkbox'] {
  margin: 5px 0 0;
  accent-color: var(--pf-brand);
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  cursor: pointer;
}

/* Text inputs — a single hairline, warm on focus. */
.pf-question-options input[type='text'] {
  padding: var(--pf-space-sm) var(--pf-space-md);
  border: 1px solid var(--pf-border-strong);
  border-radius: var(--pf-radius-lg);
  font-family: var(--pf-font-sans);
  font-size: var(--pf-text-base);
  color: var(--pf-text-body);
  background: var(--pf-surface-raised);
  width: 100%;
  transition:
    border-color var(--pf-motion-fast) var(--pf-ease-out),
    box-shadow var(--pf-motion-fast) var(--pf-ease-out);
  min-height: 44px;
}
.pf-question-options input[type='text']:focus {
  outline: none;
  border-color: var(--pf-brand);
  box-shadow: 0 0 0 3px var(--pf-focus-ring);
}
.pf-question-options input[type='text']::placeholder {
  color: var(--pf-text-placeholder);
}

/* Select (matching) — sans, clear chevron, same focus treatment. */
.pf-question-options select {
  padding: var(--pf-space-xs) var(--pf-space-md) var(--pf-space-xs) var(--pf-space-sm);
  border: 1px solid var(--pf-border-strong);
  border-radius: var(--pf-radius-md);
  font-family: var(--pf-font-sans);
  font-size: var(--pf-text-sm);
  font-weight: 500;
  background: var(--pf-surface-raised);
  color: var(--pf-text-body);
  cursor: pointer;
  min-height: 36px;
}
.pf-question-options select:focus-visible {
  outline: 2px solid var(--pf-focus-ring);
  outline-offset: 2px;
}

/* Matching + sequencing rows — bone surface, hairline border,
   left label in serif (reading content), UI controls in sans. */
.pf-quiz-match-row,
.pf-quiz-seq-row {
  display: flex;
  align-items: center;
  gap: var(--pf-space-sm);
  padding: var(--pf-space-sm) var(--pf-space-md);
  background: var(--pf-surface-canvas);
  border: 1px solid var(--pf-border-subtle);
  border-radius: var(--pf-radius-lg);
}
.pf-quiz-match-row > span:first-child {
  flex: 1;
  font-family: var(--pf-font-serif);
  font-weight: 500;
  color: var(--pf-text-primary);
}
.pf-quiz-seq-row > span {
  flex: 1;
  font-family: var(--pf-font-serif);
  color: var(--pf-text-body);
}

/* Sequencing up/down arrow buttons — small, sans, no-shadow. */
.pf-quiz-seq-row button {
  padding: 0;
  width: 32px;
  height: 32px;
  background: var(--pf-surface-raised);
  color: var(--pf-text-secondary);
  border: 1px solid var(--pf-border-strong);
  border-radius: var(--pf-radius-md);
  font-family: var(--pf-font-sans);
  font-size: var(--pf-text-xs);
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--pf-motion-fast) var(--pf-ease-out),
    border-color var(--pf-motion-fast) var(--pf-ease-out),
    color var(--pf-motion-fast) var(--pf-ease-out);
}
.pf-quiz-seq-row button:hover:not(:disabled) {
  background: var(--pf-brand-soft);
  border-color: var(--pf-brand);
  color: var(--pf-brand);
}
.pf-quiz-seq-row button:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

/* ============================================================
   REDUCED MOTION
   Preserve functional motion; drop spatial motion.
   ============================================================ */

@media (prefers-reduced-motion: reduce) {
  .pf-slide *,
  .pf-slide *::before,
  .pf-slide *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
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
