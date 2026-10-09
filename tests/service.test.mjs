import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readJson } from './helpers.mjs';
import { createService, ServiceError } from '../js/core/service.js';
import { createStore } from '../js/core/store.js';
import { canApprove, validateRegistration } from '../js/core/policy.js';

const config = readJson('config/app.json');
const plans = readJson('data/plans.json');
const rules = readJson('data/rules.json');
const specialties = readJson('data/specialties.json');
const fakeHasher = { hash: async (p) => `plain$${p}`, verify: async (p, h) => h === `plain$${p}` };

function setup(cfg = config) {
  const store = createStore();
  const service = createService({ store, hasher: fakeHasher, randomId: randomUUID, config: cfg, plans, rules, specialties });
  const reg = async (email, role, extra = {}) => service.register({
    fullName: email, email, password: 'password1', role, specialty: role === 'student' ? undefined : 'cardiology',
    studyDirection: role === 'student' ? 'general_medicine' : undefined, institution: 'Inst', licenseNumber: 'L-1', confirmAccurate: true, ...extra,
  });
  const fresh = (id) => service.getUser(id);
  return { store, service, reg, fresh };
}

async function expectCode(promiseOrFn, code) {
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (e) {
    assert.ok(e instanceof ServiceError, `expected ServiceError, got ${e}`);
    assert.equal(e.code, code);
    return;
  }
  assert.fail(`expected ${code}`);
}

test('registration validation (spec 4.1)', () => {
  const ok = { fullName: 'A', email: 'a@b.uz', password: '12345678', role: 'doctor', specialty: 'cardiology', institution: 'I', licenseNumber: 'L', confirmAccurate: true };
  assert.deepEqual(validateRegistration(ok, specialties), []);
  const fields = (input) => validateRegistration(input, specialties).map((e) => e.field);
  assert.ok(fields({ ...ok, confirmAccurate: false }).includes('confirmAccurate'));
  assert.ok(fields({ ...ok, role: 'admin' }).includes('role'), 'admin cannot be self-assigned');
  assert.ok(fields({ ...ok, password: 'short' }).includes('password'));
  assert.ok(fields({ ...ok, specialty: 'unknown' }).includes('specialty'));
  assert.ok(fields({ ...ok, role: 'student', studyDirection: '' }).includes('studyDirection'));
  assert.ok(fields({ ...ok, licenseNumber: '' }).includes('licenseNumber'));
});

test('passwords are hashed and license numbers are not exposed', async () => {
  const { service, store, reg } = setup();
  const user = await reg('doc@x.uz', 'doctor');
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.licenseNumber, undefined);
  assert.notEqual(store.all('users')[0].passwordHash, 'password1');
  await expectCode(service.login('doc@x.uz', 'wrong'), 'badCredentials');
  assert.equal((await service.login('DOC@x.uz', 'password1')).email, 'doc@x.uz');
  await expectCode(reg('doc@x.uz', 'doctor'), 'emailTaken');
});

test('new doctor is pending; admin verifies; every decision is logged (spec 4.3)', async () => {
  const { service, reg, fresh } = setup();
  const doc = await reg('doc@x.uz', 'doctor');
  assert.equal(doc.verification, 'pending');
  const admin = await reg('admin@x.uz', 'resident');
  service.grantAdmin('admin@x.uz');
  assert.throws(() => service.verifyDoctor(fresh(doc.id), doc.id, 'approve'), (e) => e.code === 'forbidden');
  service.verifyDoctor(fresh(admin.id), doc.id, 'approve');
  assert.equal(fresh(doc.id).verification, 'approved');
  const log = service.journal(fresh(admin.id), 'verification');
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'approve');
  assert.equal(log[0].userId, doc.id);
  const admins = service.listUsers(fresh(admin.id));
  assert.equal(admins.find((u) => u.id === doc.id).licenseNumber, 'L-1', 'admin sees license for verification');
});

test('approval rights: verified doctors in own specialty; admin in any specialty (owner decision)', async () => {
  const { service, reg, fresh } = setup();
  const admin = await reg('admin@x.uz', 'doctor', { specialty: 'functional_diagnostics' });
  service.grantAdmin('admin@x.uz');
  service.verifyDoctor(fresh(admin.id), admin.id, 'approve');
  const cardio = await reg('c@x.uz', 'doctor');
  const anest = await reg('an@x.uz', 'doctor', { specialty: 'anesthesiology_icu' });
  const pending = await reg('p@x.uz', 'doctor');
  const resident = await reg('r@x.uz', 'resident');
  const student = await reg('s@x.uz', 'student');
  service.verifyDoctor(fresh(admin.id), cardio.id, 'approve');
  service.verifyDoctor(fresh(admin.id), anest.id, 'approve');

  const decide = (u) => () => service.decideRule(fresh(u.id), 'lvef_reduced', 'approve');
  await expectCode(decide(pending), 'notVerified');
  await expectCode(decide(resident), 'notDoctor');
  await expectCode(decide(student), 'notDoctor');
  await expectCode(decide(anest), 'otherSpecialty');
  await expectCode(() => service.decideRule(null, 'lvef_reduced', 'approve'), 'notSignedIn');
  const d = service.decideRule(fresh(cardio.id), 'lvef_reduced', 'approve');
  assert.equal(d.specialty, 'cardiology');
  assert.equal(service.ruleStatuses().lvef_reduced.doctorName, 'c@x.uz');
  assert.equal(d.actingAs, 'doctor');
  await expectCode(() => service.decideRule(fresh(cardio.id), 'lvef_reduced', 'revoke'), 'forbidden');
  const log = service.journal(fresh(admin.id), 'approval');
  assert.equal(log.length, 1);
  for (const field of ['doctorId', 'specialty', 'at', 'ruleId', 'action', 'actingAs']) assert.ok(log[0][field], `journal.${field}`);
  assert.equal(canApprove(null, 'cardiology').reason, 'notSignedIn');
});

test('admin approves, rejects and changes decisions in any specialty; history is kept', async () => {
  const { service, reg, fresh } = setup();
  const admin = await reg('admin@x.uz', 'resident');
  service.grantAdmin('admin@x.uz');
  const cardio = await reg('c@x.uz', 'doctor');
  service.verifyDoctor(fresh(admin.id), cardio.id, 'approve');
  service.decideRule(fresh(cardio.id), 'la_enlarged', 'approve');
  const changed = service.decideRule(fresh(admin.id), 'la_enlarged', 'reject');
  assert.equal(changed.actingAs, 'admin');
  assert.equal(service.ruleStatuses().la_enlarged.action, 'reject');
  service.decideRule(fresh(admin.id), 'la_enlarged', 'revoke');
  assert.equal(service.ruleStatuses().la_enlarged, undefined);
  assert.equal(service.ruleDecisions(fresh(admin.id)).length, 3);
  const log = service.journal(fresh(admin.id), 'approval');
  assert.deepEqual(log.map((j) => [j.action, j.previousAction, j.actingAs]), [['revoke', 'reject', 'admin'], ['reject', 'approve', 'admin'], ['approve', null, 'doctor']]);
  const concl = service.approveConclusion(fresh(admin.id), ['la_enlarged', 'lvef_reduced']);
  assert.equal(concl.actingAs, 'admin');
  // Admin may also revoke a doctor's verification.
  service.verifyDoctor(fresh(admin.id), cardio.id, 'revoke');
  assert.equal(fresh(cardio.id).verification, 'pending');
  assert.throws(() => service.ruleDecisions(fresh(cardio.id)), (e) => e.code === 'forbidden');
  // Answering questions remains with doctors.
  const s = await reg('s@x.uz', 'student');
  const q = service.createQuestion(fresh(s.id), { specialty: 'cardiology', text: 'Why index LAV?' });
  await expectCode(() => service.answerQuestion(fresh(admin.id), q.id, 'x'), 'notDoctor');
});

test('conclusion approval logs rule ids only, never measurement values', async () => {
  const { service, store, reg, fresh } = setup();
  const admin = await reg('admin@x.uz', 'resident');
  service.grantAdmin('admin@x.uz');
  const cardio = await reg('c@x.uz', 'doctor');
  service.verifyDoctor(fresh(admin.id), cardio.id, 'approve');
  const res = service.approveConclusion(fresh(cardio.id), ['lvef_reduced', 'la_enlarged']);
  assert.equal(res.approvedBy, 'c@x.uz');
  const entries = store.filter('journal', (j) => j.target === 'conclusion');
  assert.equal(entries.length, 2);
  for (const e of entries) assert.deepEqual(Object.keys(e).sort(), ['actingAs', 'action', 'at', 'doctorId', 'doctorName', 'id', 'kind', 'ruleId', 'specialty', 'target']);
  const resident = await reg('r@x.uz', 'resident');
  await expectCode(() => service.approveConclusion(fresh(resident.id), ['lvef_reduced']), 'notDoctor');
  await expectCode(() => service.approveConclusion(fresh(cardio.id), []), 'emptyConclusion');
});

test('questions go to doctors of the specialty; only they answer (spec 4.2, 10)', async () => {
  const { service, reg, fresh } = setup();
  const admin = await reg('admin@x.uz', 'resident');
  service.grantAdmin('admin@x.uz');
  const cardio = await reg('c@x.uz', 'doctor');
  const anest = await reg('an@x.uz', 'doctor', { specialty: 'anesthesiology_icu' });
  service.verifyDoctor(fresh(admin.id), cardio.id, 'approve');
  service.verifyDoctor(fresh(admin.id), anest.id, 'approve');
  const student = await reg('s@x.uz', 'student');
  const q = service.createQuestion(fresh(student.id), { specialty: 'cardiology', ruleId: 'la_enlarged', text: 'Why is LAVi indexed to BSA?' });
  await expectCode(() => service.createQuestion(fresh(student.id), { specialty: 'cardiology', text: 'Patient born 12.03.1980' }), 'personalData');
  assert.equal(service.listQuestions(fresh(cardio.id)).toAnswer.length, 1);
  assert.equal(service.listQuestions(fresh(anest.id)).toAnswer.length, 0);
  await expectCode(() => service.answerQuestion(fresh(anest.id), q.id, 'x'), 'otherSpecialty');
  const answered = service.answerQuestion(fresh(cardio.id), q.id, 'Because LA size scales with body size.');
  assert.equal(answered.answers[0].doctorName, 'c@x.uz');
  assert.equal(service.listQuestions(fresh(student.id)).mine[0].answers.length, 1);
});

test('AI quota follows the plan; test mode keeps everyone on free (spec 5)', async () => {
  const { service, reg, fresh } = setup();
  const u = await reg('s@x.uz', 'student');
  const free = plans.plans.find((p) => p.id === 'free');
  let q = service.aiQuota(fresh(u.id));
  assert.equal(q.planId, 'free');
  assert.equal(q.dailyLimit, free.dailyRequests);
  assert.equal(q.maxTokens, free.maxTokens);
  for (let i = 0; i < free.dailyRequests; i++) service.recordUsage(fresh(u.id), { inputTokens: 10, outputTokens: 20 });
  q = service.aiQuota(fresh(u.id));
  assert.equal(q.remaining, 0);
  const usage = service.usage({ isAdmin: true, id: 'x' });
  assert.equal(usage.length, free.dailyRequests);
  for (const k of ['userId', 'at', 'inputTokens', 'outputTokens']) assert.ok(k in usage[0]);
});

test('payments are refused while disabled; refunds are admin-only and logged (spec 6)', async () => {
  const { service, reg, fresh, store } = setup();
  const u = await reg('s@x.uz', 'student');
  await expectCode(() => service.startCheckout(fresh(u.id), { planId: 'monthly', providerId: 'click' }), 'paymentsDisabled');
  await expectCode(() => service.refund(fresh(u.id), 'p1'), 'forbidden');
  assert.ok(store.filter('journal', (j) => j.kind === 'payment' && j.event === 'checkout_requested').length === 1);
});

test('cancelled subscription keeps access until period end (spec 5)', async () => {
  const live = { ...config, testMode: false };
  const { service, store, reg, fresh } = setup(live);
  const u = await reg('s@x.uz', 'student');
  store.update('users', u.id, { subscription: { planId: 'monthly', status: 'active', periodEnd: '2999-01-01T00:00:00Z' } });
  assert.equal(service.me(fresh(u.id)).effectivePlan, 'monthly');
  service.cancelSubscription(fresh(u.id));
  assert.equal(fresh(u.id).subscription.status, 'cancelled');
  assert.equal(service.me(fresh(u.id)).effectivePlan, 'monthly');
});
