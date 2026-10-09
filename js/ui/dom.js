// Tiny DOM helpers. Text is always set with textContent (never innerHTML).
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

export function icon(name, extraClass = '') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `icon ${extraClass}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `assets/icons/sprite.svg#${name}`);
  svg.append(use);
  return svg;
}

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function field({ label, input, hint, error }) {
  const id = input.id || uid('f');
  input.id = id;
  const hintId = hint ? `${id}-hint` : null;
  const errId = error ? `${id}-err` : null;
  const describedBy = [hintId, errId].filter(Boolean).join(' ');
  if (describedBy) input.setAttribute('aria-describedby', describedBy);
  if (error) input.setAttribute('aria-invalid', 'true');
  return el('div', { class: 'field' }, [
    el('label', { for: id, text: label }),
    input,
    hint ? el('p', { class: 'field__hint', id: hintId, text: hint }) : null,
    error ? el('p', { class: 'field__error', id: errId, role: 'alert', text: error }) : null,
  ]);
}

export function chip(text, kind = 'neutral') {
  return el('span', { class: `chip chip--${kind}`, text });
}
