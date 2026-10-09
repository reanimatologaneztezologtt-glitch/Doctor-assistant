// JSON file persistence for js/core/store.js. Atomic write via rename.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createStore } from '../js/core/store.js';

export function createFileStore(file) {
  let initial = {};
  try {
    initial = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    initial = {};
  }
  mkdirSync(dirname(file), { recursive: true });
  return createStore(initial, (snapshot) => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot, null, 1));
    renameSync(tmp, file);
  });
}
