// In-browser demo backend: the same service as the server, stored in this
// browser's localStorage. Used when no server is reachable (static hosting,
// claude.ai preview). AI uses the viewer's Claude account through the
// artifact `sample` capability when available.
import { createService, ServiceError } from '../core/service.js';
import { createStore } from '../core/store.js';
import { buildKnowledge, buildSystemPrompt, checkAnswer, detectInjection, validateChat } from '../core/ai-guard.js';
import { resolveParameters } from '../core/thresholds.js';

const DB_KEY = 'da.demo.db';
const SESSION_KEY = 'da.demo.session';
const ITERATIONS = 100000;

function readLocal(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* storage unavailable: demo works for this page load only */ }
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

const hasher = {
  async hash(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
  },
  async verify(password, stored) {
    const [scheme, iter, salt, hash] = String(stored).split('$');
    if (scheme !== 'pbkdf2') return false;
    return b64(await pbkdf2(password, unb64(salt), Number(iter))) === hash;
  },
};

const randomId = () => crypto.randomUUID();

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ACCOUNTS = [
  { email: 'admin@demo.uz', fullName: 'Demo Admin', role: 'doctor', specialty: 'functional_diagnostics', verified: true, admin: true },
  { email: 'cardio@demo.uz', fullName: 'Demo Cardiologist', role: 'doctor', specialty: 'cardiology', verified: true },
  { email: 'anest@demo.uz', fullName: 'Demo Anesthesiologist', role: 'doctor', specialty: 'anesthesiology_icu', verified: true },
  { email: 'newdoc@demo.uz', fullName: 'Demo Pending Doctor', role: 'doctor', specialty: 'cardiology', verified: false },
  { email: 'resident@demo.uz', fullName: 'Demo Resident', role: 'resident', specialty: 'cardiology' },
  { email: 'student@demo.uz', fullName: 'Demo Student', role: 'student', studyDirection: 'general_medicine' },
];

function wrap(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ServiceError) throw { code: e.code, details: e.details };
      throw e;
    }
  };
}

export async function createDemoBackend({ data }) {
  let initial = {};
  try { initial = JSON.parse(readLocal(DB_KEY) || '{}'); } catch { initial = {}; }
  const store = createStore(initial, (snap) => writeLocal(DB_KEY, JSON.stringify(snap)));
  const service = createService({
    store, hasher, randomId,
    config: data.config, plans: data.plans, rules: data.rules, specialties: data.specialties, thresholds: data.thresholds,
  });

  // Seed demo accounts once.
  if (!store.find('users', () => true)) {
    for (const a of DEMO_ACCOUNTS) {
      const user = await service.register({
        fullName: a.fullName, email: a.email, password: DEMO_PASSWORD, role: a.role,
        specialty: a.specialty, studyDirection: a.studyDirection,
        institution: 'Demo', licenseNumber: 'DEMO-0000', confirmAccurate: true,
      });
      if (a.verified) store.update('users', user.id, { verification: 'approved' });
      if (a.admin) service.grantAdmin(a.email);
    }
  }

  const actor = () => {
    const id = readLocal(SESSION_KEY);
    return id ? service.getUser(id) : null;
  };

  let samplePromise = null;
  const getSample = () => {
    if (!samplePromise) {
      samplePromise = window.claude && typeof window.claude.use === 'function'
        ? window.claude.use('sample').catch(() => null)
        : Promise.resolve(null);
    }
    return samplePromise;
  };

  return {
    mode: 'demo',
    me: wrap(async () => service.me(actor())),
    register: wrap(async (input) => {
      const user = await service.register(input);
      writeLocal(SESSION_KEY, user.id);
      return service.me(service.getUser(user.id));
    }),
    login: wrap(async (email, password) => {
      const user = await service.login(email, password);
      writeLocal(SESSION_KEY, user.id);
      return service.me(service.getUser(user.id));
    }),
    logout: wrap(async () => writeLocal(SESSION_KEY, null)),
    listUsers: wrap(async () => service.listUsers(actor())),
    verifyDoctor: wrap(async (id, action, note) => service.verifyDoctor(actor(), id, action, note)),
    journal: wrap(async (kind) => service.journal(actor(), kind)),
    ruleDecisions: wrap(async () => service.ruleDecisions(actor())),
    ruleStatuses: wrap(async () => service.ruleStatuses()),
    decideRule: wrap(async (ruleId, action) => service.decideRule(actor(), ruleId, action)),
    approveConclusion: wrap(async (ruleIds) => service.approveConclusion(actor(), ruleIds)),
    createQuestion: wrap(async (q) => service.createQuestion(actor(), q)),
    listQuestions: wrap(async () => service.listQuestions(actor())),
    answerQuestion: wrap(async (id, text) => service.answerQuestion(actor(), id, text)),
    plans: wrap(async () => service.plans()),
    overrides: wrap(async () => service.overrides()),
    setOverride: wrap(async (key, value) => service.setOverride(actor(), key, value)),
    resetOverride: wrap(async (key) => service.resetOverride(actor(), key)),
    aiQuota: wrap(async () => service.aiQuota(actor())),
    cancelSubscription: wrap(async () => service.cancelSubscription(actor())),
    startCheckout: wrap(async (planId, providerId) => service.startCheckout(actor(), { planId, providerId })),

    askAI: wrap(async (messages, lang, { onText, signal } = {}) => {
      const user = actor();
      if (!user) throw { code: 'notSignedIn' };
      const eff = service.effective();
      if (!eff.config.aiEnabled) throw { code: 'aiDisabled' };
      const invalid = validateChat(messages);
      if (invalid) throw { code: invalid };
      const quota = service.aiQuota(user);
      if (quota.remaining <= 0) throw { code: 'quotaExceeded' };
      const last = messages[messages.length - 1].content;
      if (detectInjection(last)) {
        service.recordUsage(user, { outcome: 'blocked_injection' });
        throw { code: 'injection' };
      }
      const sample = await getSample();
      if (!sample) throw { code: 'aiUnavailable' };
      const knowledge = buildKnowledge({
        sources: data.sources, parameters: resolveParameters(data.parameters, eff.thresholds), formulas: data.formulas,
        rules: data.rules, dict: data.dicts.en, thresholds: data.thresholds, thresholdValues: eff.thresholds,
      });
      const rules = buildSystemPrompt(knowledge, lang);
      let text;
      try {
        ({ text } = await sample([{ role: 'user', content: rules }, ...messages], { cache: false, signal, onText }));
      } catch (e) {
        if (e && e.code === 'cancelled') throw { code: 'cancelled' };
        throw { code: e && e.code === 'not_granted' ? 'aiNotGranted' : 'aiUnavailable' };
      }
      const checked = checkAnswer(text, data.sources.sources.map((s) => s.id));
      service.recordUsage(user, { outcome: checked.ok ? 'ok' : 'no_source' });
      if (!checked.ok) throw { code: 'noSource' };
      return { text: checked.text, sourceIds: checked.sourceIds };
    }),

    demoAccounts: DEMO_ACCOUNTS.map((a) => ({ email: a.email, role: a.role, specialty: a.specialty, admin: !!a.admin, verified: !!a.verified })),
    demoPassword: DEMO_PASSWORD,
    resetDemo() {
      writeLocal(DB_KEY, null);
      writeLocal(SESSION_KEY, null);
    },
  };
}
