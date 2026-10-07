// Audit SEO statique du site compilé (dossier dist/). Usage : npm run build && npm run seo:audit
// Vérifie, page par page : titre, description, h1, canonical, hreflang réciproque, balises sociales,
// données structurées valides, images sans texte alternatif, liens internes cassés, doublons.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SITE = 'https://seshat-ai.com';

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dist).filter((f) => f.endsWith('.html') && !f.includes(`${sep}pagefind${sep}`));
const pages = new Map();
for (const f of files) {
  let path = '/' + relative(dist, f).split(sep).join('/').replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '');
  if (path === '/') path = '/';
  pages.set(path, readFileSync(f, 'utf8'));
}
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) ?? [])[1];
const metas = (html) => [...html.matchAll(/<meta\s[^>]*>/g)].map((m) => m[0]);
const metaContent = (html, key, val) => attr(metas(html).find((m) => attr(m, key) === val) ?? '', 'content');

const issues = [];
const titles = new Map(), descs = new Map();
const add = (level, path, msg) => issues.push({ level, path, msg });

for (const [path, html] of pages) {
  if (path === '/404') continue;
  const title = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? '';
  const desc = metaContent(html, 'name', 'description') ?? '';
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  const canonical = attr((html.match(/<link rel="canonical"[^>]*>/) ?? [''])[0], 'href');
  const noindex = /content="noindex/.test(html);
  if (!title) add('error', path, 'titre manquant');
  else if (title.length > 65) add('warn', path, `titre long (${title.length}) : ${title}`);
  if (!desc) add('error', path, 'description manquante');
  else if (desc.length < 70 || desc.length > 165) add('warn', path, `description de ${desc.length} caractères`);
  if (h1 !== 1) add('error', path, `${h1} balises h1`);
  if (!canonical) add('error', path, 'canonical manquant');
  else if (canonical !== SITE + (path === '/' ? '/' : path)) add('error', path, `canonical inattendu : ${canonical}`);
  if (!/<html lang="[a-z-]+"/.test(html)) add('error', path, 'attribut lang manquant');
  if (!noindex) {
    for (const k of ['og:title', 'og:description', 'og:image', 'og:url']) if (!metaContent(html, 'property', k)) add('error', path, `${k} manquant`);
    if (!metaContent(html, 'name', 'twitter:card')) add('error', path, 'twitter:card manquant');
  }
  for (const img of html.match(/<img\s[^>]*>/g) ?? []) if (attr(img, 'alt') === undefined) add('error', path, `image sans alt : ${attr(img, 'src')}`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { add('error', path, 'JSON-LD invalide'); }
  }
  // hreflang réciproque
  for (const l of html.match(/<link rel="alternate" hreflang="[^"]+"[^>]*>/g) ?? []) {
    const href = attr(l, 'href');
    const target = href.replace(SITE, '') || '/';
    const back = pages.get(target.replace(/(.)\/$/, '$1'));
    if (!back) add('error', path, `hreflang vers une page absente : ${href}`);
    else if (!back.includes(`href="${SITE}${path === '/' ? '/' : path}"`)) add('warn', path, `hreflang non réciproque : ${href}`);
  }
  // liens internes
  for (const m of html.matchAll(/href="(\/[^"#?]*)(#[^"]*)?"/g)) {
    const p = m[1].replace(/(.)\/$/, '$1');
    if (/^\/(_astro|pagefind|brand|captures|videos|og|favicon|apple-touch|sitemap|robots|llms)/.test(p)) continue;
    if (/\.xml$/.test(p)) continue;
    const target = pages.get(p);
    if (!target) add('error', path, `lien cassé : ${m[1]}`);
    else if (m[2] && !target.includes(`id="${m[2].slice(1)}"`)) add('warn', path, `ancre absente : ${m[1]}${m[2]}`);
  }
  if (!noindex) {
    titles.set(title, [...(titles.get(title) ?? []), path]);
    descs.set(desc, [...(descs.get(desc) ?? []), path]);
  }
}
for (const [t, ps] of titles) if (ps.length > 1) add('warn', ps.join(', '), `titre en double : ${t}`);
for (const [d, ps] of descs) if (ps.length > 1) add('warn', ps.join(', '), `description en double : ${d.slice(0, 60)}`);

const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');
for (const i of [...errors, ...warns]) console.log(`${i.level === 'error' ? 'ERREUR' : 'alerte'}  ${i.path}  ${i.msg}`);
console.log(`\n${pages.size} pages, ${errors.length} erreurs, ${warns.length} alertes`);
process.exit(errors.length ? 1 : 0);
