// Tests de la logique de garde du formulaire de contact : `npm test`.
// Couvre ce qui protège l'endpoint sans serveur ni réseau : nettoyage, validation, contrôle de même
// origine, heuristiques et empreintes. Les couches Cloudflare (Turnstile, quotas KV) se testent
// séparément, avec `npx wrangler pages dev dist --kv CONTACT_GUARD` et une clé de test Turnstile.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYS,
  LIMITS,
  MAX_LINKS,
  MIN_MESSAGE,
  RATES,
  cleanLine,
  cleanMessage,
  emailKey,
  fingerprint,
  isDuplicate,
  isEmail,
  isSameOrigin,
  quotaExceeded,
  recordAccepted,
  sha256Hex,
  spamReason,
} from '../functions/api/_guard.mjs';

/** Remplace le namespace KV : mêmes get/put, en mémoire, avec les écritures gardées pour les vérifier. */
function fakeStore() {
  const data = new Map();
  const writes = [];
  return {
    data,
    writes,
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async put(key, value, options) {
      data.set(key, value);
      writes.push({ key, value, options });
    },
  };
}

test('cleanLine retire de quoi injecter un en-tête ou tromper la lecture', () => {
  // Un retour chariot dans le nom servirait à ajouter une ligne aux en-têtes du courriel.
  assert.equal(cleanLine('Robert\r\nBcc : autre@example.com', 120), 'Robert Bcc : autre@example.com');
  // Caractères invisibles (zéro-largeur) et de contrôle.
  assert.equal(cleanLine('Ro\u200bbert\u0000flece', 120), 'Robertflece');
  // Unicode normalisé : les équivalents composés/ décomposés donnent le même texte.
  assert.equal(cleanLine('  Jos\u0065\u0301  ', 120), 'José');
  // Borne de longueur.
  assert.equal(cleanLine('x'.repeat(500), 10), 'x'.repeat(10));
});

test('cleanLine ignore tout ce qui n’est pas du texte', () => {
  // Un fichier envoyé dans un champ texte ne doit pas produire un faux nom valide.
  assert.equal(cleanLine(new File(['contenu'], 'pièce.txt'), 120), '');
  assert.equal(cleanLine(null, 120), '');
  assert.equal(cleanLine(undefined, 120), '');
});

test('cleanMessage garde les retours à la ligne légitimes', () => {
  assert.equal(cleanMessage('Première ligne\r\nSeconde ligne'), 'Première ligne\nSeconde ligne');
  assert.equal(cleanMessage('a\u200bb\u2060c'), 'abc');
  assert.equal(cleanMessage('x'.repeat(LIMITS.message + 500)).length, LIMITS.message);
  assert.equal(cleanMessage(''), '');
});

test('isEmail accepte une adresse plausible et refuse le reste', () => {
  assert.equal(isEmail('robert.flece@example.com'), true);
  assert.equal(isEmail('a+tag@sub.example.co'), true);
  assert.equal(isEmail('robert flece@example.com'), false);
  assert.equal(isEmail('robert@example'), false);
  assert.equal(isEmail('robert@@example.com'), false);
  assert.equal(isEmail(''), false);
  assert.equal(isEmail('a@' + 'b'.repeat(LIMITS.email) + '.com'), false);
});

test('isSameOrigin n’accepte que le site lui-même', () => {
  const self = 'https://seshat-ai.com';
  assert.equal(isSameOrigin({ origin: self, referer: undefined, self }), true);
  // Certains navigateurs n'envoient que Referer : on l'accepte.
  assert.equal(isSameOrigin({ origin: undefined, referer: `${self}/contact`, self }), true);
  // Un script qui appelle l'endpoint en direct n'a ni l'un ni l'autre.
  assert.equal(isSameOrigin({ origin: undefined, referer: undefined, self }), false);
  assert.equal(isSameOrigin({ origin: 'https://spam.example', referer: 'https://spam.example/x', self }), false);
  assert.equal(isSameOrigin({ origin: 'null', referer: undefined, self }), false);
  assert.equal(isSameOrigin({ origin: 'pas une url', referer: undefined, self }), false);
  // Une préversion Pages est une autre origine : elle reste servie par son propre domaine.
  assert.equal(isSameOrigin({ origin: 'https://abc123.seshat-ai.pages.dev', referer: undefined, self: 'https://abc123.seshat-ai.pages.dev' }), true);
});

test('spamReason ne refuse que le robot évident', () => {
  assert.equal(spamReason('Bonjour, je voulais connaître votre prix.'), null);
  // Un message très court n'est pas une demande : on refuse.
  assert.equal(spamReason('ok'), 'too_short');
  assert.equal(spamReason('x'.repeat(MIN_MESSAGE - 1)), 'too_short');
  assert.equal(spamReason('x'.repeat(MIN_MESSAGE)), null);
  // Quelques liens restent acceptables : un prospect peut citer une page.
  assert.equal(spamReason('Voir ' + 'https://example.com '.repeat(MAX_LINKS)), null);
  assert.equal(spamReason('Voir ' + 'https://example.com '.repeat(MAX_LINKS + 1)), 'too_many_links');
  assert.equal(spamReason('www.achat-en-ligne.example ' + 'www.b.example '.repeat(MAX_LINKS)), 'too_many_links');
  // Une langue étrangère n'est jamais un motif de refus.
  assert.equal(spamReason('হাই, আমি আপনার মূল্য জানতে চেয়েছিলাম।'), null);
});

test('sha256Hex et les empreintes sont stables', async () => {
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal((await sha256Hex('Seshat')).length, 64);

  const a = await fingerprint('Robert@Example.com', 'Bonjour,\nje vous écris.');
  const b = await fingerprint('robert@example.com', '  bonjour,   je vous écris.  ');
  assert.equal(a, b, 'même adresse et même texte : même empreinte');
  assert.notEqual(a, await fingerprint('autre@example.com', 'Bonjour,\nje vous écris.'));
  assert.notEqual(a, await fingerprint('robert@example.com', 'Bonjour, je vous écris autrement.'));

  // Les clés ne contiennent jamais l'adresse en clair.
  const key = await emailKey('Robert@Example.com');
  assert.equal(key, await emailKey('  robert@example.com '));
  assert.equal(key.includes('robert'), false);
});

test('les quotas comptent les envois acceptés et posent les bonnes fenêtres', async () => {
  const store = fakeStore();
  const ip = '203.0.113.7';
  const mail = await emailKey('robert@example.com');

  assert.equal(await quotaExceeded(store, { ip, mail }), null);

  for (let i = 1; i <= RATES.ip.limit; i += 1) {
    await recordAccepted(store, { ip, mail, stamp: `stamp-${i}` });
    const over = await quotaExceeded(store, { ip, mail });
    if (i < RATES.ip.limit) assert.equal(over, null);
    else assert.deepEqual(over, { scope: 'ip', count: RATES.ip.limit });
  }

  // Fenêtres : une heure pour l'IP, un jour pour l'adresse et pour l'empreinte.
  const ttlOf = (key) => store.writes.find((w) => w.key === key)?.options?.expirationTtl;
  assert.equal(ttlOf(KEYS.ip(ip)), RATES.ip.ttl);
  assert.equal(ttlOf(KEYS.mail(mail)), RATES.email.ttl);
  assert.equal(ttlOf(KEYS.seen('stamp-1')), RATES.duplicate.ttl);
  // Aucune adresse en clair dans le stockage.
  assert.equal(KEYS.mail(mail).includes('@'), false);
  assert.equal(store.data.has(KEYS.mail(mail)), true);
});

test('le quota par adresse arrête une même adresse revenue avec d’autres textes', async () => {
  const store = fakeStore();
  const mail = await emailKey('ninadvegmannjfc33@gmail.com');

  // Cinq envois acceptés depuis cinq adresses IP différentes : le quota par IP ne voit rien, celui
  // par adresse arrête le sixième.
  for (let i = 1; i <= RATES.email.limit; i += 1) {
    await recordAccepted(store, { ip: `198.51.100.${i}`, mail, stamp: `texte-${i}` });
  }
  assert.deepEqual(await quotaExceeded(store, { ip: '198.51.100.99', mail }), { scope: 'email', count: RATES.email.limit });
  // Depuis une autre adresse, le quota par IP est intact.
  assert.equal(await quotaExceeded(store, { ip: '198.51.100.99', mail: await emailKey('autre@example.com') }), null);
});

test('une demande déjà reçue n’est pas renvoyée', async () => {
  const store = fakeStore();
  const mail = await emailKey('robert@example.com');
  const stamp = await fingerprint('robert@example.com', 'Bonjour, voici ma situation.');

  assert.equal(await isDuplicate(store, ''), false);
  assert.equal(await isDuplicate(store, stamp), false);

  await recordAccepted(store, { ip: '203.0.113.7', mail, stamp });

  assert.equal(await isDuplicate(store, stamp), true);
  // Même adresse, texte différent : ce n'est pas un doublon.
  assert.equal(await isDuplicate(store, await fingerprint('robert@example.com', 'Bonjour, autre chose.')), false);
});

test('les quotas restent cohérents', () => {
  assert.ok(RATES.ip.limit >= 1 && RATES.email.limit >= RATES.ip.limit);
  assert.ok(RATES.ip.ttl > 0 && RATES.email.ttl > 0 && RATES.duplicate.ttl > 0);
  assert.ok(LIMITS.message >= MIN_MESSAGE);
  // Les clés sont distinctes : un compteur ne peut pas écraser une empreinte.
  assert.equal(new Set([KEYS.ip('1.2.3.4'), KEYS.mail('abc'), KEYS.seen('abc')]).size, 3);
});
