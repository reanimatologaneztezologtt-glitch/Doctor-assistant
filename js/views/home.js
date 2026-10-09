import { el, icon } from '../ui/dom.js';

export function renderHome(ctx) {
  const { t } = ctx;
  const cards = ['echo', 'calculators', 'conclusion', 'assistant'].map((id) => {
    const item = ctx.data.navigation.items.find((n) => n.id === id);
    return el('a', { class: 'tile', href: `#${id}` }, [
      icon(item.icon, id === 'echo' ? 'icon--arterial' : 'icon--venous'),
      el('span', { class: 'tile__title', text: t(item.labelKey) }),
      el('span', { class: 'tile__text', text: t(`home.tile.${id}`) }),
    ]);
  });
  return [
    el('h1', { text: t('home.heading') }),
    el('p', { class: 'lead', text: t('home.intro') }),
    el('div', { class: 'tiles' }, cards),
    el('div', { class: 'card' }, [
      el('h2', { text: t('home.rulesHeading') }),
      el('ul', { class: 'list' }, [
        el('li', { text: t('home.notDiagnostic') }),
        el('li', { text: t('home.privacy') }),
        el('li', { text: t('home.sourcesNote') }),
        el('li', { text: ctx.api.mode === 'demo' ? t('home.modeDemo') : t('home.modeServer') }),
      ]),
    ]),
  ];
}
