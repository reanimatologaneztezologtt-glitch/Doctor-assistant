// "?" explanation modal: definition, method, reference values, clinical
// significance, schematic diagram, optional user image (not stored).
import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { sourceCitation, sourceShort } from './common.js';
import { normChangedNote, paramAbbr, paramName } from './param-text.js';

const diagramCache = new Map();

async function loadDiagram(id) {
  if (!diagramCache.has(id)) {
    diagramCache.set(id, fetch(`assets/diagrams/${id}.svg`).then((r) => (r.ok ? r.text() : null)).catch(() => null));
  }
  const text = await diagramCache.get(id);
  if (!text) return null;
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg') return null;
  return document.importNode(svg, true);
}

function normsList(ctx, param) {
  const { t, fmt } = ctx;
  if (!param.norms || !param.norms.length) return el('p', { text: t(`params.${param.id}.normNote`).startsWith('[') ? t('norm.none') : t(`params.${param.id}.normNote`) });
  return el('ul', { class: 'list' }, param.norms.map((n) => el('li', {
    text: `${n.sex ? `${fmt.sexLabel(n.sex)}: ` : ''}${fmt.normRange(n, param.unit, 2)}${normChangedNote(ctx, n, param.unit)}`,
  })));
}

export async function openParamModal(ctx, param) {
  const { t } = ctx;
  const figure = el('figure', { class: 'diagram' });
  if (param.diagram) {
    const svg = await loadDiagram(param.diagram);
    if (svg) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', t(`diagrams.${param.diagram}`));
      figure.append(svg, el('figcaption', { text: `${t(`diagrams.${param.diagram}`)} — ${t('param.schematic')}` }));
    }
  }

  // User's own image: displayed from memory only, never uploaded or stored.
  const preview = el('div', { class: 'user-image' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', id: `img-${param.id}` });
  let objectUrl = null;
  fileInput.addEventListener('change', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    preview.replaceChildren();
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    objectUrl = URL.createObjectURL(file);
    preview.append(el('img', { src: objectUrl, alt: t('param.userImageAlt') }));
  });

  const section = (titleKey, body) => el('section', { class: 'dialog__section' }, [el('h3', { text: t(titleKey) }), body]);
  const { dialog } = openModal({
    title: `${paramName(ctx, param.id)} (${paramAbbr(ctx, param.id)})`,
    closeLabel: t('ui.close'),
    body: [
      section('param.definition', el('p', { text: t(`params.${param.id}.def`) })),
      section('param.method', el('p', { text: t(`params.${param.id}.method`) })),
      section('param.norm', normsList(ctx, param)),
      section('param.significance', el('p', { text: t(`params.${param.id}.significance`) })),
      figure.childNodes.length ? figure : null,
      section('ui.source', el('p', { class: 'source' }, [el('strong', { text: sourceShort(ctx, param.sourceId) }), ` — ${sourceCitation(ctx, param.sourceId)}`])),
      section('param.userImage', el('div', {}, [
        el('label', { for: fileInput.id, text: t('param.userImageLabel') }),
        fileInput,
        el('p', { class: 'field__hint', text: t('param.userImageHint') }),
        preview,
      ])),
      el('p', { class: 'disclaimer', role: 'note', text: t('disclaimer.text') }),
    ],
  });
  dialog.addEventListener('modalclosed', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });
}
