// Echo parameters in ASE/EACVI order. Values are kept in this browser only.
import { computeMeasurements } from '../core/measurements.js';
import { el } from '../ui/dom.js';
import { openParamModal } from './param-modal.js';
import { normLine, paramAbbr, paramName, statusChip, valueLines } from './param-text.js';

export function renderEcho(ctx) {
  const { t, data } = ctx;
  const raw = ctx.readMeasurements();
  const outputs = new Map();

  function recompute() {
    const { values, derived } = computeMeasurements(data.parameters, raw, ctx.thr);
    const sex = values.sex;
    for (const [id, box] of outputs) {
      const param = box.param;
      box.status.replaceChildren();
      box.lines.replaceChildren();
      box.norm.textContent = normLine(ctx, param, sex);
      const value = values[id];
      if (derived.has(id) && box.derivedOut) box.derivedOut.textContent = ctx.fmt.withUnit(value, param.unit, param.decimals ?? 1);
      else if (box.derivedOut) box.derivedOut.textContent = '—';
      if (value === undefined || id === 'sex') continue;
      const chipNode = statusChip(ctx, param, value, sex);
      if (chipNode) box.status.append(chipNode);
      const { numeric, words } = valueLines(ctx, param, value, sex);
      box.lines.append(el('span', { text: numeric }), el('span', { class: 'words', text: words }));
    }
  }

  function inputFor(param) {
    const id = `m-${param.id}`;
    if (param.type === 'select') {
      const select = el('select', { id }, [
        el('option', { value: '', text: t('ui.choose') }),
        ...param.options.map((v) => el('option', { value: String(v), text: v === 1 ? t('sex.male') : t('sex.female') })),
      ]);
      select.value = raw[param.id] !== undefined ? String(raw[param.id]) : '';
      select.addEventListener('change', () => {
        if (select.value === '') delete raw[param.id]; else raw[param.id] = Number(select.value);
        ctx.writeMeasurements(raw);
        recompute();
      });
      return select;
    }
    const input = el('input', {
      id, type: 'number', inputmode: 'decimal', step: 'any', min: param.min, max: param.max,
      value: raw[param.id] ?? '',
    });
    input.addEventListener('input', () => {
      if (input.value === '') delete raw[param.id];
      else raw[param.id] = Number(input.value);
      ctx.writeMeasurements(raw);
      recompute();
    });
    return input;
  }

  const sections = data.parameters.sections.map((section) => {
    const rows = section.parameters.map((param) => {
      const labelId = `m-${param.id}`;
      const status = el('span', { class: 'param__status' });
      const lines = el('p', { class: 'param__lines', 'aria-live': 'polite' });
      const norm = el('span', { class: 'param__norm' });
      let control;
      let derivedOut = null;
      const isDerivedOnly = param.derive && param.min === undefined;
      if (isDerivedOnly) {
        derivedOut = el('output', { id: labelId, class: 'param__derived' });
        control = derivedOut;
      } else {
        control = inputFor(param);
        if (param.derive) derivedOut = el('output', { class: 'param__derived param__derived--small' });
      }
      outputs.set(param.id, { param, status, lines, norm, derivedOut });
      const unit = param.unit ? ctx.fmt.unitSymbol(param.unit) : '';
      return el('div', { class: 'param' }, [
        el('div', { class: 'param__head' }, [
          el('label', { for: labelId, class: 'param__name' }, [
            paramName(ctx, param.id),
            el('span', { class: 'param__abbr', text: ` (${paramAbbr(ctx, param.id)})` }),
          ]),
          el('button', {
            type: 'button', class: 'btn btn--help', 'aria-label': `${t('param.explain')}: ${paramName(ctx, param.id)}`,
            text: '?', onclick: () => openParamModal(ctx, param),
          }),
        ]),
        el('div', { class: 'param__body' }, [
          el('div', { class: 'param__control' }, [control, unit && !isDerivedOnly ? el('span', { class: 'unit', text: unit }) : null]),
          param.derive && !isDerivedOnly ? el('span', { class: 'param__auto' }, [`${t('echo.calculated')}: `, derivedOut]) : null,
          isDerivedOnly ? el('span', { class: 'param__auto', text: t('echo.calculatedHint') }) : null,
          norm,
          status,
        ]),
        lines,
      ]);
    });
    return el('section', { class: 'card param-section', 'aria-labelledby': `sec-${section.id}` }, [
      el('h2', { id: `sec-${section.id}`, text: t(`echoSections.${section.id}`) }),
      ...rows,
    ]);
  });

  const toolbar = el('div', { class: 'toolbar' }, [
    el('button', {
      type: 'button', class: 'btn', text: t('echo.loadDemo'),
      onclick: () => {
        for (const k of Object.keys(raw)) delete raw[k];
        Object.assign(raw, data.demoCase.measurements);
        ctx.writeMeasurements(raw);
        ctx.rerender();
      },
    }),
    el('button', {
      type: 'button', class: 'btn', text: t('echo.clear'),
      onclick: () => { ctx.writeMeasurements({}); ctx.rerender(); },
    }),
    el('a', { class: 'btn btn--primary', href: '#conclusion', text: t('echo.toConclusion') }),
  ]);

  queueMicrotask(recompute);
  return [
    el('h1', { text: t('nav.echo') }),
    el('p', { class: 'lead', text: t('echo.intro') }),
    el('p', { class: 'text-muted', text: t('echo.privacy') }),
    toolbar,
    ...sections,
  ];
}
