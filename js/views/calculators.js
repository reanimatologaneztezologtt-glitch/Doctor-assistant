// Calculators from data/formulas/*.json with reference examples.
import { findNorm, normStatus, roundTo, runCalculator, runReferenceTests } from '../core/calc.js';
import { computeMeasurements } from '../core/measurements.js';
import { el, chip, field } from '../ui/dom.js';
import { sourceLine } from './common.js';

// Calculator fields reuse echo parameter names; other outputs have their own keys.
function isParam(ctx, id) {
  return ctx.data.parameters.sections.some((sec) => sec.parameters.some((p) => p.id === id));
}
function labelFor(ctx, id) {
  return ctx.t(isParam(ctx, id) ? `params.${id}.name` : `outputs.${id}.name`);
}
function abbrFor(ctx, id) {
  return ctx.t(isParam(ctx, id) ? `params.${id}.abbr` : `outputs.${id}.abbr`);
}

function calculatorCard(ctx, def) {
  const { t, fmt } = ctx;
  const values = {};
  const inputs = {};
  const result = el('div', { class: 'calc__result', 'aria-live': 'polite' });
  const testOut = el('div', { class: 'calc__test' });

  function recompute() {
    result.replaceChildren();
    const run = runCalculator(def, values);
    if (!run.ok) {
      const filled = Object.keys(values).length;
      if (filled) {
        const bad = run.errors.filter((e) => e.code !== 'required');
        result.append(el('p', { class: 'text-muted', text: bad.length ? t('calc.outOfRange') : t('calc.fillAll') }));
      }
      return;
    }
    const scope = { ...run.inputs, ...run.outputs };
    const rows = def.outputs.map((out) => {
      const v = run.outputs[out.id];
      if (out.type === 'category') {
        return el('div', { class: 'calc__row' }, [
          el('span', { class: 'calc__label', text: labelFor(ctx, out.id) }),
          el('strong', { text: t(out.categories[String(v)]) }),
        ]);
      }
      const norm = findNorm(def.norms, out.id, run.inputs);
      const status = normStatus(norm, v);
      const shown = fmt.withUnit(v, out.unit, out.decimals);
      const normText = norm ? `${t('norm.label')} ${fmt.normRange(norm, out.unit, 2)}${norm.when && norm.when.sex ? ` (${fmt.sexLabel(norm.when.sex)})` : ''}` : '';
      return el('div', { class: 'calc__row' }, [
        el('span', { class: 'calc__label', text: `${labelFor(ctx, out.id)} (${abbrFor(ctx, out.id)})` }),
        el('strong', { class: 'calc__value', text: shown }),
        normText ? el('span', { class: 'calc__norm', text: normText }) : null,
        status ? chip(t(`status.${status}`), status === 'normal' ? 'ok' : 'warn') : null,
        el('span', { class: 'words', text: `${labelFor(ctx, out.id)}: ${fmt.number(v, out.decimals)} ${fmt.unitWords(roundTo(v, out.decimals), out.unit)}`.trim() }),
      ]);
    });
    // Norms on inputs (e.g. TR velocity) are reported too.
    const inputNorms = (def.norms || []).filter((n) => def.inputs.some((i) => i.id === n.output) && findNorm(def.norms, n.output, run.inputs) === n);
    for (const n of inputNorms) {
      const input = def.inputs.find((i) => i.id === n.output);
      const status = normStatus(n, scope[n.output]);
      rows.push(el('div', { class: 'calc__row calc__row--input' }, [
        el('span', { class: 'calc__label', text: `${labelFor(ctx, n.output)} (${abbrFor(ctx, n.output)})` }),
        el('strong', { text: fmt.withUnit(scope[n.output], input.unit, 2) }),
        el('span', { class: 'calc__norm', text: `${t('norm.label')} ${fmt.normRange(n, input.unit, 2)}` }),
        status ? chip(t(`status.${status}`), status === 'normal' ? 'ok' : 'warn') : null,
      ]));
    }
    result.append(...rows);
    const aiBtn = el('button', {
      type: 'button', class: 'btn', text: t('calc.askAi'),
      onclick: () => {
        // Only anonymous numbers and units are passed to the assistant.
        const nums = def.outputs.filter((o) => o.type !== 'category')
          .map((o) => `${abbrFor(ctx, o.id)} = ${fmt.withUnit(run.outputs[o.id], o.unit, o.decimals)}`).join('; ');
        ctx.setAssistantDraft(t('calc.aiPrompt', { calculator: t(`calc.${def.id}.title`), values: nums }));
        ctx.navigate('assistant');
      },
    });
    if (ctx.data.config.aiEnabled) result.append(aiBtn);
  }

  function setValues(src) {
    for (const input of def.inputs) {
      const v = src[input.id];
      if (v === undefined) continue;
      values[input.id] = v;
      inputs[input.id].value = String(v);
    }
    recompute();
  }

  const form = el('div', { class: 'calc__inputs' }, def.inputs.map((input) => {
    let control;
    if (input.type === 'select') {
      control = el('select', { id: `c-${def.id}-${input.id}` }, [
        el('option', { value: '', text: t('ui.choose') }),
        ...input.options.map((o) => el('option', { value: String(o.value), text: t(o.labelKey) })),
      ]);
      control.addEventListener('change', () => {
        if (control.value === '') delete values[input.id]; else values[input.id] = Number(control.value);
        recompute();
      });
      inputs[input.id] = control;
      return field({ label: t('params.sex.name'), input: control });
    }
    control = el('input', { id: `c-${def.id}-${input.id}`, type: 'number', inputmode: 'decimal', step: 'any', min: input.min, max: input.max });
    control.addEventListener('input', () => {
      if (control.value === '') delete values[input.id]; else values[input.id] = Number(control.value);
      recompute();
    });
    inputs[input.id] = control;
    return field({
      label: `${labelFor(ctx, input.id)} (${abbrFor(ctx, input.id)}), ${fmt.unitSymbol(input.unit)}`,
      input: control,
      hint: `${fmt.number(input.min, 2)}–${fmt.number(input.max, 2)} ${fmt.unitSymbol(input.unit)}`,
    });
  }));

  const loadExample = () => {
    const test = def.tests[0];
    setValues(test.inputs);
    const results = runReferenceTests(def).filter((r) => r.index === 0);
    testOut.replaceChildren(
      el('p', { class: 'calc__test-title', text: t('calc.referenceExample') }),
      el('ul', { class: 'list' }, results.map((r) => el('li', {
        text: `${abbrFor(ctx, r.outputId)}: ${t('calc.expected')} ${fmt.number(r.expected, 4)}, ${t('calc.actual')} ${fmt.number(r.actual, 4)}, ±${fmt.number(r.tolerance, 4)} — ${r.pass ? t('calc.pass') : t('calc.fail')}`,
      }))),
    );
  };

  const fromEcho = () => {
    const { values: m } = computeMeasurements(ctx.data.parameters, ctx.readMeasurements());
    setValues(m);
  };

  const note = t(`calc.${def.id}.note`);
  return el('article', { class: 'card calc', id: `calc-${def.id}`, 'aria-labelledby': `calc-title-${def.id}` }, [
    el('h2', { id: `calc-title-${def.id}`, text: t(`calc.${def.id}.title`) }),
    el('p', { class: 'formula', text: def.formula }),
    note.startsWith('[') ? null : el('p', { class: 'text-muted', text: note }),
    form,
    el('div', { class: 'toolbar' }, [
      el('button', { type: 'button', class: 'btn', text: t('calc.loadExample'), onclick: loadExample }),
      el('button', { type: 'button', class: 'btn', text: t('calc.fromEcho'), onclick: fromEcho }),
    ]),
    result,
    testOut,
    sourceLine(ctx, def.sourceIds),
  ]);
}

export function renderCalculators(ctx) {
  const { t, data } = ctx;
  const all = data.formulas.flatMap(runReferenceTests);
  const passed = all.filter((r) => r.pass).length;
  return [
    el('h1', { text: t('nav.calculators') }),
    el('p', { class: 'lead', text: t('calc.intro') }),
    el('p', { class: passed === all.length ? 'alert alert--ok' : 'alert alert--error', role: 'status', text: t('calc.selfTest', { passed, total: all.length }) }),
    el('nav', { class: 'toc', 'aria-label': t('calc.list') }, [
      el('ul', {}, data.formulas.map((f) => el('li', {}, [el('a', { href: `#calculators`, 'data-target': `calc-${f.id}`, text: t(`calc.${f.id}.title`), onclick: (e) => { e.preventDefault(); document.getElementById(`calc-${f.id}`).scrollIntoView(); document.getElementById(`calc-title-${f.id}`).focus?.(); } })]))),
    ]),
    ...data.formulas.map((def) => calculatorCard(ctx, def)),
  ];
}
