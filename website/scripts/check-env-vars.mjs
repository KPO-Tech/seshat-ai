// Vérifie que chaque variable d'environnement citée dans reference/environment-variables.mdx
// apparaît dans le code de seshat-runtime (entre guillemets, dans un fichier .go hors tests).
// Usage : npm run check:env [-- --runtime <dossier de seshat-runtime>]
//
// Échoue si une variable de la page n'existe plus dans le code. Elle ne dit pas quelles variables du code
// manquent à la page : certaines sont volontairement omises (déboguage, variables du système).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const ri = args.indexOf('--runtime');
const runtime = resolve(ri >= 0 ? args[ri + 1] : process.env.SESHAT_RUNTIME_DIR ?? '../../seshat-runtime');
const page = resolve('src/content/docs/en/reference/environment-variables.mdx');
if (!existsSync(join(runtime, 'go.mod'))) { console.error(`seshat-runtime est introuvable : ${runtime}`); process.exit(2); }

function* goFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* goFiles(p);
    else if (e.name.endsWith('.go') && !e.name.endsWith('_test.go')) yield p;
  }
}

const doc = readFileSync(page, 'utf8');
const names = new Set();
for (const line of doc.split('\n')) {
  if (!line.startsWith('| `')) continue;
  for (const m of line.split('|')[1].matchAll(/`([A-Z][A-Z0-9_]+)`/g)) names.add(m[1]);
}

const found = new Set();
for (const file of goFiles(runtime)) {
  const text = readFileSync(file, 'utf8');
  for (const n of names) if (!found.has(n) && text.includes(`"${n}"`)) found.add(n);
  if (found.size === names.size) break;
}

const missing = [...names].filter((n) => !found.has(n));
for (const n of missing) console.error(`absente du code : ${n}`);
console.log(`${names.size} variables sur la page, ${missing.length} absente(s) du code.`);
process.exit(missing.length ? 1 : 0);
