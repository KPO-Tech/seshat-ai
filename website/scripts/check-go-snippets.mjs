// Compile les extraits Go de la documentation contre le code de seshat-runtime.
// Usage : npm run check:snippets [-- --runtime <dossier de seshat-runtime>] [--keep]
//
// Chaque bloc ```go de src/content/docs/en/** est enveloppé dans un petit programme, écrit dans
// <seshat-runtime>/.tmp_docs_check/ (un dossier qui commence par un point est ignoré par ./... et
// n'entre pas dans le module), puis passé à `go vet`. Le script échoue si un identifiant du SDK n'existe
// plus ou si un appel ne respecte plus la signature (par exemple RegisterHook qui renvoie deux valeurs).
//
// Ce qui n'est PAS vérifié : les helpers de l'exemple (overBudget, askUser...), les variables inutilisées
// et les imports inutilisés. Un bloc qui contient « ... » ou « … » (un morceau volontairement incomplet)
// est ignoré.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const keep = args.includes('--keep');
const runtime = resolve(opt('--runtime') ?? process.env.SESHAT_RUNTIME_DIR ?? '../../seshat-runtime');
const docsDir = resolve('src/content/docs/en');
const MODULE = 'github.com/KPO-Tech/seshat-runtime';
const NL = '\n';
const TAB = '\t';

if (!existsSync(join(runtime, 'go.mod'))) {
  console.error(`seshat-runtime est introuvable : ${runtime}${NL}Indiquez-le avec --runtime <dossier> ou SESHAT_RUNTIME_DIR.`);
  process.exit(2);
}

// Nom utilisé dans l'extrait -> chemin d'import.
const IMPORTS = {
  context: 'context', fmt: 'fmt', log: 'log', os: 'os', time: 'time', errors: 'errors', strings: 'strings', io: 'io',
  json: 'encoding/json', http: 'net/http', sync: 'sync', slog: 'log/slog',
  sdk: `${MODULE}/pkg/sdk`, mcp: `${MODULE}/pkg/mcp`, skills: `${MODULE}/pkg/skills`, rag: `${MODULE}/pkg/rag`,
  types: `${MODULE}/pkg/types`, monitoring: `${MODULE}/pkg/monitoring`, netdiag: `${MODULE}/pkg/netdiag`, workflow: `${MODULE}/pkg/workflow`, config: `${MODULE}/pkg/config`,
};

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.mdx?$/.test(e.name) ? [p] : [];
  });
}

const blocks = [];
for (const file of walk(docsDir)) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, NL);
  const re = /^```go\n([\s\S]*?)^```$/gm;
  let m;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split(NL).length + 1;
    blocks.push({ file: relative(docsDir, file).replace(/\\/g, '/'), line, code: m[1] });
  }
}

// Sépare un bloc en déclarations de premier niveau et instructions. Une instruction est une ligne à la
// colonne 0, hors d'une déclaration ; les instructions vont dans main().
function split(src) {
  const decls = [];
  const stmts = [];
  let depth = 0;
  let inDecl = false;
  for (const l of src.split(NL)) {
    if (depth === 0 && /^(func|type|var|const) /.test(l)) inDecl = true;
    const isStmt = !inDecl && depth === 0 && /^\S/.test(l) && !/^(\/\/|[})])/.test(l);
    (isStmt || (!inDecl && stmts.length) ? stmts : decls).push(l);
    const bare = l.replace(/"(?:[^"\\]|\\.)*"|`[^`]*`|'(?:[^'\\]|\\.)'/g, '');
    for (const ch of bare) { if (ch === '{' || ch === '(') depth++; else if (ch === '}' || ch === ')') depth--; }
    if (inDecl && depth === 0 && !/[{(,]$/.test(l.trim())) inDecl = false;
  }
  return { decls: decls.join(NL), stmts: stmts.join(NL) };
}

function wrap(code, prior = '') {
  const importsDeclared = [];
  const body = [];
  let inImport = false;
  for (const l of code.split(NL)) {
    if (inImport) { if (l.trim() === ')') inImport = false; else importsDeclared.push(l.trim()); continue; }
    if (/^import \($/.test(l)) { inImport = true; continue; }
    const one = l.match(/^import (?:(\w+) )?("[^"]+")$/);
    if (one) { importsDeclared.push(`${one[1] ?? ''} ${one[2]}`.trim()); continue; }
    body.push(l);
  }
  const src = body.join(NL);
  if (/^package /m.test(src)) return src;
  const { decls, stmts } = split(src);
  // Un bloc sans déclaration réutilise celles des blocs précédents du même fichier (un type défini plus haut).
  const allDecls = decls.trim() ? decls : prior;
  const full = allDecls + NL + stmts;
  const quoted = (n) => `"${IMPORTS[n]}"`;
  const used = Object.keys(IMPORTS).filter((n) => new RegExp(`\\b${n}\\.`).test(full) && !importsDeclared.some((i) => i.endsWith(quoted(n))));
  // Variables que les extraits supposent déjà déclarées.
  const needPrelude = /\b(ctx|client|session|cfg)\b/.test(full);
  const all = [...new Set([...importsDeclared, ...used.map(quoted), ...(needPrelude ? [quoted('context'), quoted('sdk')] : [])])];
  const head = ['package main', '', 'import (', ...all.map((i) => TAB + i), ')', ''].join(NL);
  const prelude = needPrelude
    ? ['var (', `${TAB}ctx     = context.Background()`, `${TAB}client  *sdk.Client`, `${TAB}session *sdk.Session`, `${TAB}cfg     *sdk.ClientConfig`, ')', '', 'var _, _, _, _ = ctx, client, session, cfg', ''].join(NL)
    : '';
  // Un programme complet déclare déjà son main.
  const ownMain = /^func main\(/m.test(allDecls);
  return [head, prelude, allDecls, '', ...(ownMain ? [] : ['func main() {', stmts, '}']), ''].join(NL);
}

const work = join(runtime, '.tmp_docs_check');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const checked = [];
const priorDecls = new Map();
let skipped = 0;
blocks.forEach((b, i) => {
  if (/\.\.\.|…/.test(b.code)) { skipped++; return; }
  const dir = `b${String(i).padStart(3, '0')}`;
  mkdirSync(join(work, dir));
  const prior = priorDecls.get(b.file) ?? '';
  writeFileSync(join(work, dir, 'main.go'), wrap(b.code, prior));
  const own = split(b.code).decls;
  if (own.trim()) priorDecls.set(b.file, `${prior}${NL}${own}`);
  checked.push({ ...b, dir });
});

const targets = checked.map((c) => `./.tmp_docs_check/${c.dir}`);
const run = spawnSync('go', ['vet', ...targets], { cwd: runtime, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;

// Erreurs qui ne disent rien de la documentation : variables et imports inutilisés, helpers de l'exemple.
const harmless = [/declared and not used/, /imported and not used/, /^# /, /^vet: /, /undefined: \w+$/];
const problems = [];
for (const raw of out.split(NL)) {
  const line = raw.trim();
  if (!line) continue;
  const m = line.match(/\.tmp_docs_check[\\/](b\d+)[\\/]main\.go:(\d+):\d+: (.*)$/);
  if (!m) { if (!harmless.some((h) => h.test(line))) problems.push({ dir: null, msg: line }); continue; }
  if (harmless.some((h) => h.test(m[3]))) continue;
  problems.push({ dir: m[1], msg: m[3] });
}

if (!keep) rmSync(work, { recursive: true, force: true });

for (const p of problems) {
  const b = checked.find((c) => c.dir === p.dir);
  console.error(`${b ? `${b.file}:${b.line}` : 'go vet'}  ${p.msg}`);
}
console.log(`${checked.length} extraits Go vérifiés, ${skipped} ignorés (« ... »), ${problems.length} erreur(s).`);
process.exit(problems.length ? 1 : 0);
