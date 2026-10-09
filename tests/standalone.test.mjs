import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

test('single-file build is self-contained (no external resources)', () => {
  execFileSync(process.execPath, [join(ROOT, 'tools/build-standalone.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const html = readFileSync(join(ROOT, 'dist/doctor-assistant.html'), 'utf8');
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)="(https?:)?\/\//);
  assert.match(html, /connect-src 'none'/);
  assert.equal((html.match(/<\/script>/g) || []).length, 3, 'no stray </script> inside inlined code');
  for (const f of ['data/thresholds.json', 'data/i18n/uz.json', 'data/rules.json', 'assets/diagrams/plax.svg']) {
    assert.ok(html.includes(JSON.stringify(f)), `${f} embedded`);
  }
});

test('Uzbek guide is generated from current data', () => {
  const before = readFileSync(join(ROOT, 'docs/guide-uz.md'), 'utf8');
  execFileSync(process.execPath, [join(ROOT, 'tools/build-docs.mjs')], { cwd: ROOT, stdio: 'pipe' });
  assert.equal(readFileSync(join(ROOT, 'docs/guide-uz.md'), 'utf8'), before, 'run: npm run build:docs');
});
