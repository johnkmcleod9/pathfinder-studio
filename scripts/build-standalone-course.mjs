import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('course-preview');
const OUT = path.resolve('course-tour-standalone.html');

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

const runtimeJs = read('pathfinder-runtime.js');
const runtimeCss = read('pathfinder-runtime.css');
const playerCss = fs.existsSync(path.join(SRC, 'player/player.css'))
  ? read('player/player.css')
  : '';
const courseData = JSON.parse(read('course.json'));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pathfinder Studio — Tour</title>
<style>
${runtimeCss}
${playerCss}
/* Standalone tour shell.
   Editorial page-layout intent: this reads like a wall-mounted
   exhibit caption with the course set beneath it. Asymmetry
   over center-everything — the left-leaning masthead is a
   deliberate choice. All tokens come from the runtime CSS
   cascaded above. */
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: var(--pf-surface-canvas);
  font-family: var(--pf-font-sans);
  color: var(--pf-text-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.tour-shell {
  max-width: 1328px;
  margin: 0 auto;
  padding: var(--pf-space-xl) var(--pf-space-lg) var(--pf-space-2xl);
  display: grid;
  grid-template-rows: auto auto auto;
  row-gap: var(--pf-space-lg);
  justify-items: center;
}

.tour-masthead {
  width: 100%;
  padding-bottom: var(--pf-space-lg);
  border-bottom: 1px solid var(--pf-border-subtle);
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: var(--pf-space-md);
}

.tour-masthead-inner {
  display: flex;
  flex-direction: column;
  gap: var(--pf-space-2xs);
}

.tour-colophon {
  font-family: var(--pf-font-sans);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--pf-text-tertiary);
}

.tour-title {
  font-family: var(--pf-font-serif);
  font-size: clamp(1.75rem, 2.5vw + 1rem, 2.75rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--pf-text-primary);
  font-feature-settings: 'kern', 'liga', 'onum', 'swsh';
}

.tour-subtitle {
  font-family: var(--pf-font-serif);
  font-style: italic;
  font-size: 1rem;
  color: var(--pf-text-secondary);
  margin-top: var(--pf-space-2xs);
}

.tour-meta {
  justify-self: end;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: var(--pf-space-3xs);
  font-family: var(--pf-font-sans);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--pf-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.tour-meta b {
  font-weight: 600;
  color: var(--pf-text-secondary);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.68rem;
}

/* Course stage: paper surface with a 1px border. NO drop shadow
   (anti-AI-slop). NO extreme radius (editorial restraint). */
#pathfinder-course {
  position: relative;
  width: 1280px;
  height: 720px;
  background: var(--pf-surface-paper);
  border: 1px solid var(--pf-border-default);
  border-radius: var(--pf-radius-md);
  overflow: hidden;
}

/* Nav bar belongs to the paper system. Secondary (Previous) is
   ghost; primary (Next) is tobacco. Counter in sans, tabular-nums. */
#pathfinder-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--pf-space-lg);
  padding: var(--pf-space-sm) var(--pf-space-md);
}

#pathfinder-nav button {
  padding: 0 var(--pf-space-md);
  min-height: 40px;
  background: transparent;
  color: var(--pf-text-primary);
  border: 1px solid var(--pf-border-strong);
  border-radius: var(--pf-radius-lg);
  font-family: var(--pf-font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    background var(--pf-motion-fast) var(--pf-ease-out),
    border-color var(--pf-motion-fast) var(--pf-ease-out),
    color var(--pf-motion-fast) var(--pf-ease-out);
}
#pathfinder-nav button:hover:not(:disabled) {
  background: var(--pf-brand-soft);
  border-color: var(--pf-brand);
  color: var(--pf-brand-active);
}
#pathfinder-nav button#btn-next {
  background: var(--pf-brand);
  border-color: var(--pf-brand);
  color: var(--pf-text-on-primary);
}
#pathfinder-nav button#btn-next:hover:not(:disabled) {
  background: var(--pf-brand-hover);
  border-color: var(--pf-brand-hover);
}
#pathfinder-nav button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

#slide-counter {
  font-family: var(--pf-font-sans);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--pf-text-secondary);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  letter-spacing: 0.08em;
  min-width: 72px;
  text-align: center;
}
</style>
</head>
<body>
<div class="tour-shell">
  <header class="tour-masthead">
    <div class="tour-masthead-inner">
      <div class="tour-colophon">Pathfinder Studio &mdash; Interactive Tour</div>
      <h1 class="tour-title">A working course, authored in plain text.</h1>
      <p class="tour-subtitle">Every interaction the runtime ships, in about four minutes.</p>
    </div>
    <div class="tour-meta">
      <span><b>Standard</b></span>
      <span>HTML5 &middot; WCAG AA</span>
    </div>
  </header>
  <div id="pathfinder-course"></div>
  <div id="pathfinder-nav">
    <button id="btn-prev">&larr; Previous</button>
    <span id="slide-counter"></span>
    <button id="btn-next">Next &rarr;</button>
  </div>
</div>
<script>
${runtimeJs}
</script>
<script>
(function () {
  var courseData = ${JSON.stringify(courseData)};
  var runtime = new PathfinderRuntime({
    course: courseData,
    lmsAdapter: {},
    container: document.getElementById('pathfinder-course')
  });
  runtime.start();
  runtime.on('slidechange', function (_, idx, total) {
    document.getElementById('slide-counter').textContent = (idx + 1) + ' / ' + total;
  });
  document.getElementById('btn-prev').onclick = function () { runtime.navigatePrev(); };
  document.getElementById('btn-next').onclick = function () { runtime.navigateNext(); };
})();
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log('wrote', OUT, '(' + fs.statSync(OUT).size + ' bytes)');
