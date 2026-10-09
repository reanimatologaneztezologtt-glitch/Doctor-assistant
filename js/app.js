import { createTranslator, pickLanguage } from './core/i18n.js';
import { validateConfig } from './core/config.js';
import { readPref, writePref } from './core/storage.js';
import { runReferenceTests } from './core/calc.js';
import { applyPlanOverrides, changedIds, resolveFormula, resolveParameters, thresholdValues } from './core/thresholds.js';
import { createFormatter } from './ui/format.js';
import { el, icon } from './ui/dom.js';
import { createBackend } from './api/index.js';
import { VIEWS } from './views/index.js';

const state = {
  base: null, // data as published
  data: null, // data with admin overrides applied
  thr: {}, // current cut-off values
  thrChanged: new Set(),
  lang: null,
  t: (k) => k,
  fmt: null,
  api: null,
  user: null,
  assistantDraft: '',
};

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  const [config, navigation, parameters, sources, specialties, plans, providers, rules, formulaIndex, demoCase, thresholds] = await Promise.all([
    'config/app.json', 'data/navigation.json', 'data/parameters.json', 'data/sources.json',
    'data/specialties.json', 'data/plans.json', 'data/providers.json', 'data/rules.json',
    'data/formulas/index.json', 'data/cases/demo-1.json', 'data/thresholds.json',
  ].map(loadJson));
  const errors = validateConfig(config);
  if (errors.length) throw new Error(`config/app.json: ${errors.join('; ')}`);
  const formulas = await Promise.all(formulaIndex.calculators.map((id) => loadJson(`data/formulas/${id}.json`)));
  const dicts = Object.fromEntries(await Promise.all(
    config.supportedLanguages.map(async (l) => [l, await loadJson(`data/i18n/${l}.json`)]),
  ));
  return { config, navigation, parameters, sources, specialties, plans, providers, rules, formulas, demoCase, dicts, thresholds };
}

// Published data + admin overrides -> what every page uses.
async function applyOverrides() {
  const ov = await state.api.overrides().catch(() => ({ thresholds: {}, plans: {}, config: {} }));
  const base = state.base;
  state.thr = thresholdValues(base.thresholds, ov.thresholds);
  state.thrChanged = changedIds(base.thresholds, state.thr);
  state.data = {
    ...base,
    config: { ...base.config, ...ov.config },
    plans: applyPlanOverrides(base.plans, ov.plans),
    parameters: resolveParameters(base.parameters, state.thr),
    formulas: base.formulas.map((f) => resolveFormula(f, state.thr)),
  };
}

// Cut-offs formatted for the active language, usable as {id} in any text.
function thresholdTextVars() {
  const out = {};
  for (const t of state.base.thresholds.thresholds) {
    out[t.id] = new Intl.NumberFormat(state.base.dicts[state.lang].meta.htmlLang, { maximumFractionDigits: t.decimals ?? 2 }).format(state.thr[t.id]);
  }
  return out;
}

// ---- measurements (browser only, spec section 8) --------------------------
const MEASURE_KEY = 'da.measurements';
export function readMeasurements() {
  try { return JSON.parse(readPref(MEASURE_KEY) || '{}'); } catch { return {}; }
}
export function writeMeasurements(values) {
  writePref(MEASURE_KEY, JSON.stringify(values));
}

// ---- language -------------------------------------------------------------
function setLanguage(code) {
  const { config, dicts } = state.data;
  const lang = pickLanguage(code, config.supportedLanguages, config.defaultLanguage);
  state.lang = lang;
  state.t = createTranslator(dicts[lang], dicts[config.defaultLanguage], (key) =>
    console.warn(`i18n: missing key "${key}" for "${lang}"`), thresholdTextVars());
  state.fmt = createFormatter(state.t, dicts[lang].meta.htmlLang);
  writePref('da.lang', lang);
  document.documentElement.lang = state.t('meta.htmlLang');
  document.title = `${state.t('app.title')} — ${state.t('app.tagline')}`;
  applyStaticTranslations();
  renderLanguageSwitch();
  renderChrome();
}

function applyStaticTranslations() {
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = state.t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-aria-label]')) {
    node.setAttribute('aria-label', state.t(node.dataset.i18nAriaLabel));
  }
}

function renderLanguageSwitch() {
  const box = document.getElementById('lang-switch');
  const buttons = state.data.config.supportedLanguages.map((code) => {
    const meta = state.data.dicts[code].meta;
    return el('button', {
      type: 'button', lang: meta.htmlLang, 'aria-pressed': String(code === state.lang),
      'aria-label': meta.languageName, text: meta.languageShort, onclick: () => setLanguage(code),
    });
  });
  box.querySelectorAll('button').forEach((b) => b.remove());
  box.append(...buttons);
}

// ---- theme ----------------------------------------------------------------
function initThemeSwitch() {
  const box = document.getElementById('theme-switch');
  const sync = () => {
    const choice = document.documentElement.getAttribute('data-theme-choice');
    box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeValue === choice)));
  };
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-theme-value]');
    if (!btn) return;
    writePref('da.theme', btn.dataset.themeValue);
    window.__applyTheme(btn.dataset.themeValue);
    sync();
  });
  sync();
}

// ---- routing ----------------------------------------------------------------
function currentRoute() {
  const id = location.hash.replace(/^#\/?/, '') || 'home';
  return id;
}

export function navigate(id) {
  if (currentRoute() === id) renderChrome({ focus: true });
  else location.hash = id;
}

function visibleNav() {
  return state.data.navigation.items.filter((item) => item.requires !== 'admin' || (state.user && state.user.isAdmin));
}

function renderNav() {
  const list = document.getElementById('nav-list');
  const active = currentRoute();
  list.replaceChildren(...visibleNav().map((item) => {
    const link = el('a', { href: `#${item.id}` }, [icon(item.icon), el('span', { text: state.t(item.labelKey) })]);
    if (item.id === active) link.setAttribute('aria-current', 'page');
    return el('li', {}, [link]);
  }));
}

function renderUserBadge() {
  const box = document.getElementById('user-badge');
  box.replaceChildren(state.user
    ? el('a', { href: '#account', class: 'user-badge' }, [icon('user'), el('span', { text: state.user.fullName })])
    : el('a', { href: '#account', class: 'user-badge', text: state.t('account.signIn') }));
}

function disclaimer() {
  return el('p', { class: 'disclaimer', role: 'note', text: state.t('disclaimer.text') });
}

let renderToken = 0;
async function renderRoute({ focus = false } = {}) {
  const token = ++renderToken;
  const main = document.getElementById('main');
  const id = currentRoute();
  const item = state.data.navigation.items.find((n) => n.id === id);
  const view = item && VIEWS[id];
  let content;
  try {
    content = view ? await view(ctx()) : [el('h1', { text: state.t('ui.notFound') })];
  } catch (err) {
    console.error(err);
    content = [el('h1', { text: state.t('ui.loadError') })];
  }
  if (token !== renderToken) return; // a newer render started
  // Every section ends with the educational disclaimer (spec section 12).
  main.replaceChildren(...[].concat(content), disclaimer());
  if (focus) main.focus();
}

function renderChrome(opts) {
  renderNav();
  renderUserBadge();
  return renderRoute(opts);
}

async function refreshUser() {
  state.user = await state.api.me().catch(() => null);
}

function ctx() {
  return {
    ...state,
    navigate,
    rerender: () => renderChrome(),
    refreshUser: async () => { await refreshUser(); return renderChrome(); },
    // After an admin changes a value: reload overrides, rebuild texts, re-render.
    refreshOverrides: async () => {
      await applyOverrides();
      document.getElementById('test-mode-banner').hidden = !state.data.config.testMode;
      setLanguage(state.lang);
    },
    readMeasurements,
    writeMeasurements,
    setAssistantDraft: (text) => { state.assistantDraft = text; },
  };
}

// ---- banners ----------------------------------------------------------------
function initBanners() {
  document.getElementById('test-mode-banner').hidden = !state.data.config.testMode;
  document.getElementById('demo-banner').hidden = state.api.mode !== 'demo';
  const offline = document.getElementById('offline-banner');
  const sync = () => { offline.hidden = navigator.onLine; };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
  // Calculator reference tests run on every load; a failure is shown loudly.
  const published = thresholdValues(state.base.thresholds);
  const failures = state.base.formulas.flatMap((f) => runReferenceTests(f, published)).filter((r) => !r.pass);
  state.calcTestFailures = failures;
  if (failures.length) {
    console.error('Calculator reference tests failed', failures);
    const banner = document.getElementById('calc-test-banner');
    banner.hidden = false;
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* not available (e.g. sandboxed preview) */ });
}

async function boot() {
  try {
    state.base = await loadData();
    state.data = state.base;
    state.api = await createBackend(state.base);
    await applyOverrides();
    await refreshUser();
    initThemeSwitch();
    initBanners();
    window.addEventListener('hashchange', () => renderChrome({ focus: true }));
    setLanguage(readPref('da.lang') || state.data.config.defaultLanguage);
    registerServiceWorker();
  } catch (err) {
    console.error(err);
    // Translations may be unavailable here, so the message is in all three languages.
    document.getElementById('main').textContent = 'Error / Хатолик / Ошибка: ' + err.message;
  }
}

boot();
