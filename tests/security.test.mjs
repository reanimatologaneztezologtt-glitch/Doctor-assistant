import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFiles, read } from './helpers.mjs';

test('.env is git-ignored', () => {
  const lines = read('.gitignore').split('\n').map((l) => l.trim());
  assert.ok(lines.includes('.env'));
});

test('no API keys or analytics in the repository', () => {
  const files = listFiles('.').filter((p) => /\.(js|mjs|html|json|css|md|webmanifest)$/.test(p));
  for (const path of files) {
    const text = read(path);
    assert.doesNotMatch(text, /sk-ant-[A-Za-z0-9]/, `possible API key in ${path}`);
    if (path.startsWith('tests/')) continue;
    assert.doesNotMatch(text, /googletagmanager|google-analytics|gtag\(|yandex\.ru\/metrika|facebook\.net/, `analytics in ${path}`);
  }
});

test('page loads no third-party resources (CSP self only)', () => {
  const html = read('index.html');
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /(src|href)="https?:\/\//);
});
