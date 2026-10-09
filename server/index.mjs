// Entry point: `npm start`. Environment:
//   PORT (default 8080), DATA_FILE (default server/data/db.json),
//   ANTHROPIC_API_KEY (server only), COOKIE_SECURE=1 behind HTTPS,
//   TRUST_PROXY=1 behind a reverse proxy.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { createFileStore } from './file-store.mjs';
import { createAnthropicClient } from './ai.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataFile = process.env.DATA_FILE || resolve(root, 'server/data/db.json');
const port = Number(process.env.PORT || 8080);

const aiClient = createAnthropicClient();
const { handler } = createApp({
  root,
  store: createFileStore(dataFile),
  aiClient,
  secureCookies: process.env.COOKIE_SECURE === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
});

createServer(handler).listen(port, () => {
  console.log(`Doctor Assistant: http://localhost:${port}`);
  console.log(aiClient ? 'AI proxy: enabled' : 'AI proxy: ANTHROPIC_API_KEY not set, AI requests return aiUnavailable');
});
