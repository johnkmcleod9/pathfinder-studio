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
   - Uses the same design tokens as the runtime (see :root above).
   - Canvas is 1280x720 to match the compiler default. Shrinks
     responsively on narrower viewports via transform:scale so the
     page never needs horizontal scroll.
   - body + nav override the player.css defaults because this page
     is a single-file demo, not a full player shell. */
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: var(--pf-color-surface-muted);
  font-family: var(--pf-font-sans);
  color: var(--pf-color-ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.tour-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pf-space-6) var(--pf-space-5) var(--pf-space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--pf-space-4);
}
.tour-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pf-space-4);
}
.tour-title {
  font-size: var(--pf-text-lg);
  font-weight: 600;
  letter-spacing: var(--pf-tracking-tight);
  color: var(--pf-color-ink);
}
.tour-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--pf-space-2);
  padding: var(--pf-space-1) var(--pf-space-3);
  background: var(--pf-color-primary-soft);
  color: var(--pf-color-primary);
  border-radius: var(--pf-radius-pill);
  font-size: var(--pf-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
#pathfinder-course {
  position: relative;
  width: 1280px;
  height: 720px;
  background: var(--pf-color-surface);
  border: 1px solid var(--pf-color-border);
  border-radius: var(--pf-radius-xl);
  box-shadow: var(--pf-shadow-lg);
  overflow: hidden;
}
#pathfinder-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--pf-space-4);
  padding: var(--pf-space-3) var(--pf-space-4);
  background: var(--pf-color-surface);
  border: 1px solid var(--pf-color-border);
  border-radius: var(--pf-radius-pill);
  box-shadow: var(--pf-shadow-sm);
}
#pathfinder-nav button {
  padding: var(--pf-space-2) var(--pf-space-4);
  background: var(--pf-color-primary);
  color: var(--pf-color-primary-ink);
  border: none;
  border-radius: var(--pf-radius-md);
  font-family: inherit;
  font-size: var(--pf-text-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background var(--pf-motion-fast) var(--pf-ease-out);
}
#pathfinder-nav button:hover { background: var(--pf-color-primary-hover); }
#pathfinder-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
#slide-counter {
  font-size: var(--pf-text-sm);
  color: var(--pf-color-ink-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  min-width: 60px;
  text-align: center;
}
</style>
</head>
<body>
<div class="tour-shell">
  <div class="tour-header">
    <div class="tour-title">Pathfinder Studio</div>
    <div class="tour-badge">Interactive tour</div>
  </div>
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
