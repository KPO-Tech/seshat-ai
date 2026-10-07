import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import pagefind from 'astro-pagefind';
import sitemap from '@astrojs/sitemap';
import { slugs } from './src/i18n/index.ts';

const SITE = 'https://seshat-ai.com';
// Pages traduites : chaque adresse connaît son équivalent dans l'autre langue (les adresses diffèrent : /a-propos et /en/about).
const alternates = new Map();
for (const page of Object.values(slugs)) {
  const fr = `${SITE}/${page.fr}`.replace(/\/$/, '') || SITE;
  const en = `${SITE}/${page.en}`;
  if (page.fr === page.en) continue;
  const links = [{ url: fr, lang: 'fr-FR' }, { url: en, lang: 'en-US' }];
  alternates.set(fr, links);
  alternates.set(en, links);
}
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  site: SITE,
  server: { port: 4321 },
  // Cloudflare Pages sert /page sans barre finale : les adresses canoniques et le plan du site font de même.
  trailingSlash: 'never',
  integrations: [
    mdx(),
    // Plan du site avec les liens hreflang entre les pages françaises et anglaises.
    sitemap({
      filter: (page) => !page.endsWith('/404'),
      serialize(item) {
        const key = item.url.replace(/\/$/, '') || SITE;
        const links = alternates.get(key) ?? alternates.get(item.url);
        return links ? { ...item, links } : item;
      },
    }),
    pagefind(),
  ],
  markdown: {
    // Deux thèmes de coloration : le site choisit lequel afficher (voir global.css).
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false },
    rehypePlugins: [[rehypeAutolinkHeadings, { behavior: 'append', properties: { class: 'anchor', ariaLabel: 'Lien vers cette section' }, content: { type: 'text', value: '#' } }]],
  },
});
