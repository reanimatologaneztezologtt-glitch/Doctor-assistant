import { createTranslator, pickLanguage } from './core/i18n.js';
import { validateConfig } from './core/config.js';
import { readPref, writePref } from './core/storage.js';

const state = {
  config: null,
  nav: [],
  lang: null,
  dict: null,
  fallbackDict: null,
  t: (key) => key,
};

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}

function icon(name, extraClass = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `icon ${extraClass}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `assets/icons/sprite.svg#${name}`);
  svg.append(use);
  return svg;
}

// ---- i18n -----------------------------------------------------------------

async function setLanguage(lang) {
  const { config } = state;
  const code = pickLanguage(lang, config.supportedLanguages, config.defaultLanguage);
  state.dict = await loadDict(code);
  if (!state.fallbackDict) {
    state.fallbackDict = await loadDict(config.defaultLanguage);
  }
  state.lang = code;
  state.t = createTranslator(state.dict, state.fallbackDict, (key) =>
    console.warn(`i18n: missing key "${key}" for "${code}"`));
  writePref('da.lang', code);

  document.documentElement.lang = state.t('meta.htmlLang');
  document.title = `${state.t('app.title')} — ${state.t('app.tagline')}`;
  applyStaticTranslations();
  await renderLanguageSwitch();
  renderNav();
  renderRoute();
}

function applyStaticTranslations() {
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = state.t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria-label]')) {
    node.setAttribute('aria-label', state.t(node.dataset.i18nAriaLabel));
  }
}

const dictCache = new Map();

async function loadDict(code) {
  if (!dictCache.has(code)) dictCache.set(code, loadJson(`data/i18n/${code}.json`));
  return dictCache.get(code);
}

async function renderLanguageSwitch() {
  const box = document.getElementById('lang-switch');
  // Each language names itself, so labels come from that language's file.
  const dicts = await Promise.all(state.config.supportedLanguages.map(loadDict));
  const buttons = state.config.supportedLanguages.map((code, i) => {
    const btn = el('button', {
      type: 'button',
      lang: dicts[i].meta.htmlLang,
      'aria-pressed': String(code === state.lang),
      'aria-label': dicts[i].meta.languageName,
      text: dicts[i].meta.languageShort,
    });
    btn.addEventListener('click', () => setLanguage(code));
    return btn;
  });
  box.querySelectorAll('button').forEach((b) => b.remove());
  box.append(...buttons);
}

// ---- theme ----------------------------------------------------------------

function initThemeSwitch() {
  const box = document.getElementById('theme-switch');
  const sync = () => {
    const choice = document.documentElement.getAttribute('data-theme-choice');
    box.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.themeValue === choice)));
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

// ---- navigation / routing -------------------------------------------------

function currentRouteId() {
  const id = location.hash.replace(/^#\/?/, '') || 'home';
  return id;
}

function renderNav() {
  const list = document.getElementById('nav-list');
  const active = currentRouteId();
  list.replaceChildren(...state.nav.map((item) => {
    const link = el('a', { href: `#${item.id}` }, [icon(item.icon), el('span', { text: state.t(item.labelKey) })]);
    if (item.id === active) link.setAttribute('aria-current', 'page');
    return el('li', {}, [link]);
  }));
}

function disclaimer() {
  return el('p', { class: 'disclaimer', role: 'note', text: state.t('disclaimer.text') });
}

function renderHome() {
  const { t } = state;
  return [
    el('h1', { text: t('home.heading') }),
    el('div', { class: 'card' }, [
      el('p', { text: t('home.intro') }),
      el('p', { text: t('home.notDiagnostic') }),
    ]),
    el('p', { class: 'text-muted', text: t('home.privacy') }),
  ];
}

function renderPlaceholder(item) {
  const { t } = state;
  return [
    el('h1', { text: t(item.labelKey) }),
    el('div', { class: 'card' }, [
      el('p', { text: t(item.bodyKey) }),
      el('p', { class: 'text-muted', text: t('ui.comingSoon', { step: item.readyInStep }) }),
    ]),
  ];
}

function renderRoute({ focus = false } = {}) {
  const main = document.getElementById('main');
  const item = state.nav.find((n) => n.id === currentRouteId());
  let content;
  if (!item) content = [el('h1', { text: state.t('ui.notFound') })];
  else if (item.id === 'home') content = renderHome();
  else content = renderPlaceholder(item);
  // Every section ends with the educational disclaimer (spec section 12).
  main.replaceChildren(...content, disclaimer());
  if (focus) main.focus();
}

// ---- status banners -------------------------------------------------------

function initBanners() {
  document.getElementById('test-mode-banner').hidden = !state.config.testMode;
  const offline = document.getElementById('offline-banner');
  const sync = () => { offline.hidden = navigator.onLine; };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch((err) =>
    console.warn('Service worker registration failed:', err));
}

// ---- boot -----------------------------------------------------------------

async function boot() {
  try {
    state.config = await loadJson('config/app.json');
    const errors = validateConfig(state.config);
    if (errors.length) throw new Error(`config/app.json: ${errors.join('; ')}`);
    state.nav = (await loadJson('data/navigation.json')).items;

    initThemeSwitch();
    initBanners();
    window.addEventListener('hashchange', () => { renderNav(); renderRoute({ focus: true }); });

    const preferred = readPref('da.lang') || state.config.defaultLanguage;
    await setLanguage(preferred);
    registerServiceWorker();
  } catch (err) {
    console.error(err);
    const main = document.getElementById('main');
    // No translations may be available here, so show all three languages.
    main.textContent = 'Error / Хатолик / Ошибка: ' + err.message;
  }
}

boot();
