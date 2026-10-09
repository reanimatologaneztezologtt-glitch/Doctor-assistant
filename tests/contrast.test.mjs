import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './helpers.mjs';

// WCAG 2.1 relative luminance and contrast ratio
// (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function parseBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `block ${selector} not found`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[name] = value.trim();
  return vars;
}

const css = read('css/tokens.css');
const light = parseBlock(css, ':root');
const dark = { ...light, ...parseBlock(css, ':root[data-theme="dark"]') };

function resolveColor(vars, name) {
  let v = vars[name];
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  if (ref) v = vars[ref[1]];
  assert.match(v, /^#[0-9a-fA-F]{6}$/, `--${name} must be a 6-digit hex`);
  return v;
}

// [foreground, background, minimum ratio]
const TEXT = 4.5;
const UI = 3;
const PAIRS = [
  ['color-text', 'color-bg', TEXT],
  ['color-text', 'color-surface', TEXT],
  ['color-text', 'color-surface-raised', TEXT],
  ['color-text-muted', 'color-bg', TEXT],
  ['color-text-muted', 'color-surface', TEXT],
  ['color-accent', 'color-bg', TEXT],
  ['color-accent', 'color-surface', TEXT],
  ['color-on-accent', 'color-accent', TEXT],
  ['color-arterial', 'color-bg', TEXT],
  ['color-arterial', 'color-surface', TEXT],
  ['color-venous', 'color-bg', TEXT],
  ['color-notice-text', 'color-notice-bg', TEXT],
  ['color-focus', 'color-bg', UI],
  ['color-focus', 'color-surface', UI],
];

for (const [themeName, vars] of [['light', light], ['dark', dark]]) {
  test(`WCAG AA contrast, ${themeName} theme`, () => {
    for (const [fg, bg, min] of PAIRS) {
      const ratio = contrast(resolveColor(vars, fg), resolveColor(vars, bg));
      assert.ok(ratio >= min, `${themeName}: --${fg} on --${bg} = ${ratio.toFixed(2)} < ${min}`);
    }
  });
}

test('blood colors follow the spec in the light theme', () => {
  assert.equal(light['color-arterial'].toLowerCase(), '#c62828');
  assert.equal(light['color-venous'].toLowerCase(), '#1565c0');
});

test('contrast helper reference values', () => {
  // Black on white is exactly 21:1 by definition.
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9);
  assert.ok(Math.abs(contrast('#ffffff', '#ffffff') - 1) < 1e-9);
});

test('reduced motion is respected', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
