/**
 * Package assembler — assembles the final ZIP with imsmanifest.xml.
 * Handles SCORM 1.2, SCORM 2004, xAPI, and HTML5-only outputs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import {
  OutputStandard,
  QualityPreset,
  RuntimeCourse,
  RuntimeSlide,
  RuntimeObject,
  RuntimeLayer,
  RuntimeTrigger,
  RuntimeQuestion,
  RuntimeVariable,
  RuntimeMediaManifest,
  RuntimeLMSConfig,
  RuntimeBackground,
  RuntimeNavigation,
  RuntimeQuiz,
  RuntimeInteraction,
} from './types.js';
import {
  buildScormManifest,
  renderManifestXml,
  SCORM_2004_ADAPTER,
  SCORM_12_ADAPTER,
  XAPI_ADAPTER,
} from './scorm-manifest.js';
import { BROWSER_RUNTIME } from './browser-runtime.js';

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
    Buffer.from(JSON.stringify(buildI18n(), 'utf-8'), 'utf-8')
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
    }

    window.addEventListener('load', loadCourse);
  </script>
</body>
</html>`;
}

function buildPlayerCSS(): string {
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
#pathfinder-course { width: 100%; height: 100%; }
#pathfinder-nav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 12px; background: rgba(0,0,0,0.8); color: white; z-index: 100;
}
#pathfinder-nav button {
  background: #1A73E8; color: white; border: none; border-radius: 4px;
  padding: 8px 16px; cursor: pointer; font-size: 14px;
}
#pathfinder-nav button:hover { background: #1557B0; }
#slide-counter { font-size: 14px; }
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

function buildLaunchHtml(standard: OutputStandard): string {
  if (standard === 'scorm2004') {
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
  return buildLaunchHtml('scorm2004');
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
      });
  </script>
</body>
</html>`;
}

function buildSlideHtml(slide: RuntimeSlide, course: RuntimeCourse, standard: OutputStandard): string {
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

const BROWSER_RUNTIME_CSS = `/* Pathfinder Runtime CSS */
.pf-slide {
  margin: 0 auto;
  position: relative;
  overflow: hidden;
}
.pf-slide [data-object-id] {
  box-sizing: border-box;
}
.pf-slide button[data-object-id] {
  cursor: pointer;
  border: none;
  font: inherit;
}
.pf-slide img[data-object-id] {
  object-fit: contain;
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
