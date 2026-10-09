// System-owner tools. Usage:
//   node server/cli.mjs grant-admin <email>
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createService } from '../js/core/service.js';
import { createFileStore } from './file-store.mjs';
import { hasher } from './auth.mjs';
import { loadAppData } from './app.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [command, email] = process.argv.slice(2);
const data = loadAppData(root);
const store = createFileStore(process.env.DATA_FILE || resolve(root, 'server/data/db.json'));
const service = createService({ store, hasher, randomId: randomUUID, config: data.config, plans: data.plans, rules: data.rules, specialties: data.specialties });

if (command === 'grant-admin' && email) {
  const user = service.grantAdmin(email);
  console.log(`Admin rights granted to ${user.email}`);
} else {
  console.log('Usage: node server/cli.mjs grant-admin <email>');
  process.exit(1);
}
