// Business logic shared by the Node server and the in-browser demo backend.
// Every method takes the acting user (or null) and enforces permissions here.
import { ROLES, VERIFICATION, canAnswerQuestion, canApprove, isAdmin, validateRegistration } from './policy.js';
import { effectivePlan, paymentsActive } from './config.js';
import { detectPersonalData } from './ai-guard.js';
import {
  applyPlanOverrides, splitOverrides, thresholdValues, validateConfigField, validatePlanField, validateThreshold,
} from './thresholds.js';

export class ServiceError extends Error {
  constructor(code, status = 400, details = undefined) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, licenseNumber, ...rest } = user;
  return rest;
}

export function createService({ store, hasher, randomId, config, plans, rules, specialties, thresholds, now = () => Date.now() }) {
  const iso = () => new Date(now()).toISOString();
  const ruleById = new Map(rules.rules.map((r) => [r.id, r]));

  function journal(kind, entry) {
    return store.insert('journal', { id: randomId(), kind, at: iso(), ...entry });
  }
  function requireUser(actor) {
    if (!actor) throw new ServiceError('notSignedIn', 401);
    return actor;
  }
  function requireAdmin(actor) {
    requireUser(actor);
    if (!isAdmin(actor)) throw new ServiceError('forbidden', 403);
    return actor;
  }
  function currentStatuses() {
    const out = {};
    for (const d of store.all('ruleDecisions')) {
      if (d.action === 'revoke') delete out[d.ruleId];
      else out[d.ruleId] = d; // last decision wins
    }
    return out;
  }
  // Published data plus admin overrides.
  function effective() {
    const ov = splitOverrides(store.all('overrides'));
    return {
      overrides: ov,
      config: { ...config, ...ov.config },
      plans: applyPlanOverrides(plans, ov.plans),
      thresholds: thresholds ? thresholdValues(thresholds, ov.thresholds) : {},
    };
  }
  function listOverrides() {
    const docs = store.all('overrides');
    return { ...splitOverrides(docs), entries: docs };
  }
  function planFor(user) {
    const eff = effective();
    const id = effectivePlan(user, eff.config, now());
    return eff.plans.plans.find((p) => p.id === id) || eff.plans.plans.find((p) => p.id === 'free');
  }

  return {
    async register(input) {
      const errors = validateRegistration(input, specialties);
      if (errors.length) throw new ServiceError('validation', 400, errors);
      const email = String(input.email).trim().toLowerCase();
      if (store.find('users', (u) => u.email === email)) throw new ServiceError('emailTaken', 409);
      const user = {
        id: randomId(),
        fullName: String(input.fullName).trim(),
        email,
        passwordHash: await hasher.hash(String(input.password)),
        role: input.role,
        specialty: input.role === 'student' ? null : input.specialty,
        studyDirection: input.role === 'student' ? input.studyDirection : null,
        institution: String(input.institution).trim(),
        licenseNumber: String(input.licenseNumber).trim(),
        verification: input.role === 'doctor' ? VERIFICATION.pending : VERIFICATION.notRequired,
        isAdmin: false,
        plan: 'free',
        subscription: null,
        createdAt: iso(),
      };
      store.insert('users', user);
      journal('registration', { userId: user.id, role: user.role });
      return publicUser(user);
    },

    async login(email, password) {
      const user = store.find('users', (u) => u.email === String(email || '').trim().toLowerCase());
      if (!user || !(await hasher.verify(String(password || ''), user.passwordHash))) {
        throw new ServiceError('badCredentials', 401);
      }
      return publicUser(user);
    },

    getUser(id) {
      return store.find('users', (u) => u.id === id);
    },

    me(actor) {
      if (!actor) return null;
      const plan = planFor(actor);
      return { ...publicUser(actor), effectivePlan: plan.id };
    },

    // ---- admin: users and license verification ------------------------
    listUsers(actor) {
      requireAdmin(actor);
      // License numbers are shown to admins only, for manual verification.
      return store.all('users').map(({ passwordHash, ...u }) => u);
    },

    verifyDoctor(actor, userId, action, note = '') {
      requireAdmin(actor);
      const user = store.find('users', (u) => u.id === userId);
      if (!user) throw new ServiceError('notFound', 404);
      if (user.role !== 'doctor') throw new ServiceError('notDoctor', 400);
      if (!['approve', 'reject', 'revoke'].includes(action)) throw new ServiceError('badAction', 400);
      const verification = { approve: VERIFICATION.approved, reject: VERIFICATION.rejected, revoke: VERIFICATION.pending }[action];
      store.update('users', userId, { verification, verifiedAt: iso(), verifiedBy: actor.id });
      journal('verification', { adminId: actor.id, userId, action, note: String(note).slice(0, 500) });
      return publicUser(store.find('users', (u) => u.id === userId));
    },

    journal(actor, kind) {
      requireAdmin(actor);
      const all = store.all('journal');
      return (kind ? all.filter((j) => j.kind === kind) : all).reverse();
    },

    // ---- medical rule approval ------------------------------------------
    ruleStatuses() {
      return currentStatuses();
    },

    ruleDecisions(actor) {
      requireAdmin(actor);
      return store.all('ruleDecisions').reverse();
    },

    // Actions: approve, reject; an admin may also revoke (back to "not reviewed").
    // A later decision replaces the earlier one; all are kept in the journal.
    decideRule(actor, ruleId, action) {
      requireUser(actor);
      const rule = ruleById.get(ruleId);
      if (!rule) throw new ServiceError('notFound', 404);
      if (!['approve', 'reject', 'revoke'].includes(action)) throw new ServiceError('badAction', 400);
      const check = canApprove(actor, rule.specialty);
      if (!check.ok) throw new ServiceError(check.reason, 403);
      if (action === 'revoke' && check.as !== 'admin') throw new ServiceError('forbidden', 403);
      const previous = currentStatuses()[ruleId] || null;
      const decision = {
        id: randomId(), ruleId, action, doctorId: actor.id, doctorName: actor.fullName,
        specialty: actor.specialty, actingAs: check.as, at: iso(),
      };
      store.insert('ruleDecisions', decision);
      journal('approval', {
        target: 'rule', doctorId: actor.id, doctorName: actor.fullName, specialty: actor.specialty,
        actingAs: check.as, ruleId, action, previousAction: previous ? previous.action : null,
      });
      return decision;
    },

    // Approving a draft conclusion. Measurement values are never sent here;
    // only the ids of the rules that produced the findings.
    approveConclusion(actor, ruleIds) {
      requireUser(actor);
      if (!Array.isArray(ruleIds) || ruleIds.length === 0) throw new ServiceError('emptyConclusion', 400);
      const specialtiesNeeded = new Set();
      for (const id of ruleIds) {
        const rule = ruleById.get(id);
        if (!rule) throw new ServiceError('notFound', 404);
        specialtiesNeeded.add(rule.specialty);
      }
      let actingAs = 'doctor';
      for (const sp of specialtiesNeeded) {
        const check = canApprove(actor, sp);
        if (!check.ok) throw new ServiceError(check.reason, 403);
        actingAs = check.as;
      }
      const at = iso();
      for (const ruleId of ruleIds) {
        journal('approval', { target: 'conclusion', doctorId: actor.id, doctorName: actor.fullName, specialty: actor.specialty, actingAs, ruleId, action: 'approve' });
      }
      return { approvedBy: actor.fullName, specialty: actor.specialty, actingAs, at };
    },

    // ---- questions to doctors ---------------------------------------------
    createQuestion(actor, { specialty, ruleId = null, text }) {
      requireUser(actor);
      if (!specialties.specialties.some((s) => s.id === specialty)) throw new ServiceError('validation', 400, [{ field: 'specialty', code: 'required' }]);
      const body = String(text || '').trim();
      if (!body) throw new ServiceError('validation', 400, [{ field: 'text', code: 'required' }]);
      if (body.length > 2000) throw new ServiceError('messageTooLong', 400);
      if (detectPersonalData(body).length) throw new ServiceError('personalData', 400);
      if (ruleId && !ruleById.has(ruleId)) throw new ServiceError('notFound', 404);
      return store.insert('questions', {
        id: randomId(), askerId: actor.id, askerName: actor.fullName, askerRole: actor.role,
        specialty, ruleId, text: body, createdAt: iso(), answers: [],
      });
    },

    listQuestions(actor) {
      requireUser(actor);
      const mine = store.filter('questions', (q) => q.askerId === actor.id);
      const toAnswer = store.filter('questions', (q) => q.askerId !== actor.id && canAnswerQuestion(actor, q).ok);
      return { mine: mine.reverse(), toAnswer: toAnswer.reverse() };
    },

    answerQuestion(actor, questionId, text) {
      requireUser(actor);
      const q = store.find('questions', (x) => x.id === questionId);
      if (!q) throw new ServiceError('notFound', 404);
      const check = canAnswerQuestion(actor, q);
      if (!check.ok) throw new ServiceError(check.reason, 403);
      const body = String(text || '').trim();
      if (!body) throw new ServiceError('validation', 400, [{ field: 'text', code: 'required' }]);
      if (detectPersonalData(body).length) throw new ServiceError('personalData', 400);
      const answers = [...q.answers, { doctorId: actor.id, doctorName: actor.fullName, specialty: actor.specialty, text: body, at: iso() }];
      store.update('questions', q.id, { answers });
      journal('answer', { doctorId: actor.id, questionId: q.id });
      return store.find('questions', (x) => x.id === questionId);
    },

    // ---- plans, AI quota and usage ----------------------------------------
    plans() {
      const eff = effective();
      return { testMode: eff.config.testMode, paymentsEnabled: paymentsActive(eff.config), plans: eff.plans.plans };
    },

    // ---- admin overrides: thresholds, plans, settings ----------------------
    effective,

    overrides: listOverrides,

    // key: "threshold:<id>", "plan:<planId>:<field>" or "config:<flag>".
    setOverride(actor, key, value) {
      requireAdmin(actor);
      const [kind, a, b] = String(key).split(':');
      const eff = effective();
      let errors;
      let sourceValue;
      let oldValue;
      if (kind === 'threshold' && thresholds) {
        errors = validateThreshold(thresholds, eff.thresholds, a, value, config.adminLimits.maxDeviationPct);
        sourceValue = thresholds.thresholds.find((t) => t.id === a)?.value;
        oldValue = eff.thresholds[a];
      } else if (kind === 'plan') {
        errors = validatePlanField(eff.plans, a, b, value);
        sourceValue = plans.plans.find((p) => p.id === a)?.[b];
        oldValue = eff.plans.plans.find((p) => p.id === a)?.[b];
      } else if (kind === 'config') {
        errors = validateConfigField(a, value);
        sourceValue = config[a];
        oldValue = eff.config[a];
      } else {
        errors = [{ code: 'notFound' }];
      }
      if (errors.length) throw new ServiceError(errors[0].code === 'notFound' ? 'notFound' : 'limitExceeded', errors[0].code === 'notFound' ? 404 : 400, errors);
      const doc = { id: key, value, by: actor.id, byName: actor.fullName, at: iso() };
      if (store.find('overrides', (o) => o.id === key)) store.update('overrides', key, doc);
      else store.insert('overrides', doc);
      journal('settings', { adminId: actor.id, key, oldValue, newValue: value, sourceValue });
      return listOverrides();
    },

    resetOverride(actor, key) {
      requireAdmin(actor);
      const existing = store.find('overrides', (o) => o.id === key);
      if (!existing) throw new ServiceError('notFound', 404);
      const [kind, a] = String(key).split(':');
      // Resetting one bound must not break the order with the other bound.
      if (kind === 'threshold' && thresholds) {
        const source = thresholds.thresholds.find((t) => t.id === a).value;
        const eff = effective();
        const errs = validateThreshold(thresholds, eff.thresholds, a, source, config.adminLimits.maxDeviationPct);
        if (errs.length) throw new ServiceError('limitExceeded', 400, errs);
      }
      store.remove('overrides', key);
      journal('settings', { adminId: actor.id, key, oldValue: existing.value, newValue: null, reset: true });
      return listOverrides();
    },

    aiQuota(actor) {
      requireUser(actor);
      const plan = planFor(actor);
      const day = iso().slice(0, 10);
      const used = store.filter('usage', (u) => u.userId === actor.id && u.at.startsWith(day)).length;
      return { planId: plan.id, dailyLimit: plan.dailyRequests, used, maxTokens: plan.maxTokens, remaining: Math.max(0, plan.dailyRequests - used) };
    },

    recordUsage(actor, { inputTokens = 0, outputTokens = 0, outcome = 'ok' }) {
      requireUser(actor);
      return store.insert('usage', { id: randomId(), userId: actor.id, at: iso(), inputTokens, outputTokens, outcome });
    },

    usage(actor) {
      requireAdmin(actor);
      return store.all('usage').reverse();
    },

    cancelSubscription(actor) {
      requireUser(actor);
      const sub = actor.subscription;
      if (!sub || sub.status !== 'active') throw new ServiceError('noSubscription', 400);
      // Stays active until periodEnd, then effectivePlan() falls back to free.
      store.update('users', actor.id, { subscription: { ...sub, status: 'cancelled', cancelledAt: iso() } });
      journal('payment', { userId: actor.id, event: 'subscription_cancelled', planId: sub.planId });
      return publicUser(store.find('users', (u) => u.id === actor.id));
    },

    startCheckout(actor, { planId, providerId }) {
      requireUser(actor);
      const active = paymentsActive(effective().config);
      journal('payment', { userId: actor.id, event: 'checkout_requested', planId, providerId, paymentsEnabled: active });
      if (!active) throw new ServiceError('paymentsDisabled', 403);
      return { planId, providerId };
    },

    refund(actor, paymentId) {
      requireAdmin(actor);
      journal('payment', { adminId: actor.id, event: 'refund_requested', paymentId });
      if (!paymentsActive(effective().config)) throw new ServiceError('paymentsDisabled', 403);
      return { paymentId };
    },

    // Not exposed over HTTP: system owner only (server/cli.mjs, demo seed).
    grantAdmin(email) {
      const user = store.find('users', (u) => u.email === String(email).toLowerCase());
      if (!user) throw new ServiceError('notFound', 404);
      store.update('users', user.id, { isAdmin: true });
      journal('admin', { event: 'admin_granted', userId: user.id });
      return publicUser(user);
    },

    roles: ROLES,
  };
}
