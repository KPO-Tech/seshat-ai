// Vérifie que reference/client-config.mdx décrit exactement les champs de sdk.ClientConfig.
// Usage : npm run check:config [-- --runtime <dossier de seshat-runtime>]
//
// Échoue si un champ de la structure n'est pas dans la page (il faut le documenter), ou si la page cite un
// champ qui n'existe plus (il faut le retirer). La page reste écrite à la main : ce script ne contrôle
// que la liste des champs, pas leur description.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const i = args.indexOf('--runtime');
const runtime = resolve(i >= 0 ? args[i + 1] : process.env.SESHAT_RUNTIME_DIR ?? '../../seshat-runtime');
const source = join(runtime, 'pkg/sdk/client_config.go');
const page = resolve('src/content/docs/en/reference/client-config.mdx');
if (!existsSync(source)) { console.error(`introuvable : ${source}\nIndiquez le dossier avec --runtime ou SESHAT_RUNTIME_DIR.`); process.exit(2); }

const go = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
const start = go.indexOf('type ClientConfig struct {');
const end = go.indexOf('\n}\n', start);
const fields = new Set();
for (const line of go.slice(start, end).split('\n').slice(1)) {
  const m = line.match(/^\t([A-Z]\w*)\s+\S/);
  if (m) fields.add(m[1]);
}

const doc = readFileSync(page, 'utf8').replace(/\r\n/g, '\n');
const documented = new Set();
for (const line of doc.split('\n')) {
  if (!line.startsWith('| `')) continue;
  const first = line.split('|')[1];
  for (const m of first.matchAll(/`([A-Z]\w*)`/g)) documented.add(m[1]);
}

const missing = [...fields].filter((f) => !documented.has(f));
const ghosts = [...documented].filter((f) => !fields.has(f));
for (const f of missing) console.error(`manque dans la page : ${f}`);
for (const f of ghosts) console.error(`n'existe plus dans ClientConfig : ${f}`);
console.log(`${fields.size} champs dans ClientConfig, ${documented.size} dans la page, ${missing.length} manquant(s), ${ghosts.length} en trop.`);
process.exit(missing.length || ghosts.length ? 1 : 0);
