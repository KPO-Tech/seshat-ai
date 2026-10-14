// Formulaire de contact : écarte les envois automatisés puis, et seulement alors, envoie le message par
// Resend vers la boîte de contact.
//
// Défense en couches, dans cet ordre : même origine, leurre caché, validation des champs, quotas (si le
// stockage KV est lié), vérification Cloudflare Turnstile, détection des doublons. Aucun courriel ne part
// avant que tout ce qui précède soit validé.
//
// Variables à définir dans Cloudflare Pages (Settings, Variables and Secrets) :
//   RESEND_API_KEY        (secret, obligatoire) : envoi du courriel.
//   TURNSTILE_SECRET_KEY  (secret, recommandé) : vérification anti-robot côté serveur. Tant qu'il est
//                         absent, cette couche est inactive. La clé publique du même widget est lue au
//                         build dans PUBLIC_TURNSTILE_SITE_KEY, qui vit dans les variables du dépôt
//                         GitHub (le site est construit par GitHub Actions) : les deux se configurent
//                         ensemble.
//   CONTACT_TO            (optionnel) : destinataire, contact@seshat-ai.com par défaut.
// Liaison optionnelle : CONTACT_GUARD (namespace KV). Elle active les quotas par IP et par adresse, ainsi
// que la détection des doublons. Sans elle, ces couches sont inactives et le reste continue de filtrer.

import {
  LIMITS,
  cleanLine,
  cleanMessage,
  emailKey,
  fingerprint,
  isDuplicate,
  isEmail,
  isSameOrigin,
  quotaExceeded,
  recordAccepted,
  spamReason,
} from './_guard.mjs';

// Surface minimale de KV utilisée ici : évite d'ajouter la dépendance @cloudflare/workers-types.
interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  TURNSTILE_SECRET_KEY?: string;
  CONTACT_GUARD?: KVStore;
}

type Handler = (ctx: { request: Request; env: Env }) => Response | Promise<Response>;

const FROM = 'Formulaire Seshat AI <formulaire@seshat-ai.com>';
const DEFAULT_TO = 'contact@seshat-ai.com';
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// Journal d'un rejet ou d'un envoi : lisible dans les logs du projet Cloudflare Pages. Jamais d'adresse
// en clair, seulement son empreinte quand il faut recouper deux envois.
const log = (event: string, fields: Record<string, unknown>) => console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));

/** Vérifie le jeton auprès de Cloudflare. Échec bloquant : si Cloudflare ne répond pas, on refuse. */
async function verifyTurnstile(secret: string, token: string, ip: string): Promise<{ ok: boolean; reason: string }> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch(TURNSTILE_URL, { method: 'POST', body });
    if (!res.ok) return { ok: false, reason: `siteverify_${res.status}` };
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success) return { ok: true, reason: '' };
    return { ok: false, reason: (data['error-codes'] ?? []).join(',') || 'challenge_failed' };
  } catch {
    return { ok: false, reason: 'siteverify_unreachable' };
  }
}

export const onRequestPost: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  // Les logs portent l'état des couches : après un déploiement, on voit tout de suite si Turnstile et
  // les quotas sont bien actifs.
  const where = { host: url.host, ip, turnstile: Boolean(env.TURNSTILE_SECRET_KEY), guard: Boolean(env.CONTACT_GUARD) };
  const reject = (status: number, error: string, fields: Record<string, unknown>) => {
    log('contact_rejected', { ...where, error, ...fields });
    return json({ ok: false, error }, status);
  };

  // 1. Même origine : le formulaire du site est le seul appelant légitime.
  if (!isSameOrigin({ origin: request.headers.get('Origin'), referer: request.headers.get('Referer'), self: url.origin })) {
    return reject(403, 'cross_origin', { reason: 'origin_or_referer_missing' });
  }

  // 2. Lecture du formulaire.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject(400, 'bad_request', { reason: 'unreadable_body' });
  }

  // 3. Leurre : invisible pour un humain. Un robot qui le remplit reçoit « ok » et rien ne part.
  if (cleanLine(form.get('site'), 100)) {
    log('contact_dropped', { ...where, reason: 'honeypot' });
    return json({ ok: true });
  }

  // 4. Champs nettoyés (Unicode normalisé, caractères invisibles et retours à la ligne retirés).
  const nom = cleanLine(form.get('nom'), LIMITS.name);
  const email = cleanLine(form.get('email'), LIMITS.email).toLowerCase();
  const entreprise = cleanLine(form.get('entreprise'), LIMITS.company);
  const taille = cleanLine(form.get('taille'), LIMITS.size);
  const message = cleanMessage(form.get('message'));
  const consent = form.get('consent');

  // 5. Validation : le texte passe avant tout appel externe.
  if (!nom || !consent || !isEmail(email)) return reject(422, 'invalid', { reason: 'missing_or_invalid' });
  const spam = spamReason(message);
  if (spam) return reject(422, 'spam', { reason: spam, size: message.length });

  // 6. Quotas (seulement si le stockage KV est lié) : répétition par IP, puis par adresse. C'est la
  //    couche qui attrape une même adresse revenue plusieurs fois avec des textes différents.
  const store = env.CONTACT_GUARD;
  const mail = store ? await emailKey(email) : '';
  if (store) {
    const over = await quotaExceeded(store, { ip, mail });
    if (over) return reject(429, 'rate_limited', over);
  }

  // 7. Turnstile : vérification serveur obligatoire dès que la clé secrète est configurée. Un simple
  //    widget dans la page ne suffit pas, le jeton est vérifié ici.
  const secret = env.TURNSTILE_SECRET_KEY;
  const token = cleanLine(form.get('cf-turnstile-response'), 4096);
  if (secret) {
    if (!token) return reject(403, 'challenge', { reason: 'missing_token' });
    const check = await verifyTurnstile(secret, token, ip);
    if (!check.ok) return reject(403, 'challenge', { reason: check.reason });
  } else if (token) {
    // Le widget est dans la page mais la clé secrète manque : la vérification ne peut pas avoir lieu. On
    // le journalise, sinon la protection semblerait active alors qu'elle ne l'est pas.
    log('contact_misconfigured', { ...where, reason: 'turnstile_secret_missing' });
  }

  // 8. Doublon : même adresse et même texte déjà reçus récemment. Le premier envoi est parti, on répond
  //    « ok » sans rien renvoyer.
  const stamp = store ? await fingerprint(email, message) : '';
  if (store && (await isDuplicate(store, stamp))) {
    log('contact_dropped', { ...where, reason: 'duplicate' });
    return json({ ok: true });
  }

  // 9. Envoi, une fois tout ce qui précède validé.
  if (!env.RESEND_API_KEY) return reject(503, 'not_configured', { reason: 'missing_resend_key' });

  const head = [`Nom : ${nom}`, `E-mail : ${email}`];
  if (entreprise) head.push(`Entreprise : ${entreprise}`);
  if (taille) head.push(`Taille : ${taille}`);
  const text = [...head, '', message, '', `Envoyé depuis le formulaire de ${url.host}`].join(String.fromCharCode(10));

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [env.CONTACT_TO || DEFAULT_TO],
      reply_to: email,
      subject: `Demande de contact : ${nom}${entreprise ? ` (${entreprise})` : ''}`,
      text,
    }),
  });

  if (!res.ok) return reject(502, 'send_failed', { reason: 'resend', status: res.status });

  // 10. Comptabilité, après un envoi réellement accepté : un échec ne consomme pas de quota et ne bloque
  //     pas la nouvelle tentative de la personne.
  if (store) await recordAccepted(store, { ip, mail, stamp });

  log('contact_accepted', { ...where, size: message.length });
  return json({ ok: true });
};

// Toute autre méthode est refusée.
export const onRequest: Handler = async () => json({ ok: false, error: 'method_not_allowed' }, 405);
