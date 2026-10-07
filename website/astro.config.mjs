import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import pagefind from 'astro-pagefind';
import sitemap from '@astrojs/sitemap';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { slugs } from './src/i18n/index.ts';

const SITE = 'https://seshat-ai.com';
// Pages traduites : chaque adresse connaît son équivalent dans l'autre langue (les adresses diffèrent : /a-propos et /en/about).
const alternates = new Map();
for (const [key, page] of Object.entries(slugs)) {
  if (key === 'blog') continue; // traité plus bas : les listes du blog n'existent dans le plan que si les deux langues ont des articles
  const fr = `${SITE}/${page.fr}`.replace(/\/$/, '') || SITE;
  const en = `${SITE}/${page.en}`;
  if (page.fr === page.en) continue;
  const links = [{ url: fr, lang: 'fr-FR' }, { url: en, lang: 'en-US' }];
  alternates.set(fr, links);
  alternates.set(en, links);
}

// Blog : articles publiés par langue (les brouillons n'entrent pas dans le plan du site) et paires de traductions.
function readPosts(lang) {
  const dir = `./src/content/blog/${lang}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => {
      const text = readFileSync(`${dir}/${f}`, 'utf8').replace(/\r\n/g, '\n');
      const front = (text.match(/^---\n([\s\S]*?)\n---/) ?? [, ''])[1];
      const twin = (front.match(/^translationOf:\s*["']?([^"'\n]+?)["']?\s*$/m) ?? [])[1];
      return { slug: f.replace(/\.mdx?$/, ''), draft: /^draft:\s*true\s*$/m.test(front), twin };
    })
    .filter((p) => !p.draft);
}
const blog = { fr: readPosts('fr'), en: readPosts('en') };
const blogPath = { fr: (slug) => `${SITE}/blog/${slug}`, en: (slug) => `${SITE}/en/blog/${slug}` };
if (blog.fr.length && blog.en.length) {
  const links = [{ url: `${SITE}/blog`, lang: 'fr-FR' }, { url: `${SITE}/en/blog`, lang: 'en-US' }];
  alternates.set(`${SITE}/blog`, links);
  alternates.set(`${SITE}/en/blog`, links);
}
for (const fr of blog.fr) {
  const en = blog.en.find((e) => e.slug === fr.twin || e.twin === fr.slug);
  if (!en) continue;
  const links = [{ url: blogPath.fr(fr.slug), lang: 'fr-FR' }, { url: blogPath.en(en.slug), lang: 'en-US' }];
  alternates.set(blogPath.fr(fr.slug), links);
  alternates.set(blogPath.en(en.slug), links);
}
const emptyBlogPages = new Set([...(blog.fr.length ? [] : [`${SITE}/blog`]), ...(blog.en.length ? [] : [`${SITE}/en/blog`])]);

export default defineConfig({
  site: SITE,
  server: { port: 4321 },
  // Cloudflare Pages sert /page sans barre finale : les adresses canoniques et le plan du site font de même.
  trailingSlash: 'never',
  // Un fichier par page (services.html, servi sur /services) : Cloudflare Pages redirige /services/ vers /services
  // au lieu de l'inverse, ce qui correspond aux adresses canoniques sans barre finale.
  build: { format: 'file' },
  integrations: [
    mdx(),
    // Plan du site avec les liens hreflang entre les pages françaises et anglaises.
    sitemap({
      filter: (page) => !page.endsWith('/404') && !emptyBlogPages.has(page.replace(/\/$/, '')),
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
