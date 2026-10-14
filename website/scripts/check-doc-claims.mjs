// Garde-fou : vérifie que le code de seshat-runtime dit encore ce que la documentation affirme.
// Usage : npm run check:claims [-- --runtime <dossier de seshat-runtime>]
//
// scripts/doc-claims.json liste des affirmations de la documentation, chacune avec le fichier du runtime qui
// la prouve et un motif. Si le motif n'est plus dans le fichier, le comportement a changé : la page citée
// est peut-être fausse. On relit la page, on la corrige, puis on met l'entrée à jour.
//
// Ce que le script ne fait PAS : il ne trouve pas un comportement que personne n'a listé. Chaque fois
// qu'une page est corrigée contre le code, ajouter ici l'affirmation qui compte.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const ri = args.indexOf('--runtime');
const runtime = resolve(ri >= 0 ? args[ri + 1] : process.env.SESHAT_RUNTIME_DIR ?? '../../seshat-runtime');
if (!existsSync(join(runtime, 'go.mod'))) { console.error(`seshat-runtime est introuvable : ${runtime}`); process.exit(2); }

const { claims } = JSON.parse(readFileSync('scripts/doc-claims.json', 'utf8'));
const docs = resolve('src/content/docs/en');
const cache = new Map();
const read = (f) => {
  if (!cache.has(f)) cache.set(f, existsSync(join(runtime, f)) ? readFileSync(join(runtime, f), 'utf8').replace(/\r\n/g, '\n') : null);
  return cache.get(f);
};

const failures = [];
for (const c of claims) {
  const text = read(c.file);
  let problem = null;
  if (text === null) problem = `le fichier ${c.file} n'existe plus`;
  else if (c.match !== undefined && !new RegExp(c.match).test(text)) problem = `motif absent de ${c.file}`;
  else if (c.absent !== undefined && new RegExp(c.absent).test(text)) problem = `motif interdit présent dans ${c.file}`;
  else if (c.count) {
    const n = (text.match(new RegExp(c.count.pattern, c.count.flags ?? 'g')) ?? []).length;
    if (n !== c.count.n) problem = `${n} occurrence(s) dans ${c.file}, ${c.count.n} attendue(s)`;
  }
  for (const p of c.pages) if (!existsSync(join(docs, p))) problem = (problem ? problem + ' ; ' : '') + `la page ${p} n'existe plus`;
  if (problem) failures.push({ c, problem });
}

for (const { c, problem } of failures) {
  console.error(`[${c.id}] ${c.claim}\n    ${problem}\n    pages à relire : ${c.pages.join(', ')}`);
}
console.log(`${claims.length} affirmations vérifiées, ${failures.length} qui ne correspondent plus au code.`);
process.exit(failures.length ? 1 : 0);
