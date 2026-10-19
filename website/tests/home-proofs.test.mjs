// Garde-fou de la section « Déjà vu sur le terrain » de l'accueil.
//
// Deux règles tenues à la main jusqu'ici, qu'un simple changement de feuille de style ou de
// dictionnaire peut casser sans que rien ne le signale :
//
// 1. Chaque travail de terrain est rattaché à un niveau de service nommé, et ce nom est bien
//    celui de la page Services (sinon le lien « Voir le niveau » ment).
// 2. Aucune classe d'élément nue ne porte de décoration de carte : c'est ce qui a rendu le
//    texte « Pour le dirigeant… » illisible dans le panneau sombre des services (règle .who
//    globale héritée des cartes « qui / pas qui »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** Bloc `proofs: { … }` d'un dictionnaire, jusqu'à la clé suivante de même niveau. */
function proofsBlock(lang) {
  const text = read(`src/i18n/${lang}/home.ts`);
  const start = text.indexOf('proofs: {');
  assert.ok(start > 0, `${lang}/home.ts : bloc proofs introuvable`);
  const end = text.indexOf('\n  products: {', start);
  assert.ok(end > start, `${lang}/home.ts : fin du bloc proofs introuvable`);
  return text.slice(start, end);
}

function servicesNames(lang) {
  const text = read(`src/i18n/${lang}/services.ts`);
  return [...text.matchAll(/^\s{6}name: '([^']+)'/gm)].map((m) => m[1]);
}

test('chaque preuve de l’accueil pointe un niveau de service qui existe', () => {
  for (const lang of ['fr', 'en']) {
    const block = proofsBlock(lang);
    const names = servicesNames(lang);
    assert.equal(names.length, 3, `${lang}/services.ts : trois niveaux attendus, reçu ${names.length}`);

    const levels = [...block.matchAll(/^ {8}level: (\d),$/gm)].map((m) => Number(m[1]));
    const labels = [...block.matchAll(/^ {8}levelName: '([^']+)',$/gm)].map((m) => m[1]);
    assert.equal(levels.length, 2, `${lang}/home.ts : deux travaux attendus, reçu ${levels.length}`);
    assert.equal(labels.length, levels.length, `${lang}/home.ts : levelName manquant`);

    levels.forEach((level, i) => {
      assert.ok(level >= 1 && level <= names.length, `${lang}/home.ts : niveau ${level} hors bornes`);
      assert.equal(
        labels[i],
        names[level - 1],
        `${lang}/home.ts : « ${labels[i]} » ne correspond pas au niveau ${level} (${names[level - 1]})`,
      );
    });

    // Chaque travail dit ce qu'il prouve : c'est la demande, pas un ornement.
    const proves = [...block.matchAll(/^ {8}proves: /gm)].length;
    assert.equal(proves, 2, `${lang}/home.ts : chaque travail doit porter un « proves »`);
  }
});

test('les logos des preuves sont livrés avec le site', () => {
  for (const lang of ['fr', 'en']) {
    const block = proofsBlock(lang);
    const logos = [...block.matchAll(/^ {8}logo: '([^']+)',$/gm)].map((m) => m[1]);
    for (const logo of logos) {
      assert.ok(logo.startsWith('/'), `${lang}/home.ts : ${logo} doit être un chemin public`);
      assert.ok(existsSync(join(root, 'public', logo)), `${lang}/home.ts : ${logo} absent de public/`);
    }
    // Le travail sans logo doit au moins porter son nom en toutes lettres.
    const wordmarks = [...block.matchAll(/^ {8}wordmark: '([^']+)',$/gm)].map((m) => m[1]);
    assert.equal(logos.length + wordmarks.length, 2, `${lang}/home.ts : chaque travail a un logo ou un nom`);
  }
});

test('les styles de carte ne s’appliquent pas à une classe nue', () => {
  const css = read('src/styles/global.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) =>
    m[1].split(',').map((s) => s.trim()),
  );
  assert.ok(
    !selectors.includes('.who'),
    '.who : règle globale interdite, la carte doit être portée par son conteneur (.who-grid .who)',
  );
  // Le texte du panneau sombre des services garde sa couleur de lecture.
  assert.match(
    read('src/styles/global.css'),
    /\.panel \.who \{[^}]*color: var\(--on-panel2\)/,
    '.panel .who doit rester lisible sur le panneau sombre',
  );
});
