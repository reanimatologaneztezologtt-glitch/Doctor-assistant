import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './helpers.mjs';
import { effectivePlan, paymentsActive, validateConfig } from '../js/core/config.js';

const config = readJson('config/app.json');

test('config/app.json is valid', () => {
  assert.deepEqual(validateConfig(config), []);
});

test('stage 1 flags: testMode on, payments off, AI on', () => {
  assert.equal(config.testMode, true);
  assert.equal(config.paymentsEnabled, false);
  assert.equal(config.aiEnabled, true);
  assert.equal(paymentsActive(config), false);
});

test('test mode forces the free plan for everyone', () => {
  assert.equal(effectivePlan({ plan: 'subscriber' }, config), 'free');
  assert.equal(effectivePlan(null, config), 'free');
  const live = { ...config, testMode: false };
  assert.equal(effectivePlan({ plan: 'subscriber' }, live), 'subscriber');
  assert.equal(effectivePlan({ plan: 'unknown' }, live), 'free');
});

test('validator rejects payments enabled during test mode', () => {
  const bad = { ...config, paymentsEnabled: true };
  assert.ok(validateConfig(bad).some((e) => e.includes('paymentsEnabled')));
  assert.ok(validateConfig({ ...config, aiEnabled: 'yes' }).length > 0);
});
