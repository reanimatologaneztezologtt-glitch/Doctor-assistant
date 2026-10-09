import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { listFiles, read, readJson } from './helpers.mjs';
import { createService, ServiceError } from '../js/core/service.js';
import { createStore } from '../js/core/store.js';
import { allowedRange, thresholdValues, validateThreshold, resolveParameters, validatePlanField } from '../js/core/thresholds.js';
import { computeMeasurements } from '../js/core/measurements.js';
import { evaluateRules } from '../js/core/rules.js';
import { getByPath, leafKeys } from '../js/core/i18n.js';

const catalog = readJson('data/thresholds.json');
const config = readJson('config/app.json');
const plans = readJson('data/plans.json');
const rules = readJson('data/rules.json');
const specialties = readJson('data/specialties.json');
const PCT = config.adminLimits.maxDeviationPct;
const published = thresholdValues(catalog);
const fakeHasher = { hash: async (p) => `plain$${p}`, verify: async (p, h) => h === `plain$${p}` };

async function setup() {
  const store = createStore();
  const service = createService({ store, hasher: fakeHasher, randomId: randomUUID, config, plans, rules, specialties, thresholds: catalog });
  const reg = (email, role) => service.register({ fullName: email, email, password: 'password1', role, specialty: 'cardiology', institution: 'I', licenseNumber: 'L', confirmAccurate: true });
  const admin = await reg('admin@x.uz', 'resident');
  service.grantAdmin('admin@x.uz');
  const doc = await reg('doc@x.uz', 'doctor');
  return { store, service, admin: () => service.getUser(admin.id), doc: () => service.getUser(doc.id) };
}
const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof ServiceError); return e; } assert.fail('expected error'); };

test('allowed range is ±maxDeviationPct of the published value', () => {
  const lavi = catalog.thresholds.find((t) => t.id === 'lavi_high');
  assert.deepEqual(allowedRange(lavi, 20), { min: 27, max: 41 });
  assert.deepEqual(validateThreshold(catalog, published, 'lavi_high', 41, 20), []);
  assert.equal(validateThreshold(catalog, published, 'lavi_high', 41.5, 20)[0].code, 'outOfBounds');
  assert.equal(validateThreshold(catalog, published, 'lavi_high', 26.9, 20)[0].code, 'outOfBounds');
  assert.equal(validateThreshold(catalog, published, 'lavi_high', Number.NaN, 20)[0].code, 'notNumber');
  assert.equal(validateThreshold(catalog, published, 'nope', 1, 20)[0].code, 'notFound');
});

test('order constraints cannot be broken (lower < upper, grade order)', () => {
  // as_moderate 3.0 may go to 2.4..3.6, but must stay above as_mild (2.6) and below as_severe (4.0)
  assert.equal(validateThreshold(catalog, published, 'as_moderate', 2.5, 20)[0].code, 'orderViolation');
  assert.deepEqual(validateThreshold(catalog, published, 'as_moderate', 2.9, 20), []);
  // dd_ea_low 0.8 -> max 0.96, dd_ea_high 2 -> min 1.6: both fine and ordered
  assert.deepEqual(validateThreshold(catalog, published, 'dd_ea_low', 0.96, 20), []);
  const ids = new Set(catalog.thresholds.map((t) => t.id));
  const low = catalog.thresholds.filter((t) => t.bound === 'low' && ids.has(t.id.replace('_low', '_high')));
  assert.ok(low.length > 20);
  for (const t of low) assert.ok(catalog.order.some(([a]) => a === t.id), `${t.id} has an order constraint`);
});

test('admin overrides: allowed changes apply, limits are enforced, everything is logged', async () => {
  const { service, admin, doc } = await setup();
  assert.equal(code(() => service.setOverride(doc(), 'threshold:lavi_high', 36)).code, 'forbidden');
  const e = code(() => service.setOverride(admin(), 'threshold:lavi_high', 50));
  assert.equal(e.code, 'limitExceeded');
  assert.equal(e.details[0].code, 'outOfBounds');
  service.setOverride(admin(), 'threshold:lavi_high', 36);
  assert.equal(service.effective().thresholds.lavi_high, 36);
  // The rule engine follows the new cut-off.
  const thr = service.effective().thresholds;
  assert.equal(evaluateRules(rules.rules, { lavi: 35 }, thr).some((f) => f.ruleId === 'la_enlarged'), false);
  assert.equal(evaluateRules(rules.rules, { lavi: 35 }, published).some((f) => f.ruleId === 'la_enlarged'), true);
  const log = service.journal(admin(), 'settings');
  assert.deepEqual([log[0].key, log[0].oldValue, log[0].newValue, log[0].sourceValue], ['threshold:lavi_high', 34, 36, 34]);
  service.resetOverride(admin(), 'threshold:lavi_high');
  assert.equal(service.effective().thresholds.lavi_high, 34);
  assert.equal(service.journal(admin(), 'settings')[0].reset, true);
  assert.equal(code(() => service.resetOverride(admin(), 'threshold:lavi_high')).code, 'notFound');
});

test('norms follow overrides; resetting one bound cannot break the order', async () => {
  const { service, admin } = await setup();
  service.setOverride(admin(), 'threshold:lvef_low_m', 55);
  const params = resolveParameters(readJson('data/parameters.json'), service.effective().thresholds);
  const lvef = params.sections.flatMap((s) => s.parameters).find((p) => p.id === 'lvef');
  assert.equal(lvef.norms.find((n) => n.sex === 1).low, 55);
  assert.equal(lvef.norms.find((n) => n.sex === 1).lowId, 'lvef_low_m');
  // as_mild up to 2.9 needs as_moderate above it; reset of as_moderate to 3.0 keeps order
  service.setOverride(admin(), 'threshold:as_moderate', 3.5);
  service.setOverride(admin(), 'threshold:as_mild', 3.1);
  assert.equal(code(() => service.resetOverride(admin(), 'threshold:as_moderate')).code, 'limitExceeded');
});

test('derived RAP follows the IVC cut-off override', async () => {
  const { service, admin } = await setup();
  const params = readJson('data/parameters.json');
  const at = (thr) => computeMeasurements(resolveParameters(params, thr), { ivc: 22, ivc_collapse: 60 }, thr).values.rap;
  assert.equal(at(service.effective().thresholds), 8);
  service.setOverride(admin(), 'threshold:ivc_high', 23);
  assert.equal(at(service.effective().thresholds), 3);
});

test('plan limits and settings: bounded; payments stay locked', async () => {
  const { service, admin, doc } = await setup();
  service.setOverride(admin(), 'plan:free:dailyRequests', 5);
  assert.equal(service.aiQuota(doc()).dailyLimit, 5);
  assert.equal(code(() => service.setOverride(admin(), 'plan:free:dailyRequests', 5000)).code, 'limitExceeded');
  assert.equal(code(() => service.setOverride(admin(), 'plan:free:maxTokens', 100)).code, 'limitExceeded');
  assert.equal(code(() => service.setOverride(admin(), 'plan:free:price', 1000)).code, 'limitExceeded');
  assert.equal(code(() => service.setOverride(admin(), 'plan:monthly:status', 'deleted')).code, 'limitExceeded');
  assert.deepEqual(validatePlanField(plans, 'monthly', 'price', 50000), []);
  service.setOverride(admin(), 'config:aiEnabled', false);
  assert.equal(service.effective().config.aiEnabled, false);
  assert.equal(code(() => service.setOverride(admin(), 'config:paymentsEnabled', true)).code, 'limitExceeded');
  assert.equal(code(() => service.setOverride(admin(), 'config:aiEnabled', 'yes')).code, 'limitExceeded');
  assert.equal(code(() => service.setOverride(admin(), 'unknown:x', 1)).code, 'notFound');
});

test('texts use only known placeholders, and every number-bearing rule text is parameterised', () => {
  const allowed = new Set([...catalog.thresholds.map((t) => t.id), 'step', 'count', 'pct', 'min', 'max', 'lower', 'upper', 'published',
    'used', 'limit', 'total', 'passed', 'plan', 'calculator', 'values', 'specialty', 'password', 'source']);
  for (const lang of ['uz', 'ru', 'en']) {
    const d = readJson(`data/i18n/${lang}.json`);
    for (const key of leafKeys(d)) {
      for (const m of getByPath(d, key).matchAll(/\{(\w+)\}/g)) assert.ok(allowed.has(m[1]), `${lang}:${key} uses unknown {${m[1]}}`);
    }
    for (const r of rules.rules) {
      for (const v of [...r.when.matchAll(/[a-z_]+/g)].map((m) => m[0]).filter((v) => published[v] !== undefined)) {
        if (['dd_preserved_ef_normal', 'dd_preserved_ef_indeterminate', 'dd_preserved_ef_dysfunction'].includes(r.id) && v !== 'dd_ef_cut') continue;
        assert.ok(d.rules[r.id].includes(`{${v}}`), `${lang}:rules.${r.id} should show {${v}}`);
      }
    }
  }
});

test('every client file that reads cut-offs passes them through', () => {
  for (const f of listFiles('js/views')) {
    const src = read(f);
    for (const call of ['computeMeasurements(', 'evaluateRules(', 'runCalculator(']) {
      for (const m of src.matchAll(new RegExp(`${call.replace('(', '\\(')}[^;]*;`, 'g'))) {
        assert.ok(/ctx\.thr|thresholdValues|published/.test(m[0]), `${f}: ${m[0].slice(0, 80)}`);
      }
    }
  }
});
