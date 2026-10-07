import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { postsFor } from '../../../lib/blog';

export const GET: APIRoute = async (context) => {
  const posts = await postsFor('en');
  return rss({
    title: 'Seshat AI: the blog',
    description: 'Field notes, measurements and guides on sovereign AI and AI agents.',
    site: context.site!,
    items: posts.map((p) => ({ title: p.entry.data.title, description: p.entry.data.description, pubDate: new Date(p.entry.data.date), link: `/en/blog/${p.slug}` })),
    customData: '<language>en-US</language>',
  });
};
