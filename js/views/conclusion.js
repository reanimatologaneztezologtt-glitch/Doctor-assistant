// Draft conclusion (spec section 10). Built from the measurements in this
// browser; never stored or exported until a verified doctor of the right
// specialty approves it.
import { computeMeasurements, allParameters } from '../core/measurements.js';
import { evaluateRules, requiredSpecialties } from '../core/rules.js';
import { canApprove } from '../core/policy.js';
import { el, chip, field } from '../ui/dom.js';
import { alertBox, errorText, formatDate, sourceShort, specialtyName } from './common.js';
import { paramAbbr } from './param-text.js';

let approvedState = null; // memory only: { key, approval, note }

export function deciderLabel(ctx, d) {
  return `${d.doctorName}${d.actingAs === 'admin' ? ` (${ctx.t('rule.actingAsAdmin')})` : ''}`;
}

export function ruleStatusChip(ctx, status) {
  const { t } = ctx;
  if (!status) return chip(t('rule.notReviewed'), 'neutral');
  const who = `${deciderLabel(ctx, status)}, ${formatDate(ctx, status.at)}`;
  return status.action === 'approve' ? chip(`${t('rule.approvedBy')} ${who}`, 'ok') : chip(`${t('rule.rejectedBy')} ${who}`, 'warn');
}

// Doctors decide within their specialty (the server rejects others);
// admins may approve, reject or revoke any decision.
export function ruleDecisionButtons(ctx, ruleId, status, onDone) {
  const { t, user } = ctx;
  if (!user || (user.role !== 'doctor' && !user.isAdmin)) return null;
  const msg = el('span', { class: 'inline-msg', role: 'status' });
  const act = (action) => async () => {
    msg.textContent = '';
    try {
      await ctx.api.decideRule(ruleId, action);
      onDone();
    } catch (e) {
      msg.textContent = errorText(t, e);
      msg.className = 'inline-msg inline-msg--error';
    }
  };
  const current = status ? status.action : null;
  return el('span', { class: 'btn-group' }, [
    current !== 'approve' ? el('button', { type: 'button', class: 'btn btn--small', text: t('rule.approve'), onclick: act('approve') }) : null,
    current !== 'reject' ? el('button', { type: 'button', class: 'btn btn--small', text: t('rule.reject'), onclick: act('reject') }) : null,
    user.isAdmin && current ? el('button', { type: 'button', class: 'btn btn--small', text: t('rule.revoke'), onclick: act('revoke') }) : null,
    msg,
  ]);
}

function evidenceText(ctx, finding) {
  const params = allParameters(ctx.data.parameters);
  return finding.evidence.map(({ id, value }) => {
    const p = params.find((x) => x.id === id);
    return `${paramAbbr(ctx, id)} = ${ctx.fmt.withUnit(value, p ? p.unit : null, p ? p.decimals ?? 1 : 2)}`;
  }).join('; ');
}

function approverText(ctx, a) {
  if (a.actingAs === 'admin') return `${a.approvedBy} (${ctx.t('rule.actingAsAdmin')})`;
  return `${a.approvedBy} (${specialtyName(ctx, a.specialty)})`;
}

function buildPlainText(ctx, findings, approval, note) {
  const { t } = ctx;
  const lines = [t('conclusion.title'), ''];
  findings.forEach((f, i) => lines.push(`${i + 1}. ${t(`rules.${f.ruleId}`)} (${evidenceText(ctx, f)}) [${sourceShort(ctx, f.sourceId)}]`));
  if (note) lines.push('', `${t('conclusion.doctorNote')}: ${note}`);
  lines.push('', `${t('conclusion.approvedBy')}: ${approverText(ctx, approval)}, ${formatDate(ctx, approval.at)}`);
  lines.push('', t('disclaimer.text'));
  return lines.join('\n');
}

export async function renderConclusion(ctx) {
  const { t, data, user } = ctx;
  const { values } = computeMeasurements(data.parameters, ctx.readMeasurements());
  const findings = evaluateRules(data.rules.rules, values);
  const statuses = await ctx.api.ruleStatuses().catch(() => ({}));
  // Approval belongs to this exact set of findings and this signed-in doctor.
  const key = JSON.stringify([user ? user.id : null, findings.map((f) => [f.ruleId, f.evidence])]);
  if (approvedState && approvedState.key !== key) approvedState = null;

  const head = [
    el('h1', { text: t('conclusion.title') }),
    el('p', { class: 'lead', text: t('conclusion.intro') }),
  ];

  const allRules = el('details', { class: 'card' }, [
    el('summary', { text: t('conclusion.allRules', { count: data.rules.rules.length }) }),
    el('p', { class: 'text-muted', text: t('conclusion.rulesHelp') }),
    el('ul', { class: 'rule-list' }, data.rules.rules.map((r) => el('li', {}, [
      el('p', { text: t(`rules.${r.id}`) }),
      el('p', { class: 'text-muted' }, [`${t('rule.specialty')}: ${specialtyName(ctx, r.specialty)} · ${t('ui.source')}: ${sourceShort(ctx, r.sourceId)} · `, el('code', { text: r.when })]),
      el('div', { class: 'rule-actions' }, [ruleStatusChip(ctx, statuses[r.id]), ruleDecisionButtons(ctx, r.id, statuses[r.id], () => ctx.rerender())]),
    ]))),
  ]);

  if (!findings.length) {
    return [...head, el('div', { class: 'card' }, [
      el('p', { text: t('conclusion.noFindings') }),
      el('a', { class: 'btn btn--primary', href: '#echo', text: t('conclusion.goToEcho') }),
    ]), allRules];
  }

  const draft = el('section', { class: `card draft${approvedState ? ' draft--approved' : ''}`, 'aria-labelledby': 'draft-title' }, [
    el('div', { class: 'draft__head' }, [
      el('h2', { id: 'draft-title', text: t('conclusion.findings') }),
      approvedState ? chip(t('conclusion.statusApproved'), 'ok') : el('span', { class: 'draft-badge', text: t('conclusion.statusDraft') }),
    ]),
    el('ol', { class: 'findings' }, findings.map((f) => el('li', { class: `finding finding--${f.severity}` }, [
      el('p', { class: 'finding__text', text: t(`rules.${f.ruleId}`) }),
      el('p', { class: 'finding__evidence' }, [el('span', { class: 'text-muted', text: `${t('conclusion.evidence')}: ` }), evidenceText(ctx, f)]),
      el('p', { class: 'text-muted' }, [`${t('ui.source')}: ${sourceShort(ctx, f.sourceId)} · `, ruleStatusChip(ctx, statuses[f.ruleId])]),
      ruleDecisionButtons(ctx, f.ruleId, statuses[f.ruleId], () => ctx.rerender()),
    ]))),
  ]);

  const actions = el('section', { class: 'card' });
  const specialtiesNeeded = requiredSpecialties(findings);
  if (approvedState) {
    const text = buildPlainText(ctx, findings, approvedState.approval, approvedState.note);
    const pre = el('pre', { class: 'plain-text', tabindex: '0', text });
    const copyMsg = el('span', { class: 'inline-msg', role: 'status' });
    actions.append(
      el('h2', { text: t('conclusion.approvedHeading') }),
      approvedState.note ? el('div', { class: 'doctor-note' }, [el('strong', { text: `${t('conclusion.doctorNote')}: ` }), approvedState.note]) : null,
      el('p', { text: `${t('conclusion.approvedBy')}: ${approverText(ctx, approvedState.approval)}, ${formatDate(ctx, approvedState.approval.at)}` }),
      pre,
      el('button', {
        type: 'button', class: 'btn btn--primary', text: t('conclusion.copy'),
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(text);
            copyMsg.textContent = t('conclusion.copied');
          } catch {
            const range = document.createRange();
            range.selectNodeContents(pre);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            copyMsg.textContent = t('conclusion.selectedForCopy');
          }
        },
      }),
      copyMsg,
    );
  } else {
    const checks = specialtiesNeeded.map((sp) => canApprove(user, sp));
    const allowed = checks.every((c) => c.ok);
    if (allowed) {
      const note = el('textarea', { id: 'doctor-note', rows: '3', maxlength: '1000' });
      const msg = el('div', { role: 'status' });
      actions.append(
        el('h2', { text: t('conclusion.approveHeading') }),
        field({ label: t('conclusion.doctorNote'), input: note, hint: t('conclusion.doctorNoteHint') }),
        el('button', {
          type: 'button', class: 'btn btn--primary', text: t('conclusion.approve'),
          onclick: async () => {
            msg.replaceChildren();
            try {
              const approval = await ctx.api.approveConclusion(findings.map((f) => f.ruleId));
              approvedState = { key, approval, note: note.value.trim() };
              ctx.rerender();
            } catch (e) {
              msg.append(alertBox(errorText(t, e)));
            }
          },
        }),
        msg,
      );
    } else {
      const reason = user ? checks.find((c) => !c.ok).reason : 'notSignedIn';
      actions.append(
        el('h2', { text: t('conclusion.cannotApproveHeading') }),
        el('p', { text: t(`errors.${reason}`) }),
        el('p', { class: 'text-muted', text: t('conclusion.requiredSpecialty', { specialty: specialtiesNeeded.map((s) => specialtyName(ctx, s)).join(', ') }) }),
        user ? questionForm(ctx, specialtiesNeeded[0], findings[0].ruleId) : el('a', { class: 'btn', href: '#account', text: t('account.signIn') }),
      );
    }
  }

  return [...head, draft, actions, allRules];
}

// Question to a doctor. Measurement values are not attached (spec section 8).
export function questionForm(ctx, specialty, ruleId = null) {
  const { t } = ctx;
  const text = el('textarea', { id: 'q-text', rows: '3', maxlength: '2000' });
  const msg = el('div', { role: 'status' });
  return el('form', {
    class: 'stack',
    onsubmit: async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      try {
        await ctx.api.createQuestion({ specialty, ruleId, text: text.value });
        text.value = '';
        msg.append(alertBox(t('questions.sent'), 'ok'));
      } catch (err) {
        msg.append(alertBox(errorText(t, err)));
      }
    },
  }, [
    field({ label: t('questions.toDoctor', { specialty: specialtyName(ctx, specialty) }), input: text, hint: t('questions.noPatientData') }),
    el('button', { type: 'submit', class: 'btn btn--primary', text: t('questions.send') }),
    msg,
  ]);
}
