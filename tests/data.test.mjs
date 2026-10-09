import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, readJson } from './helpers.mjs';
import { parse, variables } from '../js/core/expr.js';
import { allParameters, computeMeasurements, paramStatus } from '../js/core/measurements.js';
import { evaluateRules } from '../js/core/rules.js';
import { resolveParameters, thresholdValues } from '../js/core/thresholds.js';

const sources = new Set(readJson('data/sources.json').sources.map((s) => s.id));
const catalog = readJson('data/thresholds.json');
const thr = thresholdValues(catalog);
const rawParameters = readJson('data/parameters.json');
const parameters = resolveParameters(rawParameters, thr);
const params = allParameters(parameters);
const rules = readJson('data/rules.json').rules;
const specialties = new Set(readJson('data/specialties.json').specialties.map((s) => s.id));

test('thresholds: unique ids, no clash with measurement names, every norm id exists', () => {
  const ids = catalog.thresholds.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const paramIds = new Set(params.map((p) => p.id));
  for (const id of ids) assert.ok(!paramIds.has(id), `threshold ${id} clashes with a parameter`);
  for (const t of catalog.thresholds) assert.ok(sources.has(t.sourceId), `${t.id}: ${t.sourceId}`);
  for (const p of allParameters(rawParameters)) {
    for (const n of p.norms || []) for (const b of ['low', 'high']) if (b in n) assert.ok(n[b] in thr, `${p.id}.${b} -> ${n[b]}`);
  }
  for (const [a, b] of catalog.order) assert.ok(thr[a] < thr[b], `published order ${a} < ${b}`);
});

test('every parameter, formula and rule cites a known source', () => {
  for (const p of params) assert.ok(sources.has(p.sourceId), `param ${p.id}: ${p.sourceId}`);
  for (const id of readJson('data/formulas/index.json').calculators) {
    const f = readJson(`data/formulas/${id}.json`);
    for (const s of f.sourceIds) assert.ok(sources.has(s), `formula ${id}: ${s}`);
    for (const n of f.norms || []) assert.ok(sources.has(n.sourceId), `formula ${id} norm: ${n.sourceId}`);
  }
  for (const r of rules) assert.ok(sources.has(r.sourceId), `rule ${r.id}: ${r.sourceId}`);
});

test('parameter ids are unique and derive formulas reference known parameters', () => {
  const ids = params.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of params.filter((x) => x.derive)) {
    for (const v of variables(parse(p.derive))) assert.ok(ids.includes(v) || v in thr, `${p.id} uses unknown ${v}`);
  }
});

test('rules: valid specialty, expressions parse, variables are declared in requires', () => {
  const ids = new Set(params.map((p) => p.id));
  const seen = new Set();
  for (const r of rules) {
    assert.ok(!seen.has(r.id), `duplicate rule ${r.id}`);
    seen.add(r.id);
    assert.ok(specialties.has(r.specialty), `${r.id}: specialty ${r.specialty}`);
    for (const v of variables(parse(r.when))) {
      if (v in thr) continue; // named cut-off
      assert.ok(r.requires.includes(v), `${r.id}: ${v} not in requires`);
      assert.ok(ids.has(v), `${r.id}: unknown parameter ${v}`);
    }
  }
});

test('ASE/EACVI 2015 reference values are stored as published', () => {
  const p = Object.fromEntries(params.map((x) => [x.id, x]));
  const norm = (id, sex) => p[id].norms.find((n) => n.sex === sex) || p[id].norms[0];
  assert.deepEqual([norm('lvef', 1).low, norm('lvef', 1).high], [52, 72]);
  assert.deepEqual([norm('lvef', 2).low, norm('lvef', 2).high], [54, 74]);
  assert.deepEqual([norm('lvedd', 1).low, norm('lvedd', 1).high], [42.0, 58.4]);
  assert.deepEqual([norm('lvedd', 2).low, norm('lvedd', 2).high], [37.8, 52.2]);
  assert.deepEqual([norm('lvmi', 1).high, norm('lvmi', 2).high], [115, 95]);
  assert.equal(norm('rwt').high, 0.42);
  assert.equal(norm('lavi').high, 34);
  assert.equal(norm('tapse').low, 17);
  assert.equal(norm('rv_sprime').low, 9.5);
  assert.equal(norm('rv_fac').low, 35);
  assert.equal(norm('rv_basal').high, 41);
  assert.equal(norm('ee_avg').high, 14);
  assert.equal(norm('e_sept').low, 7);
  assert.equal(norm('e_lat').low, 10);
  assert.equal(norm('trv').high, 2.8);
});

test('derived measurements and status', () => {
  const { values, derived } = computeMeasurements(parameters, { height: 175, weight: 75, lvedv: 120, lvesv: 50, ivsd: 10, lvedd: 50, pwd: 10, e_vel: 80, a_vel: 60, e_sept: 8, e_lat: 12, trv: 3, ivc: 18, ivc_collapse: 60 }, thr);
  assert.ok(Math.abs(values.bsa - 1.9094) < 1e-3);
  assert.ok(Math.abs(values.lvef - 58.333) < 1e-3);
  assert.ok(Math.abs(values.lvmi - 95.305) < 1e-2);
  assert.ok(Math.abs(values.ee_avg - 8) < 1e-9);
  assert.equal(values.rap, 3);
  assert.equal(values.pasp, 39);
  assert.ok(derived.has('pasp'));
  const lvef = params.find((x) => x.id === 'lvef');
  assert.equal(paramStatus(lvef, 53, 2), 'low');
  const coll = params.find((x) => x.id === 'ivc_collapse');
  assert.equal(paramStatus(coll, 50), 'low'); // > 50% is normal, 50% is not
});

test('teaching case produces the expected draft findings', () => {
  const demo = readJson('data/cases/demo-1.json');
  assert.equal(demo.synthetic, true);
  const { values } = computeMeasurements(parameters, demo.measurements, thr);
  const found = evaluateRules(rules, values, thr).map((f) => f.ruleId).sort();
  assert.deepEqual(found, [
    'dd_preserved_ef_dysfunction', 'la_enlarged', 'lv_concentric_hypertrophy', 'ph_trv_intermediate', 'rap_intermediate', 'tapse_pasp_low',
  ].sort());
});

test('diastolic algorithm, preserved EF (ASE/EACVI 2016): 0-1 normal, 2 indeterminate, 3-4 dysfunction', () => {
  const base = { lvef: 60, ee_avg: 10, e_sept: 8, e_lat: 11, trv: 2.5, lavi: 30 };
  const ids = (v) => evaluateRules(rules, v, thr).map((f) => f.ruleId).filter((id) => id.startsWith('dd_'));
  assert.deepEqual(ids(base), ['dd_preserved_ef_normal']);
  assert.deepEqual(ids({ ...base, ee_avg: 15 }), ['dd_preserved_ef_normal']);
  assert.deepEqual(ids({ ...base, ee_avg: 15, trv: 3 }), ['dd_preserved_ef_indeterminate']);
  assert.deepEqual(ids({ ...base, ee_avg: 15, trv: 3, lavi: 40 }), ['dd_preserved_ef_dysfunction']);
  assert.deepEqual(ids({ ...base, ee_avg: 14 }), ['dd_preserved_ef_normal']); // > 14 is positive, 14 is not
});

test('diastolic algorithm, reduced EF (ASE/EACVI 2016)', () => {
  const ids = (v) => evaluateRules(rules, v, thr).map((f) => f.ruleId).filter((id) => id.startsWith('dd_'));
  assert.deepEqual(ids({ lvef: 35, ea: 0.7, e_vel: 45 }), ['dd_reduced_ef_grade1']);
  assert.deepEqual(ids({ lvef: 35, ea: 2.1, e_vel: 90 }), ['dd_reduced_ef_grade3']);
  assert.deepEqual(ids({ lvef: 35, ea: 1.2, e_vel: 80, ee_avg: 16, trv: 3.0, lavi: 30 }), ['dd_reduced_ef_grade2']);
  assert.deepEqual(ids({ lvef: 35, ea: 1.2, e_vel: 80, ee_avg: 10, trv: 3.0, lavi: 30 }), ['dd_reduced_ef_grade1_by_criteria']);
});

test('exactly one RAP, PH-probability and AS rule fires for any value', () => {
  for (const ivc of [10, 21, 22, 30]) {
    for (const c of [0, 49, 50, 51, 100]) {
      const n = evaluateRules(rules, { ivc, ivc_collapse: c }, thr).filter((f) => f.ruleId.startsWith('rap_')).length;
      assert.equal(n, 1, `ivc ${ivc}, collapse ${c}`);
    }
  }
  for (const trv of [1, 2.8, 2.81, 3.4, 3.41, 5]) {
    assert.equal(evaluateRules(rules, { trv }, thr).filter((f) => f.ruleId.startsWith('ph_trv')).length, 1, `trv ${trv}`);
  }
  for (const [v, id] of [[2.5, null], [2.6, 'as_mild'], [3.0, 'as_moderate'], [3.99, 'as_moderate'], [4.0, 'as_severe']]) {
    const f = evaluateRules(rules, { av_vmax: v }, thr).filter((x) => x.ruleId.startsWith('as_')).map((x) => x.ruleId);
    assert.deepEqual(f, id ? [id] : []);
  }
});

test('every source short name carries a year (shown next to each norm)', () => {
  for (const s of readJson('data/sources.json').sources) assert.match(s.short, /\b(19|20)\d{2}\b/, s.id);
  assert.match(read('js/views/echo.js'), /normLine\(ctx, param, sex\)\} · \$\{sourceShort\(ctx, param\.sourceId\)\}/);
});
