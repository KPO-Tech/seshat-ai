import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Les fichiers de marque gardent leur nom — les autres dépôts, les signatures mail
 * et le JSON-LD s'y réfèrent — mais `_headers` les cache une semaine, dans le
 * navigateur comme chez Cloudflare. Un logo remplacé restait donc invisible une
 * semaine durant, l'ancien contenu continuant d'être servi sur la même URL.
 *
 * Même cause pour les films (`/videos`, cachés 30 jours) et les captures (`/captures`, 7 jours) :
 * le film d'accueil remplacé restait l'ancien en ligne, servi par Cloudflare sur la même URL
 * bien après le déploiement (`cf-cache-status: HIT`, `Age` de dix jours). L'URL versionnée en
 * change la clé de cache, sans purge à faire à la main.
 *
 * Astro hache déjà ce qu'il construit (`/_astro/*`), mais pas les fichiers de
 * `public/`, qui sont recopiés tels quels. Cette intégration ajoute donc
 * l'empreinte du contenu à l'URL écrite dans les pages : remplacer un logo change
 * son URL, donc le cache, sans qu'aucun numéro de version ne soit à tenir à jour
 * à la main.
 */
const FOLDERS = ['brand', 'og', 'videos', 'captures'];
const REWRITTEN = ['.html', '.css'];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pagesIn(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...pagesIn(path));
    else if (REWRITTEN.includes(entry.name.slice(entry.name.lastIndexOf('.')))) found.push(path);
  }
  return found;
}

export default function brandVersion() {
  return {
    name: 'brand-version',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const versions = new Map();
        for (const folder of FOLDERS) {
          for (const name of readdirSync(join(root, folder))) {
            const bytes = readFileSync(join(root, folder, name));
            const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
            versions.set(`/${folder}/${name}`, digest);
          }
        }

        let files = 0;
        let urls = 0;
        for (const path of pagesIn(root)) {
          const text = readFileSync(path, 'utf8');
          let next = text;
          for (const [url, digest] of versions) {
            // (?!\?) : une URL déjà versionnée — ou une question dans un exemple de
            // documentation — ne reçoit pas une seconde empreinte.
            const pattern = new RegExp(`${escape(url)}(?!\\?)`, 'g');
            const found = next.match(pattern)?.length ?? 0;
            if (found) next = next.replace(pattern, `${url}?v=${digest}`);
            urls += found;
          }
          if (next !== text) {
            writeFileSync(path, next);
            files += 1;
          }
        }
        logger.info(`${versions.size} fichiers de marque, ${urls} URL versionnées dans ${files} fichier(s)`);
      },
    },
  };
}
