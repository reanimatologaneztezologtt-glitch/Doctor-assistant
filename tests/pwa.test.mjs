import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, listFiles, read, readJson } from './helpers.mjs';

const sw = read('sw.js');
const precache = JSON.parse(
  /const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'),
);

test('manifest has required PWA fields', () => {
  const m = readJson('manifest.webmanifest');
  for (const field of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']) {
    assert.ok(m[field], `manifest.${field} missing`);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of m.icons) assert.ok(existsSync(join(ROOT, icon.src)), icon.src);
});

test('every precached file exists', () => {
  for (const path of precache.filter((p) => p !== './')) {
    assert.ok(existsSync(join(ROOT, path)), `precache entry missing on disk: ${path}`);
  }
});

test('all client files are precached for offline use', () => {
  const client = [
    'index.html', 'manifest.webmanifest',
    ...listFiles('config'), ...listFiles('css'), ...listFiles('js'),
    ...listFiles('assets'), ...listFiles('data'),
  ].filter((p) => !p.endsWith('.gitkeep'));
  for (const path of client) assert.ok(precache.includes(path), `not precached: ${path}`);
});

test('service worker never caches API requests', () => {
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
});
