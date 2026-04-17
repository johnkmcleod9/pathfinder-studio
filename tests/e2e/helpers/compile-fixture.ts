import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// @ts-ignore — adm-zip has no types
import AdmZip from 'adm-zip';
import { publish } from '../../../src/publish/pipeline.js';

/**
 * Build a .pathfinder ZIP from a fixture directory, run the publish
 * pipeline to produce an HTML5 package, and unpack that package so the
 * caller can serve it directly.
 *
 * Returns the absolute path to the unpacked package directory (contains
 * index.html, course.json, pathfinder-runtime.js, media/...).
 */
export async function compileFixture(fixtureDir: string): Promise<{
  packageDir: string;
  cleanup: () => void;
}> {
  const absFixture = path.resolve(fixtureDir);
  if (!fs.existsSync(path.join(absFixture, 'project.json'))) {
    throw new Error(`Fixture missing project.json: ${absFixture}`);
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pathfinder-e2e-'));
  const sourceZipPath = path.join(tmpRoot, 'source.pathfinder');
  const outputZipPath = path.join(tmpRoot, 'output.zip');
  const packageDir = path.join(tmpRoot, 'package');

  // 1. Zip the fixture into a .pathfinder source archive.
  const srcZip = new AdmZip();
  addDirToZip(srcZip, absFixture, '');
  srcZip.writeZip(sourceZipPath);

  // 2. Run the publish pipeline to produce an HTML5 package.
  const report = await publish({
    inputPath: sourceZipPath,
    outputPath: outputZipPath,
    standard: 'html5',
    quality: 'medium',
  });
  if (!report.success) {
    const msg = report.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
    throw new Error(`compileFixture publish failed:\n${msg}`);
  }

  // 3. Extract the output ZIP so serve-dir can host it.
  fs.mkdirSync(packageDir, { recursive: true });
  const outZip = new AdmZip(outputZipPath);
  outZip.extractAllTo(packageDir, true);

  return {
    packageDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    },
  };
}

function addDirToZip(zip: AdmZip, absDir: string, zipPath: string): void {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    const rel = zipPath ? `${zipPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirToZip(zip, abs, rel);
    } else if (entry.isFile()) {
      zip.addFile(rel, fs.readFileSync(abs));
    }
  }
}
