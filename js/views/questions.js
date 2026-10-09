import { el, field } from '../ui/dom.js';
import { alertBox, errorText, formatDate, signInPrompt, specialtyName } from './common.js';
import { questionForm } from './conclusion.js';

function questionCard(ctx, q, canAnswer) {
  const { t } = ctx;
  const answers = q.answers.map((a) => el('div', { class: 'doctor-note' }, [
    el('strong', { text: `${t('conclusion.doctorNote')} — ${a.doctorName} (${specialtyName(ctx, a.specialty)}), ${formatDate(ctx, a.at)}` }),
    el('p', { text: a.text }),
  ]));
  let answerForm = null;
  if (canAnswer) {
    const box = el('textarea', { id: `ans-${q.id}`, rows: '2', maxlength: '2000' });
    const msg = el('div', { role: 'status' });
    answerForm = el('form', {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await ctx.api.answerQuestion(q.id, box.value);
          ctx.rerender();
        } catch (err) {
          msg.replaceChildren(alertBox(errorText(t, err)));
        }
      },
    }, [field({ label: t('questions.answer'), input: box }), el('button', { type: 'submit', class: 'btn btn--primary', text: t('questions.sendAnswer') }), msg]);
  }
  return el('li', { class: 'card' }, [
    el('p', { class: 'text-muted', text: `${q.askerName} (${t(`roles.${q.askerRole}`)}) → ${specialtyName(ctx, q.specialty)} · ${formatDate(ctx, q.createdAt)}${q.ruleId ? ` · ${q.ruleId}` : ''}` }),
    el('p', { text: q.text }),
    answers.length ? el('div', {}, answers) : el('p', { class: 'text-muted', text: t('questions.noAnswer') }),
    answerForm,
  ]);
}

export async function renderQuestions(ctx) {
  const { t, user, data } = ctx;
  const head = [el('h1', { text: t('nav.questions') }), el('p', { class: 'lead', text: t('questions.intro') })];
  if (!user) return [...head, signInPrompt(ctx)];
  const { mine, toAnswer } = await ctx.api.listQuestions();

  const specialtySelect = el('select', { id: 'q-specialty' }, data.specialties.specialties.map((s) => el('option', { value: s.id, text: specialtyName(ctx, s.id) })));
  const formHolder = el('div');
  const renderForm = () => formHolder.replaceChildren(questionForm(ctx, specialtySelect.value));
  specialtySelect.addEventListener('change', renderForm);
  renderForm();

  return [
    ...head,
    el('section', { class: 'card' }, [el('h2', { text: t('questions.new') }), field({ label: t('questions.specialty'), input: specialtySelect }), formHolder]),
    toAnswer.length ? el('section', {}, [el('h2', { text: t('questions.toAnswer') }), el('ul', { class: 'plain-list' }, toAnswer.map((q) => questionCard(ctx, q, true)))]) : null,
    el('section', {}, [el('h2', { text: t('questions.mine') }),
      mine.length ? el('ul', { class: 'plain-list' }, mine.map((q) => questionCard(ctx, q, false))) : el('p', { class: 'text-muted', text: t('questions.none') })]),
  ];
}
