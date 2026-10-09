// Accessible modal built on <dialog>: focus moves in, Esc closes, focus
// returns to the opener.
import { el } from './dom.js';

export function openModal({ title, body, closeLabel }) {
  const opener = document.activeElement;
  const titleId = `dlg-title-${Date.now()}`;
  const closeBtn = el('button', { type: 'button', class: 'btn btn--ghost dialog__close', 'aria-label': closeLabel, text: '×' });
  const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': titleId }, [
    el('div', { class: 'dialog__head' }, [el('h2', { id: titleId, text: title }), closeBtn]),
    el('div', { class: 'dialog__body' }, body),
  ]);
  const close = () => dialog.close();
  closeBtn.addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('close', () => {
    dialog.dispatchEvent(new CustomEvent('modalclosed'));
    dialog.remove();
    if (opener && opener.focus) opener.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  closeBtn.focus();
  return { dialog, close };
}
