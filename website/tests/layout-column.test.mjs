// Garde-fou du gabarit : l'image de couverture d'un article donne la largeur, le titre, le
// surtitre, le texte et les schémas s'y alignent (voir src/styles/blog.css et global.css).
//
// Ce contrôle lit les feuilles de style : il ne mesure pas de pixels, il vérifie que rien ne
// peut de nouveau plafonner la colonne. La mesure géométrique, elle, se fait dans un navigateur
// (les quatre largeurs 1440 / 1024 / 768 / 390) et n'a pas sa place dans `npm test`.
//
// Il vérifie aussi deux règles de contenu tenues à la main jusqu'ici : plus d'image matricielle
// dans le corps d'un billet, et chaque schéma déclaré dans un fichier de données.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** Découpe une feuille de style en [sélecteur, déclarations]. Les règles imbriquées dans un
 *  @media sont rendues à plat : un plafond caché dans une requête de média compte aussi. */
export function rules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push([m[1].trim().replace(/\s+/g, ' '), m[2]]);
  }
  return out;
}

/** Valeur d'une propriété pour les règles qui visent exactement `needle` (un sélecteur de la
 *  liste suffit). `prefix: true` accepte aussi les sélecteurs qui commencent par `needle`. */
export function declaredValues(css, needle, prop, { prefix = false } = {}) {
  const values = [];
  for (const [selector, body] of rules(css)) {
    const hit = selector.split(',').some((s) => (prefix ? s.trim().startsWith(needle) : s.trim() === needle));
    if (!hit) continue;
    for (const decl of body.split(';')) {
      const [name, value] = decl.split(':');
      if (name && value && name.trim() === prop) values.push(value.trim());
    }
  }
  return values;
}

const blog = read('src/styles/blog.css');
const site = read('src/styles/global.css');

// Largeurs qui ne plafonnent pas (le plafond du conteneur suffit).
const OPEN = new Set(['none', '100%', 'auto']);

test('l’article prend la largeur de l’image de couverture', () => {
  const header = [
    ['titre', '.post-head h1'],
    ['surtitre', '.post-standfirst'],
    ['corps', '.post-body .prose'],
  ];
  for (const [label, selector] of header) {
    const caps = declaredValues(blog, selector, 'max-width').filter((v) => !OPEN.has(v));
    assert.deepEqual(caps, [], `${label} : ${selector} ne doit pas avoir de plafond propre (${caps.join(', ')})`);
  }

  for (const selector of ['.post-body .prose > .dg', '.post-body .prose > .pm']) {
    const widths = declaredValues(blog, selector, 'width');
    assert.ok(widths.includes('100%'), `${selector} doit prendre toute la colonne`);
    const caps = declaredValues(blog, selector, 'max-width').filter((v) => !OPEN.has(v));
    assert.deepEqual(caps, [], `${selector} ne doit pas avoir de plafond propre`);
  }

  // La colonne de gauche est fluide : un px ou un rem figé la découplerait de l'image.
  // (La variante sans sommaire, .post-layout-solo, garde une colonne centrée : l'image y est
  // toujours aussi large que le texte.)
  const base = rules(blog).find(([selector]) => selector.trim() === '.post-layout');
  assert.ok(base, 'la règle .post-layout doit exister');
  const columns = /grid-template-columns\s*:\s*([^;]+)/.exec(base[1]);
  assert.ok(columns, '.post-layout doit déclarer sa grille');
  assert.ok(
    /minmax\(0,\s*1fr\)\s+/.test(columns[1]),
    `.post-layout : première colonne fluide attendue, reçu « ${columns[1].trim()} »`,
  );

  // L'image de couverture est le repère : elle occupe la colonne entière.
  assert.ok(declaredValues(blog, '.post-img', 'width').includes('100%'), '.post-img doit occuper la colonne');
});

test('les pages du site tiennent le même gabarit', () => {
  const shared = [
    ['.hero .lead', 'texte d’accroche de l’accueil'],
    ['.filmwrap', 'film de l’accueil'],
    ['.page-head h1', 'titre des pages intérieures'],
  ];
  for (const [selector, label] of shared) {
    const caps = declaredValues(site, selector, 'max-width').filter((v) => !OPEN.has(v));
    assert.deepEqual(caps, [], `${label} : ${selector} ne doit pas avoir de plafond propre (${caps.join(', ')})`);
  }
  // Le bloc légal reprend la largeur du conteneur .wrap, sans plafond à lui
  // (ses règles internes, .legal p ou .legal h2, gardent la leur).
  assert.deepEqual(declaredValues(site, '.legal', 'max-width'), [], '.legal ne doit pas plafonner sa largeur');
});

test('aucune image matricielle dans le corps des billets', () => {
  const dir = join(root, 'src/content/blog');
  for (const lang of readdirSync(dir)) {
    const dirLang = join(dir, lang);
    for (const file of readdirSync(dirLang)) {
      const body = readFileSync(join(dirLang, file), 'utf8').split(/^---$/m).slice(2).join('---');
      for (const pattern of [/!\s*\[[^\]]*\]\([^)]+\)/, /<img\b/, /<Figure\b/, /\.(webp|jpg|jpeg|png)\)/]) {
        assert.ok(!pattern.test(body), `${lang}/${file} : image dans le corps (${pattern}) — utiliser un schéma`);
      }
    }
  }
});

test('les schémas des billets sont déclarés dans un fichier de données', () => {
  const dir = join(root, 'src/content/blog');
  for (const lang of readdirSync(dir)) {
    for (const file of readdirSync(join(dir, lang))) {
      const text = readFileSync(join(dir, lang, file), 'utf8');
      for (const m of text.matchAll(/<Diagram\s*\{\.\.\.(\w+)\}/g)) {
        const imported = new RegExp(`import\\s*\\{[^}]*\\b${m[1]}\\b[^}]*\\}\\s*from\\s*'@/components/docs/diagrams/`).test(text);
        assert.ok(imported, `${lang}/${file} : ${m[1]} utilisé sans import depuis components/docs/diagrams`);
      }
    }
  }
});
