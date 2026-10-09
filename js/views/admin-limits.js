// Admin: change cut-offs, plan limits and settings - only inside the allowed
// range. The server (or demo backend) validates again; the UI only helps.
import { el, chip } from '../ui/dom.js';
import { allowedRange, CONFIG_FIELDS, PLAN_FIELDS } from '../core/thresholds.js';
import { errorText, sourceShort } from './common.js';
import { paramAbbr, paramName } from './param-text.js';

export function thresholdLabel(ctx, t) {
  if (t.labelKey) return ctx.t(t.labelKey);
  const sex = t.sex ? ` — ${ctx.fmt.sexLabel(t.sex)}` : '';
  return `${paramName(ctx, t.param)} (${paramAbbr(ctx, t.param)}) — ${ctx.t(`limits.${t.bound}`)}${sex}`;
}

function limitError(ctx, err) {
  const d = err && Array.isArray(err.details) ? err.details[0] : null;
  if (err && err.code === 'limitExceeded' && d) {
    if (d.code === 'outOfBounds') return ctx.t('limits.outOfBounds', { min: ctx.fmt.number(d.min, 4), max: ctx.fmt.number(d.max, 4) });
    if (d.code === 'orderViolation') {
      const cat = ctx.base.thresholds.thresholds;
      const name = (id) => thresholdLabel(ctx, cat.find((x) => x.id === id));
      return ctx.t('limits.order', { lower: name(d.lower), upper: name(d.upper) });
    }
    return ctx.t(`limits.${d.code}`);
  }
  return errorText(ctx.t, err);
}

function saveRow(ctx, key, getValue, msg) {
  return async () => {
    msg.textContent = '';
    msg.className = 'inline-msg';
    try {
      await ctx.api.setOverride(key, getValue());
      await ctx.refreshOverrides();
    } catch (e) {
      msg.textContent = limitError(ctx, e);
      msg.className = 'inline-msg inline-msg--error';
    }
  };
}

function resetRow(ctx, key, msg) {
  return async () => {
    try {
      await ctx.api.resetOverride(key);
      await ctx.refreshOverrides();
    } catch (e) {
      msg.textContent = limitError(ctx, e);
      msg.className = 'inline-msg inline-msg--error';
    }
  };
}

function thresholdRow(ctx, thr) {
  const { t, fmt } = ctx;
  const pct = ctx.base.config.adminLimits.maxDeviationPct;
  const { min, max } = allowedRange(thr, pct);
  const current = ctx.thr[thr.id];
  const changed = ctx.thrChanged.has(thr.id);
  const id = `thr-${thr.id}`;
  const step = 1 / 10 ** (thr.decimals ?? 2);
  const input = el('input', { id, type: 'number', inputmode: 'decimal', min, max, step, value: current, class: 'input--narrow' });
  const msg = el('span', { class: 'inline-msg', role: 'status' });
  const unit = fmt.unitSymbol(thr.unit);
  return el('tr', {}, [
    el('th', { scope: 'row' }, [el('label', { for: id, text: thresholdLabel(ctx, thr) })]),
    el('td', { text: `${fmt.number(thr.value, 4)} ${unit} · ${sourceShort(ctx, thr.sourceId)}` }),
    el('td', { class: 'nowrap' }, [input, ` ${unit}`]),
    el('td', { text: `${fmt.number(min, 4)} – ${fmt.number(max, 4)}` }),
    el('td', {}, [changed ? chip(t('limits.changed'), 'warn') : chip(t('limits.published'), 'neutral')]),
    el('td', {}, [el('span', { class: 'btn-group' }, [
      el('button', { type: 'button', class: 'btn btn--small', text: t('limits.save'), onclick: saveRow(ctx, `threshold:${thr.id}`, () => Number(input.value), msg) }),
      changed ? el('button', { type: 'button', class: 'btn btn--small', text: t('limits.reset'), onclick: resetRow(ctx, `threshold:${thr.id}`, msg) }) : null,
      msg,
    ])]),
  ]);
}

function thresholdTable(ctx, list, caption) {
  const head = ['limits.col.name', 'limits.col.published', 'limits.col.current', 'limits.col.allowed', 'account.status', 'account.action'];
  return el('div', { class: 'table-wrap' }, [el('table', {}, [
    el('caption', { class: 'visually-hidden', text: caption }),
    el('thead', {}, [el('tr', {}, head.map((k) => el('th', { scope: 'col', text: ctx.t(k) })))]),
    el('tbody', {}, list.map((thr) => thresholdRow(ctx, thr))),
  ])]);
}

function plansTable(ctx) {
  const { t, fmt } = ctx;
  const base = ctx.base.plans.plans;
  const rows = ctx.data.plans.plans.map((p) => {
    const cells = Object.entries(PLAN_FIELDS).map(([field, spec]) => {
      const id = `plan-${p.id}-${field}`;
      const msg = el('span', { class: 'inline-msg', role: 'status' });
      const control = spec.values
        ? el('select', { id }, spec.values.map((v) => el('option', { value: v, text: t(`planStatus.${v}`) })))
        : el('input', { id, type: 'number', min: spec.min, max: spec.max, step: 1, value: p[field], class: 'input--narrow' });
      control.value = String(p[field]);
      const original = base.find((b) => b.id === p.id)[field];
      const key = `plan:${p.id}:${field}`;
      return el('td', {}, [
        el('label', { for: id, class: 'visually-hidden', text: `${t(`plans.${p.id}.name`)} — ${t(`limits.plan.${field}`)}` }),
        control,
        el('span', { class: 'btn-group' }, [
          el('button', { type: 'button', class: 'btn btn--small', text: t('limits.save'), onclick: saveRow(ctx, key, () => (spec.values ? control.value : Number(control.value)), msg) }),
          p[field] !== original ? el('button', { type: 'button', class: 'btn btn--small', text: t('limits.reset'), onclick: resetRow(ctx, key, msg) }) : null,
        ]),
        el('span', { class: 'field__hint', text: spec.values ? '' : `${fmt.number(spec.min, 0)} – ${fmt.number(spec.max, 0)}` }),
        msg,
      ]);
    });
    return el('tr', {}, [el('th', { scope: 'row', text: t(`plans.${p.id}.name`) }), ...cells]);
  });
  return el('div', { class: 'table-wrap' }, [el('table', {}, [
    el('caption', { text: t('limits.plansTitle') }),
    el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: t('plans.col.name') }), ...Object.keys(PLAN_FIELDS).map((f) => el('th', { scope: 'col', text: t(`limits.plan.${f}`) }))])]),
    el('tbody', {}, rows),
  ])]);
}

function configList(ctx) {
  const { t } = ctx;
  const items = Object.keys(CONFIG_FIELDS).map((flag) => {
    const id = `cfg-${flag}`;
    const msg = el('span', { class: 'inline-msg', role: 'status' });
    const box = el('input', { id, type: 'checkbox' });
    box.checked = ctx.data.config[flag] === true;
    const changed = ctx.data.config[flag] !== ctx.base.config[flag];
    return el('li', { class: 'field field--check' }, [
      box,
      el('label', { for: id }, [el('code', { text: flag }), ` — ${t(`limits.config.${flag}`)}`]),
      el('span', { class: 'btn-group' }, [
        el('button', { type: 'button', class: 'btn btn--small', text: t('limits.save'), onclick: saveRow(ctx, `config:${flag}`, () => box.checked, msg) }),
        changed ? el('button', { type: 'button', class: 'btn btn--small', text: t('limits.reset'), onclick: resetRow(ctx, `config:${flag}`, msg) }) : null,
        msg,
      ]),
    ]);
  });
  items.push(el('li', {}, [el('code', { text: 'paymentsEnabled' }), `: ${t('admin.off')} — ${t('limits.config.paymentsLocked')}`]));
  return el('ul', { class: 'plain-list stack' }, items);
}

export function renderLimits(ctx) {
  const { t } = ctx;
  const cat = ctx.base.thresholds.thresholds;
  const sections = ctx.base.parameters.sections;
  const groups = sections.map((s) => ({
    title: t(`echoSections.${s.id}`),
    list: cat.filter((x) => x.param && s.parameters.some((p) => p.id === x.param)),
  })).filter((g) => g.list.length);
  groups.push({ title: t('limits.ruleCutoffs'), list: cat.filter((x) => !x.param) });
  const changedCount = ctx.thrChanged.size;
  return el('section', { class: 'card', 'aria-labelledby': 'limits-title' }, [
    el('h2', { id: 'limits-title', text: t('limits.title') }),
    el('p', { class: 'text-muted', text: t('limits.intro', { pct: ctx.base.config.adminLimits.maxDeviationPct }) }),
    changedCount ? el('p', { class: 'alert alert--info', text: t('limits.changedCount', { count: changedCount }) }) : null,
    ...groups.map((g) => el('details', { class: 'limits-group' }, [el('summary', { text: `${g.title} (${g.list.length})` }), thresholdTable(ctx, g.list, g.title)])),
    el('h3', { text: t('limits.plansTitle') }),
    plansTable(ctx),
    el('h3', { text: t('limits.configTitle') }),
    configList(ctx),
  ]);
}
