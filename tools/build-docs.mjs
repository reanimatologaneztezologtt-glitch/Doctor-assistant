// Builds docs/guide-uz.md (Uzbek, Cyrillic) from the data files, so tables of
// reference values, formulas, rules and cut-offs always match the code.
// Run: node tools/build-docs.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslator } from '../js/core/i18n.js';
import { allowedRange, resolveParameters, thresholdValues, PLAN_FIELDS } from '../js/core/thresholds.js';
import { runReferenceTests } from '../js/core/calc.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const config = json('config/app.json');
const uz = json('data/i18n/uz.json');
const sources = json('data/sources.json').sources;
const catalog = json('data/thresholds.json');
const published = thresholdValues(catalog);
const parameters = resolveParameters(json('data/parameters.json'), published);
const formulas = json('data/formulas/index.json').calculators.map((id) => json(`data/formulas/${id}.json`));
const rules = json('data/rules.json').rules;
const plans = json('data/plans.json');
const providers = json('data/providers.json').providers;
const specialties = json('data/specialties.json');

const nf = (v, d = 2) => new Intl.NumberFormat('uz-Cyrl', { maximumFractionDigits: d }).format(v);
const vars = Object.fromEntries(catalog.thresholds.map((t) => [t.id, nf(published[t.id], t.decimals ?? 2)]));
const t = createTranslator(uz, null, (k) => { throw new Error(`missing ${k}`); }, vars);
const src = (id) => sources.find((s) => s.id === id).short;
const unit = (u) => (u && u !== 'ratio' ? t(`units.${u}.sym`) : '');
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
const range = (n, u) => {
  const s = unit(u);
  const tail = s ? (u === 'pct' ? s : ` ${s}`) : '';
  if (n.low !== undefined && n.high !== undefined) return `${nf(n.low)}–${nf(n.high)}${tail}`;
  if (n.low !== undefined) return `${n.lowExclusive ? '>' : '≥'}${nf(n.low)}${tail}`;
  return `≤${nf(n.high)}${tail}`;
};
const sexName = (s) => (s === 1 ? 'эркаклар' : s === 2 ? 'аёллар' : 'ҳамма');

const out = [];
const h = (level, text) => out.push('', `${'#'.repeat(level)} ${text}`, '');
const p = (text) => out.push(text, '');

out.push(`# ${t('app.title')} — тўлиқ қўлланма`, '');
p(`${t('app.tagline')}. 1-босқич, синов версияси ${config.version}. Бу ҳужжат \`node tools/build-docs.mjs\` командаси билан маълумот файлларидан автоматик тузилади.`);
p(`> ${t('disclaimer.text')}`);

h(2, 'Мундарижа');
p(['1. Сайт нима қилади', '2. Ишга тушириш', '3. Иш кетма-кетлиги (1–8 қадам)', '4. Роллар ва ҳуқуқлар', '5. ЭхоКГ параметрлари ва меъёрлар',
  '6. Калькуляторлар', '7. Қоралама хулоса қоидалари', '8. Админ ўзгартира оладиган чегаралар', '9. Тарифлар ва тўлов модули',
  '10. AI ёрдамчи', '11. Махфийлик ва хавфсизлик', '12. Тестлар', '13. Файл тузилмаси', '14. Манбалар', '15. Очиқ масалалар'].join('\n'));

h(2, '1. Сайт нима қилади');
p(`${t('home.intro')} ${t('home.notDiagnostic')}`);
p(`Тиллар: ўзбекча (кирилл), русча, инглизча. Ёруғ ва қоронғи режим. Компьютер ва телефонда ишлайди. PWA: интернетсиз ҳам калькулятор ва матнлар очилади.`);
p(`Глобал флаглар (\`config/app.json\`): testMode = ${config.testMode}, paymentsEnabled = ${config.paymentsEnabled}, aiEnabled = ${config.aiEnabled}, adminLimits.maxDeviationPct = ${config.adminLimits.maxDeviationPct}.`);

h(2, '2. Ишга тушириш');
h(3, '2.1. Сервер режими (тўлиқ)');
p(['```sh', 'npm install', 'export ANTHROPIC_API_KEY=...   # фақат серверда', 'npm start                     # http://localhost:8080', 'npm run grant-admin -- email@example.uz   # биринчи админни тайинлаш', 'npm test                      # барча тестлар', '```'].join('\n'));
p(table(['Ўзгарувчи', 'Вазифаси'], [
  ['ANTHROPIC_API_KEY', 'Claude API калити. Фақат сервер муҳитида; кодга, git\'га, браузерга ёзилмайди.'],
  ['PORT', 'Порт, стандарт 8080'],
  ['DATA_FILE', 'JSON база, стандарт server/data/db.json (git\'га кирмайди)'],
  ['COOKIE_SECURE=1', 'HTTPS орқасида ишлаганда'],
  ['TRUST_PROXY=1', 'Reverse proxy орқасида ишлаганда'],
]));
h(3, '2.2. Демо режими (серверсиз)');
p(`Сервер жавоб бермаса (статик хостинг, claude.ai ҳаволаси, битта HTML файл), худди шу бизнес-мантиқ браузерда ишлайди ва маълумотни шу браузерда сақлайди. Демо ҳисоблар (парол \`demo1234\`):`);
p(table(['Почта', 'Роль', 'Мутахассислик', 'Изоҳ'], [
  ['admin@demo.uz', 'врач + админ', t('specialties.functional_diagnostics'), 'барча қарорлар ва чегаралар'],
  ['cardio@demo.uz', 'врач', t('specialties.cardiology'), 'тасдиқланган'],
  ['anest@demo.uz', 'врач', t('specialties.anesthesiology_icu'), 'кардиология қоидасини тасдиқлай олмайди'],
  ['newdoc@demo.uz', 'врач', t('specialties.cardiology'), 'текшириш кутилмоқда'],
  ['resident@demo.uz', 'резидент', t('specialties.cardiology'), 'савол юборади'],
  ['student@demo.uz', 'талаба', t('studyDirections.general_medicine'), 'савол юборади'],
]));

h(2, '3. Иш кетма-кетлиги (1–8 қадам)');
p(table(['Қадам', 'Натижа', 'Асосий файллар'], [
  ['1', 'Тузилма, уч тил, PWA, дизайн тизими, config', 'index.html, data/i18n/, sw.js, css/tokens.css, config/app.json'],
  ['2', 'Регистрация, роллар, врач лицензиясини текшириш, админ панели', 'js/core/policy.js, js/core/service.js, js/views/account.js, js/views/admin.js'],
  ['3', 'ЭхоКГ параметрлари ва «?» тушунтириш ойнаси', 'data/parameters.json, js/views/echo.js, js/views/param-modal.js, assets/diagrams/'],
  ['4', 'Калькуляторлар ва эталон тестлар', 'data/formulas/*.json, js/core/calc.js, js/core/expr.js'],
  ['5', 'Claude прокси, лимитлар, usage журнали', 'server/ai.mjs, server/limits.mjs, js/core/ai-guard.js'],
  ['6', 'Тарифлар (тест режими), тўлов адаптерлари (stub)', 'data/plans.json, data/providers.json, server/payments/'],
  ['7', 'ҚОРАЛАМА хулоса ва тасдиқлаш журнали', 'data/rules.json, js/core/rules.js, js/views/conclusion.js'],
  ['8', 'Якуний тестлар, аксессибилитий, офлайн', 'tests/'],
  ['+', 'Админ барча тиббий қарорларни тасдиқлайди ва ўзгартиради', 'js/core/policy.js, js/views/admin.js'],
  ['+', 'Админ чегаралар, тарифлар ва созламаларни рухсат этилган оралиқда ўзгартиради', 'data/thresholds.json, js/core/thresholds.js, js/views/admin-limits.js'],
]));
h(3, 'Фойдаланувчи учун кетма-кетлик');
p([
  '1. «Профил» — рўйхатдан ўтиш (исм, почта, парол, роль, мутахассислик ёки ўқиш йўналиши, муассаса, диплом/лицензия рақами, «Маълумотим тўғри»).',
  '2. Врач бўлса — админ лицензияни текширади; ҳолат «Текшириш кутилмоқда» → «Тасдиқланган».',
  '3. «ЭхоКГ параметрлари» — ўлчовлар киритилади (фақат браузерда сақланади); ҳар параметр ёнида меъёр ва «?» тушунтириш.',
  '4. «Калькуляторлар» — ФВ, ИММЛЖ/RWT, E/A ва E/e′, PASP, RAP; эталон мисол ва манба билан.',
  '5. «Хулоса (қоралама)» — қоидалар асосида ҚОРАЛАМА; тасдиқланмагунча сақланмайди ва нусха олинмайди.',
  '6. Тасдиқлаш — мутахассислиги мос тасдиқланган врач ёки админ; «Врач изоҳи» алоҳида белгиланади; журналга ёзилади.',
  '7. Резидент ва талаба — «Врачга саволлар» орқали савол юборади; жавобни шу мутахассисликдаги врач беради.',
  '8. «AI ёрдамчи» — таълим саволлари; ҳар жавоб манба ва «AI томонидан тайёрланган, врач тасдиғисиз» белгиси билан.',
].join('\n'));

h(2, '4. Роллар ва ҳуқуқлар');
p(table(['Ҳаракат', 'Талаба', 'Резидент', 'Врач (текширилмаган)', 'Врач (тасдиқланган)', 'Админ'], [
  ['Маълумот, калькулятор, AI', 'ҳа', 'ҳа', 'ҳа', 'ҳа', 'ҳа'],
  ['Қоидани кўриш', 'ҳа', 'ҳа', 'ҳа', 'ҳа', 'ҳа'],
  ['Қоида/хулосани тасдиқлаш', 'йўқ', 'йўқ', 'йўқ', 'фақат ўз мутахассислиги', 'ҳамма мутахассислик'],
  ['Қарорни бекор қилиш (revoke)', 'йўқ', 'йўқ', 'йўқ', 'йўқ', 'ҳа'],
  ['Врачга савол юбориш', 'ҳа', 'ҳа', 'ҳа', 'ҳа', 'ҳа'],
  ['Саволга жавоб бериш', 'йўқ', 'йўқ', 'йўқ', 'фақат ўз мутахассислиги', 'йўқ (агар ўзи мос врач бўлмаса)'],
  ['Лицензияни текшириш', 'йўқ', 'йўқ', 'йўқ', 'йўқ', 'ҳа'],
  ['Чегаралар, тарифлар, созламалар', 'йўқ', 'йўқ', 'йўқ', 'йўқ', 'рухсат этилган оралиқда'],
]));
p('Админ ролини фақат тизим эгаси `npm run grant-admin` командаси билан беради; сайт орқали олиб бўлмайди. Админ ҳаракатлари интерфейсда ва журналда «(админ)» деб белгиланади.');
p(`Мутахассисликлар: ${specialties.specialties.map((s) => t(`specialties.${s.id}`)).join(', ')}. Ўқиш йўналишлари: ${specialties.studyDirections.map((s) => t(`studyDirections.${s.id}`)).join(', ')}.`);

h(2, '5. ЭхоКГ параметрлари ва меъёрлар');
p('Меъёрлар манбада эълон қилинган қийматлар. Жинс: эркаклар/аёллар алоҳида бўлса, иккаласи кўрсатилган.');
for (const section of parameters.sections) {
  h(3, t(`echoSections.${section.id}`));
  out.push(table(['Параметр', 'Қисқартма', 'Бирлик', 'Меъёр', 'Манба'], section.parameters.map((prm) => [
    t(`params.${prm.id}.name`) + (prm.derive ? ' *' : ''),
    t(`params.${prm.id}.abbr`),
    unit(prm.unit) || '—',
    prm.norms ? prm.norms.map((n) => `${n.sex ? `${sexName(n.sex)}: ` : ''}${range(n, prm.unit)}`).join('; ') : t(`params.${prm.id}.normNote`),
    src(prm.sourceId),
  ])), '');
}
p('\\* — бошқа параметрлардан автоматик ҳисобланади.');

h(2, '6. Калькуляторлар');
for (const f of formulas) {
  const tests = runReferenceTests(f, published);
  h(3, t(`calc.${f.id}.title`));
  p(`Формула: \`${f.formula}\``);
  const note = uz.calc[f.id] && uz.calc[f.id].note ? t(`calc.${f.id}.note`) : '';
  if (note) p(note);
  p(`Манба: ${f.sourceIds.map(src).join('; ')}.`);
  p(table(['Эталон мисол (кириш)', 'Кутилган натижа', 'Чегара (±)', 'Ҳолат'], f.tests.map((tc, i) => [
    Object.entries(tc.inputs).map(([k, v]) => `${k}=${v}`).join(', '),
    Object.entries(tc.expected).map(([k, v]) => `${k}=${v}`).join(', '),
    String(tc.tolerance),
    tests.filter((r) => r.index === i).every((r) => r.pass) ? 'ўтди' : 'ХАТО',
  ])));
}

h(2, '7. Қоралама хулоса қоидалари');
p('Ҳар қоида манба, мутахассислик ва ифода билан. Хулоса автоматик «ҚОРАЛАМА» ҳолатида тайёрланади; тасдиқсиз сақланмайди ва чиқарилмайди.');
p(table(['Қоида', 'Матн', 'Шарт', 'Манба'], rules.map((r) => [r.id, t(`rules.${r.id}`), `\`${r.when}\``, src(r.sourceId)])));

h(2, '8. Админ ўзгартира оладиган чегаралар');
p(`Ҳар чегара манбадаги қийматидан ±${config.adminLimits.maxDeviationPct}% оралиқда ва мантиқий тартибни бузмасдан ўзгартирилиши мумкин. Ўзгарган қиймат сайтда «админ ўзгартирган (манбадаги қиймат: …)» деб кўрсатилади, журналга ёзилади ва аслига қайтарилиши мумкин. Формула коэффициентлари ўзгармайди; эталон тестлар доим манбадаги қийматлар билан текширилади.`);
p(table(['ID', 'Манбадаги қиймат', 'Рухсат этилган оралиқ', 'Манба'], catalog.thresholds.map((th) => {
  const r = allowedRange(th, config.adminLimits.maxDeviationPct);
  return [th.id, `${nf(th.value, th.decimals)} ${unit(th.unit)}`.trim(), `${nf(r.min, 4)} – ${nf(r.max, 4)}`, src(th.sourceId)];
})));
p(`Тартиб чекловлари (чапдаги қиймат ўнгдагидан кичик бўлиши шарт): ${catalog.order.map(([a, b]) => `${a} < ${b}`).join('; ')}.`);

h(2, '9. Тарифлар ва тўлов модули');
p(t('plans.intro'));
p(table(['Тариф', 'Давр', 'Нарх', 'Кунлик сўров', 'max_tokens', 'Ҳолат'], plans.plans.map((pl) => [
  t(`plans.${pl.id}.name`), pl.period ? t(`periods.${pl.period}`) : '—', `${pl.price} ${plans.currency}`, pl.dailyRequests, pl.maxTokens, t(`planStatus.${pl.status}`),
])));
p(`Админ ўзгартира оладиган оралиқ: кунлик сўров ${PLAN_FIELDS.dailyRequests.min}–${PLAN_FIELDS.dailyRequests.max}, max_tokens ${PLAN_FIELDS.maxTokens.min}–${PLAN_FIELDS.maxTokens.max}, нарх ≥ 0 (бепул тарифда доим 0). ${t('plans.cancelRule')}`);
p(`Тўлов провайдерлари (ҳозир stub, уланмаган): ${providers.map((x) => x.name).join(', ')}. Ҳар бирида createCheckout(), verifyWebhook(), getSubscriptionStatus(), cancel(). paymentsEnabled = false бўлганда адаптерлар юкланмайди. Webhook имзоси текширилмаса, рад этилади. ${t('plans.cardDataNote')} Солиқ, ҳисоб-фактура ва провайдер шартлари ҳар юрисдикция учун алоҳида ҳуқуқий текширувни талаб қилади.`);

h(2, '10. AI ёрдамчи');
p([
  `- Модель серверда қатъий белгиланган; max_tokens тарифдан олинади; браузер буларни ўзгартира олмайди.`,
  `- Лимитлар: IP бўйича (10 сўров/дақиқа), сессия бўйича (6 сўров/дақиқа), сўров ҳажми (2000 белги, 12 тагача ҳабар), тариф бўйича кунлик лимит.`,
  `- Ҳар сўров usage журналига ёзилади (user_id, сана, токенлар, натижа).`,
  `- Бемор шахсий маълумоти (сана, узун рақам, почта, паспорт, «туғилган сана» каби сўзлар) аниқланса, сўров юборилмайди.`,
  `- «Инструкцияни унут» каби сўровлар моделга етиб бормасдан рад этилади.`,
  `- Жавобда сайт базасидаги манба бўлмаса, жавоб берилмайди («Манба топилмади»).`,
  `- Ҳар жавоб «${t('ai.label')}» белгиси билан.`,
  `- AI ташхис қўймайди ва даволаш тавсия қилмайди.`,
  `- claude.ai ҳаволасида AI фойдаланувчининг ўз Claude ҳисоби орқали ишлайди; битта HTML файлда AI йўқ.`,
].join('\n'));

h(2, '11. Махфийлик ва хавфсизлик');
p([
  `- ${t('home.privacy')}`,
  '- Пароллар хешланади (сервер: scrypt, демо: PBKDF2). Диплом/лицензия рақами фақат админга кўринади.',
  '- Сессия: HttpOnly, SameSite=Strict cookie; POST фақат JSON; бошқа сайтдан келган сўров рад этилади; сўров ҳажми 32 КБ гача.',
  '- Сервер фақат очиқ файлларни беради (index.html, css/, js/, data/, config/, assets/); server/, tests/, .env, node_modules берилмайди.',
  '- Аналитика ва реклама скриптлари йўқ; CSP фақат ўз файлларига рухсат беради.',
  '- Тасдиқлаш журналида ўлчов қийматлари эмас, фақат қоида ID лари сақланади.',
].join('\n'));

h(2, '12. Тестлар');
p('`npm test` — калькулятор эталонлари, қоидалар ва диастолик алгоритм, маълумотлар бутунлиги, роллар ва ҳуқуқлар, чегаралар ва тартиб, AI ҳимояси, HTTP API, уч тилдаги матнлар, WCAG контрасти, PWA кеш, махфий калитлар. Браузер текширувлари (Playwright + axe-core) WCAG 2.1 AA, телефон кенглиги ва офлайн режимни қамрайди.');

h(2, '13. Файл тузилмаси');
p(['```', 'index.html, sw.js, manifest.webmanifest', 'config/app.json          глобал флаглар', 'css/                     дизайн тизими (ёруғ/қоронғи)',
  'js/core/                 бизнес-мантиқ (сервер ва браузер учун умумий)', 'js/api/                  сервер ва демо адаптерлари', 'js/views/                саҳифалар',
  'data/                    i18n, параметрлар, формулалар, қоидалар, чегаралар, тарифлар, провайдерлар, манбалар', 'assets/                  SVG иконкалар ва схематик чизмалар',
  'server/                  Node сервер, AI прокси, тўлов адаптерлари', 'tests/                   автоматик тестлар', 'tools/                   precache, ҳужжат ва битта HTML йиғувчи скриптлар', '```'].join('\n'));
p('Янги калькулятор, қоида, чегара, тариф ёки провайдер қўшиш учун кодни ўзгартириш шарт эмас: тегишли JSON файлга ёзув ва `data/i18n/*.json` га матн қўшилади.');

h(2, '14. Манбалар');
p(sources.map((s) => `- **${s.short}** (\`${s.id}\`): ${s.citation}`).join('\n'));

h(2, '15. Очиқ масалалар');
p([
  '- Тиббий қийматлар асл нашрлардан малакали шифокор томонидан қайта текширилиши керак.',
  '- Ўзбекча тиббий қисқартмалар (ФВ, КДР, ИММЛЖ ва ҳ.к.) рус шаклида; маҳаллий стандартга мослаштириш мумкин.',
  `- Админ ўзгартириш оралиғи ±${config.adminLimits.maxDeviationPct}% — тасдиқ ёки аниқлаштириш кутилмоқда.`,
  '- Тўлов провайдерлари уланмаган (stub); 2-босқичда ҳуқуқий текширувдан кейин.',
  '- 2-босқич: интенсив терапия калькуляторлари, таълим режими, PDF ҳисобот, 3D иконкалар, юрак модели.',
].join('\n'));

writeFileSync(join(ROOT, 'docs/guide-uz.md'), `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`);
console.log('docs/guide-uz.md written');
