// HTTP server: static files + JSON API. No framework.
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createService, ServiceError } from '../js/core/service.js';
import { validateConfig } from '../js/core/config.js';
import { buildKnowledge } from '../js/core/ai-guard.js';
import { resolveParameters } from '../js/core/thresholds.js';
import { hasher, createSessions, parseCookies } from './auth.mjs';
import { createRateLimiter, BODY_LIMIT_BYTES } from './limits.mjs';
import { createAiProxy } from './ai.mjs';
import { createPayments } from './payments/index.mjs';
import { randomUUID } from 'node:crypto';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Only these paths are served to the browser.
const PUBLIC_FILES = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);
const PUBLIC_DIRS = ['css/', 'js/', 'data/', 'config/', 'assets/'];

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function loadAppData(root) {
  const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const config = json('config/app.json');
  const errors = validateConfig(config);
  if (errors.length) throw new Error(`config/app.json: ${errors.join('; ')}`);
  const index = json('data/formulas/index.json');
  return {
    config,
    plans: json('data/plans.json'),
    rules: json('data/rules.json'),
    specialties: json('data/specialties.json'),
    providers: json('data/providers.json'),
    sources: json('data/sources.json'),
    parameters: json('data/parameters.json'),
    formulas: index.calculators.map((id) => json(`data/formulas/${id}.json`)),
    dictEn: json('data/i18n/en.json'),
    thresholds: json('data/thresholds.json'),
  };
}

export function createApp({ root, store, aiClient = null, now = () => Date.now(), secureCookies = false, trustProxy = false }) {
  const data = loadAppData(root);
  const service = createService({
    store, hasher, randomId: randomUUID, now,
    config: data.config, plans: data.plans, rules: data.rules, specialties: data.specialties, thresholds: data.thresholds,
  });
  const sessions = createSessions({ now });
  const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 120, now });
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10, now });
  const aiIpLimiter = createRateLimiter({ windowMs: 60_000, max: 10, now });
  const aiSessionLimiter = createRateLimiter({ windowMs: 60_000, max: 6, now });
  // The knowledge base follows the admin's current cut-offs.
  let knowledgeCache = { key: null, text: '' };
  const knowledge = () => {
    const values = service.effective().thresholds;
    const key = JSON.stringify(values);
    if (knowledgeCache.key !== key) {
      knowledgeCache = {
        key,
        text: buildKnowledge({
          sources: data.sources, parameters: resolveParameters(data.parameters, values), formulas: data.formulas,
          rules: data.rules, dict: data.dictEn, thresholds: data.thresholds, thresholdValues: values,
        }),
      };
    }
    return knowledgeCache.text;
  };
  const aiChat = createAiProxy({ client: aiClient, service, knowledge, sourceIds: data.sources.sources.map((s) => s.id), getConfig: () => service.effective().config });
  const payments = createPayments({ config: data.config, providers: data.providers });

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
    res.end(JSON.stringify(body));
  };
  const cookie = (token, maxAge) => `da_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  const clientIp = (req) => (trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';

  async function readBody(req) {
    return new Promise((resolveBody, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > BODY_LIMIT_BYTES) {
          reject(new ServiceError('payloadTooLarge', 413));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function jsonBody(req) {
    const raw = await readBody(req);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw new ServiceError('badMessage', 400);
    }
  }

  function currentUser(req) {
    const token = parseCookies(req.headers.cookie).da_session;
    const s = sessions.get(token);
    return s ? { token, user: service.getUser(s.userId) } : { token: null, user: null };
  }

  // [method, pattern, handler(ctx)]
  const routes = [
    ['GET', /^health$/, () => [200, { ok: true }]],
    ['GET', /^me$/, ({ user }) => [200, { user: service.me(user) }]],
    ['POST', /^auth\/register$/, async ({ body }) => {
      const user = await service.register(body);
      const token = sessions.create(user.id);
      return [201, { user: service.me(service.getUser(user.id)) }, { 'Set-Cookie': cookie(token, 43200) }];
    }],
    ['POST', /^auth\/login$/, async ({ body, ip }) => {
      if (!loginLimiter.take(ip)) throw new ServiceError('rateLimited', 429);
      const user = await service.login(body.email, body.password);
      const token = sessions.create(user.id);
      return [200, { user: service.me(service.getUser(user.id)) }, { 'Set-Cookie': cookie(token, 43200) }];
    }],
    ['POST', /^auth\/logout$/, ({ token }) => {
      if (token) sessions.destroy(token);
      return [200, { ok: true }, { 'Set-Cookie': cookie('', 0) }];
    }],
    ['GET', /^admin\/users$/, ({ user }) => [200, { users: service.listUsers(user) }]],
    ['POST', /^admin\/users\/([\w-]+)\/verify$/, ({ user, body, m }) => [200, { user: service.verifyDoctor(user, m[1], body.action, body.note) }]],
    ['GET', /^admin\/journal$/, ({ user, url }) => [200, { entries: service.journal(user, url.searchParams.get('kind') || undefined) }]],
    ['POST', /^admin\/refund$/, ({ user, body }) => [200, service.refund(user, body.paymentId)]],
    ['GET', /^admin\/rule-decisions$/, ({ user }) => [200, { decisions: service.ruleDecisions(user) }]],
    ['GET', /^overrides$/, () => [200, service.overrides()]],
    ['POST', /^admin\/overrides$/, ({ user, body }) => [200, service.setOverride(user, body.key, body.value)]],
    ['POST', /^admin\/overrides\/reset$/, ({ user, body }) => [200, service.resetOverride(user, body.key)]],
    ['GET', /^rules\/status$/, () => [200, { statuses: service.ruleStatuses() }]],
    ['POST', /^rules\/([\w-]+)\/decision$/, ({ user, body, m }) => [200, service.decideRule(user, m[1], body.action)]],
    ['POST', /^conclusions\/approve$/, ({ user, body }) => [200, service.approveConclusion(user, body.ruleIds)]],
    ['GET', /^questions$/, ({ user }) => [200, service.listQuestions(user)]],
    ['POST', /^questions$/, ({ user, body }) => [201, service.createQuestion(user, body)]],
    ['POST', /^questions\/([\w-]+)\/answer$/, ({ user, body, m }) => [200, service.answerQuestion(user, m[1], body.text)]],
    ['GET', /^plans$/, () => [200, service.plans()]],
    ['GET', /^ai\/quota$/, ({ user }) => [200, service.aiQuota(user)]],
    ['POST', /^ai\/chat$/, async ({ user, body, ip, token }) => {
      if (!user) throw new ServiceError('notSignedIn', 401);
      if (!aiIpLimiter.take(ip) || !aiSessionLimiter.take(token)) throw new ServiceError('rateLimited', 429);
      const result = await aiChat(user, body);
      return [result.status, result.body];
    }],
    ['POST', /^billing\/checkout$/, async ({ user, body }) => {
      const req = service.startCheckout(user, body); // throws paymentsDisabled while off
      const provider = await payments.get(req.providerId);
      const checkout = await provider.createCheckout({ planId: req.planId, userId: user.id });
      return [200, checkout];
    }],
    ['POST', /^billing\/cancel$/, ({ user }) => [200, { user: service.cancelSubscription(user) }]],
    ['POST', /^billing\/webhook\/([\w-]+)$/, async ({ m, raw, req }) => {
      store.insert('journal', { id: randomUUID(), kind: 'payment', at: new Date(now()).toISOString(), event: 'webhook_received', providerId: m[1] });
      const provider = await payments.get(m[1]);
      const { valid } = await provider.verifyWebhook(raw, req.headers);
      if (!valid) throw new ServiceError('badSignature', 400);
      return [200, { ok: true }];
    }],
  ];

  async function handleApi(req, res, path, url) {
    const ip = clientIp(req);
    if (!apiLimiter.take(ip)) return send(res, 429, { error: 'rateLimited' });
    if (req.method === 'POST') {
      const type = String(req.headers['content-type'] || '');
      const isWebhook = path.startsWith('billing/webhook/');
      if (!isWebhook && !type.startsWith('application/json') && req.headers['content-length'] !== '0' && req.headers['content-length'] !== undefined) {
        return send(res, 415, { error: 'badMessage' });
      }
      const origin = req.headers.origin;
      if (!isWebhook && origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'forbidden' });
    }
    const route = routes.find(([method, re]) => method === req.method && re.test(path));
    if (!route) return send(res, 404, { error: 'notFound' });
    const m = path.match(route[1]);
    try {
      const { token, user } = currentUser(req);
      let body = {};
      let raw = '';
      if (req.method === 'POST') {
        if (path.startsWith('billing/webhook/')) raw = await readBody(req);
        else body = await jsonBody(req);
      }
      const [status, payload, headers] = await route[2]({ req, user, token, body, raw, m, ip, url });
      return send(res, status, payload, headers);
    } catch (err) {
      if (err instanceof ServiceError) return send(res, err.status, { error: err.code, details: err.details });
      if (err && (err.code === 'paymentsDisabled' || err.code === 'notFound')) return send(res, err.code === 'notFound' ? 404 : 403, { error: err.code });
      if (err && err.code === 'notImplemented') return send(res, 501, { error: 'notImplemented' });
      console.error('API error:', err && err.message);
      return send(res, 500, { error: 'serverError' });
    }
  }

  async function handleStatic(req, res, pathname) {
    const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '') || 'index.html';
    const allowed = PUBLIC_FILES.has(rel) || PUBLIC_DIRS.some((d) => rel.startsWith(d));
    const file = resolve(root, rel);
    if (!allowed || !file.startsWith(resolve(root)) || rel.includes('..')) {
      res.writeHead(404, SECURITY_HEADERS).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
      res.end(body);
    } catch {
      res.writeHead(404, SECURITY_HEADERS).end();
    }
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url.pathname.slice(5), url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, SECURITY_HEADERS).end();
      return undefined;
    }
    return handleStatic(req, res, url.pathname);
  };

  return { handler, service, sessions };
}
