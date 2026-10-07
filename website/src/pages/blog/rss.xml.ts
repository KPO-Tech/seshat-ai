import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { postsFor } from '../../lib/blog';

export const GET: APIRoute = async (context) => {
  const posts = await postsFor('fr');
  return rss({
    title: 'Seshat AI : le blog',
    description: "Retours d'expérience, mesures et guides sur l'IA souveraine et les agents IA.",
    site: context.site!,
    items: posts.map((p) => ({ title: p.entry.data.title, description: p.entry.data.description, pubDate: new Date(p.entry.data.date), link: `/blog/${p.slug}` })),
    customData: '<language>fr-FR</language>',
  });
};
