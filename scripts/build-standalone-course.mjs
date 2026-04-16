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
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
#pathfinder-course { position: relative; width: 960px; height: 540px; margin: 24px auto; border: 1px solid #ddd; overflow: hidden; }
#pathfinder-nav { display: flex; gap: 12px; justify-content: center; align-items: center; padding: 12px; }
#pathfinder-nav button { padding: 8px 16px; font-size: 14px; cursor: pointer; }
</style>
</head>
<body>
<div id="pathfinder-course"></div>
<div id="pathfinder-nav">
  <button id="btn-prev">&larr; Previous</button>
  <span id="slide-counter"></span>
  <button id="btn-next">Next &rarr;</button>
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
