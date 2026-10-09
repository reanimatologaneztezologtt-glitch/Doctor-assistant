import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, readJson } from './helpers.mjs';
import { createTranslator, getByPath, interpolate, leafKeys, pickLanguage } from '../js/core/i18n.js';

const config = readJson('config/app.json');
const dicts = Object.fromEntries(config.supportedLanguages.map((l) => [l, readJson(`data/i18n/${l}.json`)]));

test('all languages have exactly the same keys', () => {
  const reference = leafKeys(dicts.uz).sort();
  for (const [lang, dict] of Object.entries(dicts)) {
    assert.deepEqual(leafKeys(dict).sort(), reference, `key mismatch in ${lang}.json`);
  }
});

test('no empty translations', () => {
  for (const [lang, dict] of Object.entries(dicts)) {
    for (const key of leafKeys(dict)) {
      const value = getByPath(dict, key);
      assert.equal(typeof value, 'string', `${lang}:${key}`);
      assert.ok(value.trim().length > 0, `${lang}:${key} is empty`);
    }
  }
});

test('every key used in index.html and navigation.json exists', () => {
  const html = read('index.html');
  const used = [...html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map((m) => m[1]);
  for (const item of readJson('data/navigation.json').items) {
    used.push(item.labelKey);
    if (item.bodyKey) used.push(item.bodyKey);
  }
  const jsKeys = [...read('js/app.js').matchAll(/\bt\('([a-zA-Z.]+)'/g)].map((m) => m[1]);
  used.push(...jsKeys);
  assert.ok(used.length > 10);
  for (const key of used) {
    for (const [lang, dict] of Object.entries(dicts)) {
      assert.equal(typeof getByPath(dict, key), 'string', `missing ${lang}:${key}`);
    }
  }
});

test('Uzbek texts are in Cyrillic script', () => {
  // Latin is allowed only for international abbreviations, guideline and method names.
  const allowedLatin = new Set(['AI', 'ASE', 'EACVI', 'Teichholz', 'Simpson', 'Devereux', 'RWT', 'E', 'A', 'e', 'PASP', 'uz', 'Cyrl']);
  for (const key of leafKeys(dicts.uz)) {
    const words = getByPath(dicts.uz, key).replace(/\{\w+\}/g, "").match(/[A-Za-z]+/g) || [];
    for (const word of words) {
      assert.ok(allowedLatin.has(word), `uz:${key} contains Latin word "${word}"`);
    }
  }
});

test('disclaimer text matches the specification in all three languages', () => {
  assert.equal(dicts.uz.disclaimer.text, 'Таълим мақсадида. Клиник қарорни малакали шифокор қабул қилади.');
  assert.equal(dicts.ru.disclaimer.text, 'В образовательных целях. Клиническое решение принимает квалифицированный врач.');
  assert.equal(dicts.en.disclaimer.text, 'For educational purposes. Clinical decisions are made by a qualified physician.');
});

test('translator: interpolation and fallback', () => {
  const missing = [];
  const t = createTranslator({ a: 'Step {step}' }, { b: 'fallback' }, (k) => missing.push(k));
  assert.equal(t('a', { step: 3 }), 'Step 3');
  assert.equal(t('b'), 'fallback');
  assert.equal(t('c'), '[c]');
  assert.deepEqual(missing, ['c']);
  assert.equal(interpolate('{x} {y}', { x: 1 }), '1 {y}');
  assert.equal(pickLanguage('fr', ['uz', 'ru', 'en'], 'uz'), 'uz');
  assert.equal(pickLanguage('ru', ['uz', 'ru', 'en'], 'uz'), 'ru');
});

test('index.html has no hard-coded visible text outside <noscript>', () => {
  const body = read('index.html')
    .replace(/<head>[\s\S]*<\/head>/, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  assert.equal(body, '');
});
