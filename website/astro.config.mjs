import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import pagefind from 'astro-pagefind';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  site: 'https://seshat-ai.com',
  server: { port: 4321 },
  integrations: [mdx(), pagefind()],
  markdown: {
    // Deux thèmes de coloration : le site choisit lequel afficher (voir global.css).
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false },
    rehypePlugins: [[rehypeAutolinkHeadings, { behavior: 'append', properties: { class: 'anchor', ariaLabel: 'Lien vers cette section' }, content: { type: 'text', value: '#' } }]],
  },
});
