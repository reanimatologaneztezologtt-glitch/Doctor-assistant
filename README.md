# Doctor Assistant

Educational echocardiography platform for physicians, residents and medical
students. Languages: Uzbek (Cyrillic), Russian, English. The site does not
provide individual diagnoses or treatment decisions.

**Status:** stage 1, test version (`testMode: true`, `paymentsEnabled: false`).

## Run

```sh
npm install
npm start              # http://localhost:8080 (server mode)
npm test               # unit, data, i18n, security and API tests
npm run grant-admin -- someone@example.com   # system owner assigns an admin
npm run build:standalone   # dist/doctor-assistant.html: whole site in one file, no server
npm run build:docs         # docs/guide-uz.md: full guide in Uzbek, generated from data
```

Full guide in Uzbek (Cyrillic): [`docs/guide-uz.md`](docs/guide-uz.md).

Environment variables (server only, never committed; see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key for the AI proxy. Without it AI answers "unavailable". |
| `PORT` | Default 8080 |
| `DATA_FILE` | JSON database, default `server/data/db.json` (git-ignored) |
| `COOKIE_SECURE=1` | Behind HTTPS |
| `TRUST_PROXY=1` | Behind a reverse proxy (uses `X-Forwarded-For` for rate limits) |

**Demo mode.** When `api/health` does not answer (static hosting, claude.ai
preview) the same business logic (`js/core/service.js`) runs in the browser and
stores accounts and logs in `localStorage`. Demo accounts are listed on the
Account page (password `demo1234`). In a claude.ai artifact the AI assistant
uses the viewer's own Claude account through the `sample` capability.

## What stage 1 contains

| Work plan step | Where |
| --- | --- |
| 1. Structure, i18n, PWA, design system, config | `index.html`, `data/i18n/`, `sw.js`, `css/tokens.css`, `config/app.json` |
| 2. Registration, roles, doctor verification, admin panel | `js/core/policy.js`, `js/core/service.js`, `js/views/account.js`, `js/views/admin.js` |
| 3. Echo parameters and "?" modal | `data/parameters.json`, `js/views/echo.js`, `js/views/param-modal.js`, `assets/diagrams/` |
| 4. Calculators with reference tests | `data/formulas/*.json`, `js/core/calc.js`, `js/core/expr.js` |
| 5. Claude proxy, limits, usage log | `server/ai.mjs`, `server/limits.mjs`, `js/core/ai-guard.js` |
| 6. Plans (test mode), payment adapter interface (stub) | `data/plans.json`, `data/providers.json`, `server/payments/` |
| 7. DRAFT conclusion and approval log | `data/rules.json`, `js/core/rules.js`, `js/views/conclusion.js` |
| 8. Tests, accessibility, offline | `tests/` |

Adding a calculator, rule, plan or provider is a JSON change:
`data/formulas/index.json` + a formula file, `data/rules.json`,
`data/plans.json`, `data/providers.json` (+ adapter file), with texts in
`data/i18n/*.json`. Formulas use a safe expression language (no `eval`).
After adding client files run `node tools/update-precache.mjs` (offline cache).

## Sources

Every reference value, formula and rule carries a source id from
`data/sources.json`:

| id | Source |
| --- | --- |
| `ase2015` | Lang RM et al. Cardiac chamber quantification. J Am Soc Echocardiogr 2015;28:1-39 |
| `ase2016` | Nagueh SF et al. LV diastolic function. J Am Soc Echocardiogr 2016;29:277-314 |
| `rudski2010` | Rudski LG et al. Right heart in adults. J Am Soc Echocardiogr 2010;23:685-713 |
| `ase2017as` | Baumgartner H et al. Aortic valve stenosis. J Am Soc Echocardiogr 2017;30:372-392 |
| `esc2022ph` | Humbert M et al. 2022 ESC/ERS PH guidelines. Eur Heart J 2022;43:3618-3731 |
| `esc2015ph` | Galiè N et al. 2015 ESC/ERS PH guidelines. Eur Heart J 2016;37:67-119 |
| `esc2015peri` | Adler Y et al. 2015 ESC pericardial diseases. Eur Heart J 2015;36:2921-2964 |
| `devereux1986` | Devereux RB et al. Am J Cardiol 1986;57:450-458 |
| `teichholz1976` | Teichholz LE et al. Am J Cardiol 1976;37:7-11 |
| `mosteller1987` | Mosteller RD. N Engl J Med 1987;317:1098 |

Where a guideline gives no single number (aortic root, absolute LA volume,
E and A velocities, PASP) the site says so instead of inventing one.
Medical content must be reviewed by a qualified physician before production
use; rules show "not reviewed" until a verified doctor of the specialty
approves them.

## Rules enforced in code

- Approval of medical content (rules, draft conclusions): a doctor with an
  admin-verified license within the rule's specialty, or an admin in any
  specialty. An admin can also change or revoke any rule decision and any
  doctor verification. Admin actions are marked "admin" in the UI and logged
  with `actingAs: "admin"` and the previous decision. (Owner's decision; it
  replaces the original spec 4.2 restriction on admins.) Answering questions
  stays with verified doctors of the specialty.
- Admin changes stay within limits. Clinical cut-offs live in one list,
  `data/thresholds.json` (69 values, each with its published value and source).
  Norms, rules, the RAP estimate, LV geometry and rule texts all read from it.
  An admin may set a value only within ±`adminLimits.maxDeviationPct`
  (`config/app.json`, default 20%) of the published value and only if the
  order constraints hold (lower bound < upper bound, mild < moderate < severe).
  Plan limits are bounded (requests/day 1–1000, max_tokens 1000–16000, price
  ≥ 0, free plan price 0); `aiEnabled` and `testMode` can be switched;
  `paymentsEnabled` stays locked while providers are stubs. Formula
  coefficients are not editable, and calculator reference tests always run
  against the published values. Changed values are marked "changed by admin
  (published: …)" wherever they appear, flagged in draft conclusions, passed
  to the AI as such, logged with old/new/published values, and can be reset.
- Draft conclusions are not stored or exported until approved; the approval log
  holds rule ids only, never measurement values.
- Measurements stay in the browser. Questions to doctors and AI requests are
  checked for personal data (dates, long numbers, email, passport, keywords).
- AI: key only in the server environment; model and `max_tokens` fixed on the
  server; per-IP, per-session and daily plan limits; prompt-injection attempts
  refused; answers without a source from the knowledge base are rejected;
  every answer is labelled "Prepared by AI, not approved by a doctor".
- Payments: adapters are not loaded while `paymentsEnabled` is false; webhooks
  fail closed; card data never reaches the server. Tax, invoicing and provider
  terms need legal review per jurisdiction before enabling.
- No analytics or third-party scripts; CSP `'self'` only.
