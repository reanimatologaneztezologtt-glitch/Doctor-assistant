# Doctor Assistant

Educational echocardiography platform for physicians, residents and medical
students (uz-Cyrl / ru / en). It does not provide individual diagnoses or
treatment decisions.

## Status

Stage 1, work plan step 1: structure, i18n, PWA base, design system, config.

## Run

```sh
npm start        # static dev server on http://localhost:8080 (no dependencies)
npm test         # unit tests (node:test)
```

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | App shell; all visible text comes from `data-i18n` keys |
| `config/app.json` | Global flags: `testMode`, `paymentsEnabled`, `aiEnabled` |
| `css/tokens.css` | Design tokens (light/dark), arterial `#C62828`, venous `#1565C0` |
| `js/core/` | Pure modules (i18n, config, storage), tested in Node |
| `js/app.js` | UI: language/theme switch, navigation, routing |
| `data/i18n/` | `uz.json`, `ru.json`, `en.json` (identical key sets, tested) |
| `data/navigation.json` | Sections; a new section is added here without code changes |
| `data/formulas/`, `data/cases/` | Filled in steps 3–4 |
| `assets/icons/` | Simple SVG icons (no echocardiography photos) |
| `sw.js`, `manifest.webmanifest` | PWA: precache and offline mode |
| `server/` | AI proxy and payment adapters (steps 5–6); never served |
| `tests/` | i18n parity, config flags, WCAG contrast, PWA precache, secrets |

## Rules

- `ANTHROPIC_API_KEY` lives only in the server environment (`.env` is git-ignored).
- No analytics or third-party scripts; CSP allows `'self'` only.
- Patient identifiers are never requested or stored.
