// Outils de la documentation : lecture de la collection et construction du menu.
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n';

export type Doc = CollectionEntry<'docs'>;

// La documentation n'est écrite qu'en anglais. Les contenus vivent dans src/content/docs/en/.
export const SOURCE_LANG: Lang = 'en';

export const SECTION_ORDER = ['start', 'concepts', 'sdk', 'guides', 'learn', 'reference'] as const;
export type SectionKey = (typeof SECTION_ORDER)[number];

export interface DocItem {
  slug: string;
  entry: Doc;
}

function split(id: string): { lang: string; slug: string } {
  const [lang, ...rest] = id.split('/');
  return { lang, slug: rest.join('/') };
}

// Toutes les pages de la documentation (anglais uniquement).
export async function docsFor(): Promise<DocItem[]> {
  const all = await getCollection('docs');
  return all
    .map((entry) => ({ ...split(entry.id), entry }))
    .filter((e) => e.lang === SOURCE_LANG)
    .map(({ slug, entry }) => ({ slug, entry }));
}

export function sortItems(items: DocItem[]): DocItem[] {
  return [...items].sort((a, b) => {
    const sa = SECTION_ORDER.indexOf(a.entry.data.section);
    const sb = SECTION_ORDER.indexOf(b.entry.data.section);
    return sa - sb || a.entry.data.order - b.entry.data.order || a.slug.localeCompare(b.slug);
  });
}

export interface DocGroup { section: SectionKey; items: DocItem[] }

export function groupBySection(items: DocItem[]): DocGroup[] {
  const sorted = sortItems(items);
  return SECTION_ORDER.map((section) => ({ section, items: sorted.filter((i) => i.entry.data.section === section) })).filter((g) => g.items.length > 0);
}
