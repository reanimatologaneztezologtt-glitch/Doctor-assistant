# server/

Server-side code. Not served to the browser.

- AI proxy (Claude): work plan step 5. `ANTHROPIC_API_KEY` is read only from the
  server environment; it is never written to code, git, the browser or logs.
- Payment adapters: work plan step 6, `payments/providers/` (stub only while
  `paymentsEnabled` is `false`).
