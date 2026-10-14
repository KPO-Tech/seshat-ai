// Logique pure du garde-fou du formulaire de contact : nettoyage des champs, validation, contrôle de
// même origine, repérage des textes de robots et empreinte des demandes.
//
// Aucune dépendance à Cloudflare : le fichier est importé par contact.ts (compilé par Pages) et par
// tests/contact-guard.test.mjs (exécuté par `npm test`, sans serveur ni réseau).

/** Longueurs maximales acceptées par champ, après nettoyage. */
export const LIMITS = { name: 120, email: 200, company: 160, size: 80, message: 5000 };

/** Un message plus court que cela ne vient pas d'une personne qui décrit sa situation. */
export const MIN_MESSAGE = 10;

/** Au-delà de ce nombre de liens, le message est traité comme un envoi automatique. */
export const MAX_LINKS = 4;

// Quotas appliqués quand le stockage KV est lié (voir CONTACT_GUARD dans contact.ts).
// `limit` compte les envois acceptés, `ttl` la fenêtre en secondes.
export const RATES = {
  ip: { limit: 3, ttl: 3600 },
  email: { limit: 5, ttl: 86400 },
  duplicate: { ttl: 86400 },
};

/** Clés des compteurs et des empreintes dans le stockage KV. */
export const KEYS = {
  ip: (ip) => `limit:ip:${ip}`,
  mail: (mail) => `limit:mail:${mail}`,
  seen: (stamp) => `seen:${stamp}`,
};

// Un champ de formulaire peut arriver en fichier (pièce jointe glissée dans un champ texte) : seul
// le texte compte, tout le reste est ignoré.
const asText = (value) => (typeof value === 'string' ? value : '');

// Caractères invisibles et de contrôle : utilisés pour faire passer deux fois le même texte,
// ou pour casser l'affichage du courriel reçu.
const ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const LINK = /https?:\/\/|www\./gi;

/** Nettoie une valeur courte : normalise l'Unicode, retire les caractères invisibles, les retours à la
 *  ligne (injection d'en-têtes de courriel) et les caractères de contrôle, puis borne la longueur. */
export function cleanLine(value, max) {
  return asText(value)
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(CONTROLS, '')
    .trim()
    .slice(0, max);
}

/** Nettoie un message libre : mêmes retraits que cleanLine, mais les retours à la ligne légitimes restent. */
export function cleanMessage(value, max = LIMITS.message) {
  return asText(value)
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROLS, '')
    .trim()
    .slice(0, max);
}

/** Adresse plausible : un seul arobase, pas d'espace, un point dans le domaine. */
export function isEmail(value) {
  return value.length > 0 && value.length <= LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Une soumission de formulaire est légitime seulement si elle vient du site lui-même : un navigateur
 *  envoie toujours Origin (ou au moins Referer) sur un POST, un script qui appelle l'endpoint en direct
 *  ne le fait pas. On accepte l'un ou l'autre, et on refuse l'absence des deux. */
export function isSameOrigin({ origin, referer, self }) {
  const match = (value) => {
    if (!value) return false;
    try {
      return new URL(value).origin === self;
    } catch {
      return false;
    }
  };
  return match(origin) || match(referer);
}

/** Motif de rejet du texte, ou null s'il est plausible. Volontairement prudent : on cherche le robot
 *  évident, pas à filtrer une langue, un message court ou un lien cité par un prospect. */
export function spamReason(message) {
  if (message.length < MIN_MESSAGE) return 'too_short';
  if ((message.match(LINK) ?? []).length > MAX_LINKS) return 'too_many_links';
  return null;
}

/** Empreinte SHA-256 en hexadécimal (Web Crypto : disponible dans Workers comme dans Node). */
export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clé d'une adresse pour les quotas, sans stocker l'adresse en clair. */
export function emailKey(email) {
  return sha256Hex(email.trim().toLowerCase());
}

/** Empreinte d'une demande complète : même adresse et même texte déjà reçus, c'est un doublon.
 *  Les espaces et la casse sont neutralisés pour ne pas laisser échapper une simple reformulation. */
export function fingerprint(email, message) {
  return sha256Hex(`${email.trim().toLowerCase()}|${message.replace(/\s+/g, ' ').trim().toLowerCase()}`);
}

const countOf = async (store, key) => Number(await store.get(key)) || 0;

/** Couche de quota dépassée, ou null. On compte les envois acceptés : une même adresse revenue
 *  plusieurs fois avec des textes différents est arrêtée ici, sans bloquer une personne qui corrige
 *  son message. */
export async function quotaExceeded(store, { ip, mail }) {
  if (ip) {
    const count = await countOf(store, KEYS.ip(ip));
    if (count >= RATES.ip.limit) return { scope: 'ip', count };
  }
  const count = await countOf(store, KEYS.mail(mail));
  if (count >= RATES.email.limit) return { scope: 'email', count };
  return null;
}

/** Enregistre une demande acceptée : compteurs par IP et par adresse, et empreinte du texte.
 *  Appelé après un envoi réussi seulement : un échec ne doit ni consommer de quota ni bloquer la
 *  nouvelle tentative de la personne. */
export async function recordAccepted(store, { ip, mail, stamp }) {
  const bump = async (key, ttl) => {
    await store.put(key, String((await countOf(store, key)) + 1), { expirationTtl: ttl });
  };
  if (ip) await bump(KEYS.ip(ip), RATES.ip.ttl);
  await bump(KEYS.mail(mail), RATES.email.ttl);
  if (stamp) await store.put(KEYS.seen(stamp), '1', { expirationTtl: RATES.duplicate.ttl });
}

/** Même adresse et même texte déjà reçus : le premier envoi est parti, on ne renvoie rien. */
export async function isDuplicate(store, stamp) {
  return Boolean(stamp) && Boolean(await store.get(KEYS.seen(stamp)));
}
