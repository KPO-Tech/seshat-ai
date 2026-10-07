// Outils du blog : lecture de la collection, brouillons, temps de lecture, traductions.
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n';

export type Post = CollectionEntry<'blog'>;
export type Category = Post['data']['category'];

export interface PostItem {
  slug: string; // adresse sans la langue
  lang: Lang;
  entry: Post;
  minutes: number;
}

function split(id: string): { lang: string; slug: string } {
  const [lang, ...rest] = id.split('/');
  return { lang, slug: rest.join('/') };
}

// Temps de lecture : environ 200 mots par minute, au moins une minute.
export function readingMinutes(body: string | undefined): number {
  const words = (body ?? '').replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Les brouillons ne sortent qu'avec « npm run dev ».
export async function postsFor(lang: Lang): Promise<PostItem[]> {
  const all = await getCollection('blog');
  return all
    .map((entry) => ({ ...split(entry.id), entry }))
    .filter((p) => p.lang === lang && (import.meta.env.DEV || !p.entry.data.draft))
    .map((p) => ({ slug: p.slug, lang, entry: p.entry, minutes: readingMinutes(p.entry.body) }))
    .sort((a, b) => b.entry.data.date.localeCompare(a.entry.data.date));
}

export async function allPosts(): Promise<PostItem[]> {
  return [...(await postsFor('fr')), ...(await postsFor('en'))];
}

export async function hasPosts(): Promise<boolean> {
  return (await allPosts()).length > 0;
}

// L'article équivalent dans l'autre langue : celui que cet article déclare, ou celui qui déclare cet article.
export function translationOf(post: PostItem, others: PostItem[]): PostItem | undefined {
  const declared = post.entry.data.translationOf;
  return others.find((o) => (declared && o.slug === declared) || o.entry.data.translationOf === post.slug);
}

export function formatDate(iso: string, lang: Lang): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
