import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './helpers.mjs';
import { compute, parse, variables } from '../js/core/expr.js';
import { findNorm, normStatus, runCalculator, runReferenceTests } from '../js/core/calc.js';

const ids = readJson('data/formulas/index.json').calculators;
const formulas = ids.map((id) => readJson(`data/formulas/${id}.json`));

test('expression evaluator: arithmetic, precedence, logic, functions', () => {
  assert.equal(compute('1 + 2 * 3', {}), 7);
  assert.equal(compute('(1 + 2) * 3', {}), 9);
  assert.equal(compute('2 ^ 3 ^ 2', {}), 512); // right-associative
  assert.equal(compute('-2 ^ 2', {}), -4);
  assert.equal(compute('sqrt(16) + abs(-2) + min(3, 1) + max(3, 1)', {}), 10);
  assert.equal(compute('if(x > 2, 10, 20)', { x: 3 }), 10);
  assert.equal(compute('(a > 1) + (b < 1 || c < 1) + !(d == 0)', { a: 2, b: 5, c: 0, d: 1 }), 3);
  assert.deepEqual([...variables(parse('a*b + if(c>1, d, 2)'))].sort(), ['a', 'b', 'c', 'd']);
  assert.throws(() => compute('x + 1', {}), ReferenceError);
  assert.throws(() => parse('alert(1)'), SyntaxError);
  assert.throws(() => parse('1 +'), SyntaxError);
  assert.throws(() => parse('a; b'), SyntaxError);
});

test('every calculator has at least one reference example with a tolerance', () => {
  for (const f of formulas) {
    assert.ok(Array.isArray(f.tests) && f.tests.length > 0, `${f.id} has no reference example`);
    for (const t of f.tests) assert.equal(typeof t.tolerance, 'number', `${f.id} test without tolerance`);
    assert.ok(f.sourceIds.length > 0, `${f.id} has no source`);
  }
});

// Each reference example is a separate test: a result outside tolerance fails.
for (const f of formulas) {
  test(`reference examples: ${f.id}`, () => {
    for (const r of runReferenceTests(f)) {
      assert.ok(r.pass, `${f.id} #${r.index} ${r.outputId}: expected ${r.expected} ±${r.tolerance}, got ${r.actual}`);
    }
  });
}

test('a result outside tolerance is reported as a failure', () => {
  const broken = { ...formulas[0], tests: [{ ...formulas[0].tests[0], expected: { ef: 60 }, tolerance: 0.01 }] };
  assert.equal(runReferenceTests(broken)[0].pass, false);
});

test('input validation: missing, out of range, invalid option', () => {
  const ef = formulas.find((f) => f.id === 'ef-simpson');
  assert.equal(runCalculator(ef, { lvedv: 120 }).ok, false);
  const r = runCalculator(ef, { lvedv: 5000, lvesv: 50, sex: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'outOfRange');
  assert.equal(runCalculator(ef, { lvedv: 120, lvesv: 50, sex: 3 }).errors[0].code, 'invalidOption');
});

test('sex-specific norms (ASE/EACVI 2015): EF 53% is normal for men, low for women', () => {
  const ef = formulas.find((f) => f.id === 'ef-simpson');
  const men = findNorm(ef.norms, 'ef', { sex: 1 });
  const women = findNorm(ef.norms, 'ef', { sex: 2 });
  assert.equal(normStatus(men, 53), 'normal');
  assert.equal(normStatus(women, 53), 'low');
  assert.equal(normStatus(men, 51.9), 'low');
});

test('RAP from IVC: boundary values (ASE 2010)', () => {
  const rap = formulas.find((f) => f.id === 'rap-ivc');
  const v = (ivc, c) => runCalculator(rap, { ivc, ivc_collapse: c }).outputs.rap;
  assert.equal(v(21, 51), 3);
  assert.equal(v(21, 50), 8);
  assert.equal(v(22, 49), 15);
  assert.equal(v(22, 50), 8);
});

test('RWT threshold 0.42 is inclusive-normal', () => {
  const lv = formulas.find((f) => f.id === 'lvmass-rwt');
  const n = findNorm(lv.norms, 'rwt', {});
  assert.equal(normStatus(n, 0.42), 'normal');
  assert.equal(normStatus(n, 0.43), 'high');
});
