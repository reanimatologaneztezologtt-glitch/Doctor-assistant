// Builds dist/doctor-assistant.html: the whole site in one file that opens
// without a server or internet (double-click). It runs in demo mode: accounts
// and logs stay in that browser; the AI assistant is not available offline.
// Run: npm run build:standalone
import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((name) => {
  const rel = `${dir}/${name}`;
  return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
});

// Files the app fetches at runtime are embedded and served by a fetch shim.
const embedded = {};
for (const f of [...walk('data'), ...walk('assets/diagrams'), 'config/app.json']) {
  if (f.endsWith('.json') || f.endsWith('.svg')) embedded[f] = read(f);
}

const bundle = await build({
  entryPoints: [join(ROOT, 'js/app.js')],
  bundle: true,
  format: 'iife',
  write: false,
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});
// Icons: reference the inline sprite instead of the external file.
const appJs = bundle.outputFiles[0].text.replaceAll('assets/icons/sprite.svg#', '#');

const shim = `(() => {
  const files = ${JSON.stringify(embedded).replace(/</g, '\\u003c')};
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = url.replace(/^\\.?\\//, '').split('?')[0];
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      const type = path.endsWith('.svg') ? 'image/svg+xml' : 'application/json';
      return new Response(files[path], { status: 200, headers: { 'Content-Type': type } });
    }
    if (!/^[a-z]+:/i.test(url) || url.startsWith('file:')) return new Response('{}', { status: 404 });
    return realFetch ? realFetch(input, init) : new Response('{}', { status: 404 });
  };
})();`;

const html = read('index.html');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replaceAll('assets/icons/sprite.svg#', '#');
const sprite = read('assets/icons/sprite.svg').replace('<svg xmlns="http://www.w3.org/2000/svg">', '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">');
const icon = `data:image/svg+xml;base64,${Buffer.from(read('assets/icons/app-icon.svg')).toString('base64')}`;
const keepMeta = head.split('\n').filter((l) => /<meta (charset|name="viewport"|name="referrer"|name="theme-color")/.test(l)).join('\n');

// No network at all: every resource is inline.
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";
const out = `<!doctype html>
<html lang="uz-Cyrl">
<head>
${keepMeta}
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Шифокор ёрдамчиси</title>
<link rel="icon" href="${icon}">
<style>${read('css/tokens.css')}\n${read('css/base.css')}</style>
<script>${read('js/theme-init.js')}</script>
</head>
<body>
${sprite}
${body.trim()}
<script>${shim}</script>
<script>${appJs}</script>
</body>
</html>
`;
mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/doctor-assistant.html'), out);
console.log(`dist/doctor-assistant.html ${(out.length / 1024).toFixed(0)} KB`);
