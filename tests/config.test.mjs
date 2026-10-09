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
  const sub = { planId: 'monthly', status: 'active', periodEnd: '2030-01-01T00:00:00Z' };
  assert.equal(effectivePlan({ subscription: sub }, config), 'free');
  assert.equal(effectivePlan(null, config), 'free');
});

test('subscription stays active until period end after cancel', () => {
  const live = { ...config, testMode: false };
  const now = Date.parse('2029-06-01T00:00:00Z');
  const active = { planId: 'monthly', status: 'active', periodEnd: '2029-07-01T00:00:00Z' };
  assert.equal(effectivePlan({ subscription: active }, live, now), 'monthly');
  const cancelled = { ...active, status: 'cancelled' };
  assert.equal(effectivePlan({ subscription: cancelled }, live, now), 'monthly');
  assert.equal(effectivePlan({ subscription: cancelled }, live, Date.parse('2029-07-02T00:00:00Z')), 'free');
  assert.equal(effectivePlan({ subscription: { ...active, status: 'paused' } }, live, now), 'free');
  assert.equal(effectivePlan({}, live, now), 'free');
});

test('validator rejects payments enabled during test mode', () => {
  const bad = { ...config, paymentsEnabled: true };
  assert.ok(validateConfig(bad).some((e) => e.includes('paymentsEnabled')));
  assert.ok(validateConfig({ ...config, aiEnabled: 'yes' }).length > 0);
});
