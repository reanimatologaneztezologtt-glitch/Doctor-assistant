import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFiles, read, readJson } from './helpers.mjs';
import { createTranslator, getByPath, interpolate, leafKeys, pickLanguage } from '../js/core/i18n.js';

const config = readJson('config/app.json');
const dicts = Object.fromEntries(config.supportedLanguages.map((l) => [l, readJson(`data/i18n/${l}.json`)]));
const has = (key) => Object.values(dicts).every((d) => typeof getByPath(d, key) === 'string');
const missing = (keys) => keys.filter((k) => !has(k));

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

test('every static key used in HTML and JS exists', () => {
  const used = [...read('index.html').matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map((m) => m[1]);
  for (const file of listFiles('js').filter((f) => f.endsWith('.js'))) {
    used.push(...[...read(file).matchAll(/\bt\('([a-zA-Z0-9_.-]+)'/g)].map((m) => m[1]));
    used.push(...[...read(file).matchAll(/['`]((?:account|plans\.col|journal|errors|norm|ui|calc|conclusion|questions|ai|admin|rule|param|echo|home)\.[a-zA-Z0-9_.]+)['`]/g)].map((m) => m[1]));
  }
  for (const item of readJson('data/navigation.json').items) used.push(item.labelKey);
  assert.ok(used.length > 100);
  assert.deepEqual(missing([...new Set(used)]), []);
});

test('every data-driven key exists (parameters, rules, calculators, lists)', () => {
  const keys = [];
  const parameters = readJson('data/parameters.json');
  const units = new Set();
  for (const s of parameters.sections) {
    keys.push(`echoSections.${s.id}`);
    for (const p of s.parameters) {
      for (const f of ['name', 'abbr', 'def', 'method', 'significance']) keys.push(`params.${p.id}.${f}`);
      if (!p.norms) keys.push(`params.${p.id}.normNote`);
      if (p.diagram) keys.push(`diagrams.${p.diagram}`);
      if (p.unit) units.add(p.unit);
    }
  }
  const paramIds = new Set(parameters.sections.flatMap((s) => s.parameters.map((p) => p.id)));
  for (const id of readJson('data/formulas/index.json').calculators) {
    const f = readJson(`data/formulas/${id}.json`);
    keys.push(`calc.${id}.title`, `calc.${id}.note`);
    for (const i of f.inputs) {
      if (i.unit) units.add(i.unit);
      if (i.type === 'select') i.options.forEach((o) => keys.push(o.labelKey));
      else assert.ok(paramIds.has(i.id), `calculator input ${id}.${i.id} must be a known parameter`);
    }
    for (const o of f.outputs) {
      if (o.unit) units.add(o.unit);
      if (!paramIds.has(o.id)) keys.push(`outputs.${o.id}.name`, `outputs.${o.id}.abbr`);
      if (o.categories) keys.push(...Object.values(o.categories));
    }
  }
  units.delete('ratio');
  for (const u of units) keys.push(`units.${u}.sym`, `units.${u}.other`, `units.${u}.one`);
  for (const r of readJson('data/rules.json').rules) keys.push(`rules.${r.id}`);
  const sp = readJson('data/specialties.json');
  sp.specialties.forEach((s) => keys.push(`specialties.${s.id}`));
  sp.studyDirections.forEach((s) => keys.push(`studyDirections.${s.id}`));
  for (const p of readJson('data/plans.json').plans) {
    keys.push(`plans.${p.id}.name`, `planStatus.${p.status}`);
    if (p.period) keys.push(`periods.${p.period}`);
  }
  for (const r of ['doctor', 'resident', 'student']) keys.push(`roles.${r}`);
  for (const v of ['pending', 'approved', 'rejected', 'not_required']) keys.push(`verification.${v}`);
  for (const s of ['low', 'normal', 'high']) keys.push(`status.${s}`);
  assert.deepEqual(missing(keys), []);
});

test('every error code thrown by the backend has a message', () => {
  const codes = new Set();
  for (const file of ['js/core/service.js', 'server/app.mjs', 'server/ai.mjs', 'js/api/demo.js']) {
    for (const m of read(file).matchAll(/ServiceError\('([a-zA-Z]+)'|error: '([a-zA-Z]+)'|code: '([a-zA-Z]+)'/g)) codes.add(m[1] || m[2] || m[3]);
  }
  for (const m of read('js/core/policy.js').matchAll(/reason: '([a-zA-Z]+)'/g)) codes.add(m[1]);
  for (const m of read('js/core/ai-guard.js').matchAll(/return '([a-zA-Z]+)';/g)) codes.add(m[1]);
  codes.delete('cancelled');
  for (const fieldCode of ['required', 'invalidEmail', 'passwordShort', 'invalidRole', 'mustConfirm']) codes.delete(fieldCode);
  for (const m of read('js/core/policy.js').matchAll(/code: '([a-zA-Z]+)'/g)) assert.ok(has(`errors.field.${m[1]}`), `errors.field.${m[1]}`);
  assert.ok(codes.size > 20);
  assert.deepEqual(missing([...codes].map((c) => `errors.${c}`)), []);
});

test('Uzbek texts are in Cyrillic script', () => {
  // Latin is allowed only for international abbreviations, guideline, method and unit names.
  const allowedLatin = new Set(['AI', 'ASE', 'EACVI', 'ESC', 'ERS', 'Teichholz', 'Simpson', 'Devereux', 'Mosteller', 'Rudski',
    'RWT', 'E', 'A', 'e', 'PASP', 'TRV', 'RAP', 'IVC', 'TAPSE', 'FAC', 'RVD', 'S', 'PA', 'Vmax', 'M', 'uz', 'Cyrl',
    'Ctrl', 'C', 'I', 'II', 'III', 'V', 'v', 'P', 'max', 'tokens', 'stub', 'paymentsEnabled', 'false', 'aiEnabled', 'ANTHROPIC', 'API', 'KEY', 'config', 'app', 'json']);
  for (const key of leafKeys(dicts.uz)) {
    const words = getByPath(dicts.uz, key).replace(/\{\w+\}/g, '').match(/[A-Za-z]+/g) || [];
    for (const word of words) assert.ok(allowedLatin.has(word), `uz:${key} contains Latin word "${word}"`);
  }
});

test('disclaimer text matches the specification in all three languages', () => {
  assert.equal(dicts.uz.disclaimer.text, 'Таълим мақсадида. Клиник қарорни малакали шифокор қабул қилади.');
  assert.equal(dicts.ru.disclaimer.text, 'В образовательных целях. Клиническое решение принимает квалифицированный врач.');
  assert.equal(dicts.en.disclaimer.text, 'For educational purposes. Clinical decisions are made by a qualified physician.');
});

test('AI label is present in all three languages', () => {
  assert.equal(dicts.uz.ai.label, 'AI томонидан тайёрланган, врач тасдиғисиз');
  assert.ok(dicts.ru.ai.label && dicts.en.ai.label);
});

test('translator: interpolation and fallback', () => {
  const miss = [];
  const t = createTranslator({ a: 'Step {step}' }, { b: 'fallback' }, (k) => miss.push(k));
  assert.equal(t('a', { step: 3 }), 'Step 3');
  assert.equal(t('b'), 'fallback');
  assert.equal(t('c'), '[c]');
  assert.deepEqual(miss, ['c']);
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
