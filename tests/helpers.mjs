import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

export function readJson(path) {
  return JSON.parse(read(path));
}

export function listFiles(dir, skip = ['.git', 'node_modules']) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    if (skip.includes(name)) continue;
    const full = join(ROOT, dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(relative(ROOT, full), skip));
    else out.push(relative(ROOT, full).split('\\').join('/'));
  }
  return out;
}
