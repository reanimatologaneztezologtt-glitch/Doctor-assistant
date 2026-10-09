// Regenerates the PRECACHE list in sw.js from the client files on disk and
// bumps CACHE_VERSION. Run after adding client files: node tools/update-precache.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((name) => {
  const rel = `${dir}/${name}`;
  return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
});
const files = ['index.html', 'manifest.webmanifest', ...['config', 'css', 'js', 'data', 'assets'].flatMap(walk)]
  .filter((f) => !f.endsWith('.gitkeep')).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(ROOT, f)));
const version = `da-${hash.digest('hex').slice(0, 12)}`;

const swPath = join(ROOT, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${version}';`);
sw = sw.replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = [\n  './',\n${files.map((f) => `  '${f}',`).join('\n')}\n];`);
writeFileSync(swPath, sw);
console.log(`${files.length} files, ${version}`);
