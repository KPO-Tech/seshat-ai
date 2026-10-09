// Formulaire de contact : valide les champs puis envoie le message par Resend vers la boîte de contact.
// Variables à définir dans Cloudflare Pages (Settings, Variables and Secrets) : RESEND_API_KEY (secret), CONTACT_TO (optionnel).

type Handler = (ctx: { request: Request; env: Env }) => Response | Promise<Response>;

interface Env {
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
}

const FROM = 'Seshat AI <contact@seshat-ai.com>';
const DEFAULT_TO = 'contact@seshat-ai.com';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// Une ligne sans retour chariot, pour éviter toute injection dans les en-têtes du courriel.
const line = (v: FormDataEntryValue | null, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export const onRequestPost: Handler = async ({ request, env }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  // Champ piège : un humain ne le remplit pas. On répond « ok » sans rien envoyer.
  if (line(form.get('site'), 100)) return json({ ok: true });

  const nom = line(form.get('nom'), 120);
  const email = line(form.get('email'), 200);
  const entreprise = line(form.get('entreprise'), 160);
  const taille = line(form.get('taille'), 80);
  const message = String(form.get('message') ?? '').trim().slice(0, 5000);
  const consent = form.get('consent');

  if (!nom || !message || !consent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid' }, 422);
  if (!env.RESEND_API_KEY) return json({ ok: false, error: 'not_configured' }, 503);

  const head = [`Nom : ${nom}`, `E-mail : ${email}`];
  if (entreprise) head.push(`Entreprise : ${entreprise}`);
  if (taille) head.push(`Taille : ${taille}`);
  const text = [...head, '', message, '', `Envoyé depuis le formulaire de ${new URL(request.url).host}`].join(String.fromCharCode(10));

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

  if (!res.ok) return json({ ok: false, error: 'send_failed' }, 502);
  return json({ ok: true });
};

// Toute autre méthode est refusée.
export const onRequest: Handler = async () => json({ ok: false, error: 'method_not_allowed' }, 405);
