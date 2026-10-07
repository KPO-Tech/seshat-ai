// Outils de la documentation : lecture de la collection et construction du menu.
import { getCollection, type CollectionEntry } from 'astro:content';
import { locales, type Lang } from '../i18n';

export type Doc = CollectionEntry<'docs'>;

// La documentation est écrite d'abord dans cette langue ; les autres langues se traduisent ensuite page par page.
export const SOURCE_LANG: Lang = 'en';

export const SECTION_ORDER = ['start', 'concepts', 'sdk', 'guides', 'learn', 'reference'] as const;
export type SectionKey = (typeof SECTION_ORDER)[number];

export interface DocItem {
  slug: string;
  entry: Doc;
  /** faux quand la page n'existe pas dans la langue demandée et que la version source s'affiche à la place */
  translated: boolean;
}

function split(id: string): { lang: string; slug: string } {
  const [lang, ...rest] = id.split('/');
  return { lang, slug: rest.join('/') };
}

// Toutes les pages visibles dans une langue : la version traduite si elle existe, sinon la version source.
export async function docsFor(lang: Lang): Promise<DocItem[]> {
  const all = await getCollection('docs');
  const own = new Map<string, Doc>();
  const source = new Map<string, Doc>();
  for (const e of all) {
    const { lang: l, slug } = split(e.id);
    if (l === lang) own.set(slug, e);
    if (l === SOURCE_LANG) source.set(slug, e);
  }
  const slugs = new Set([...source.keys(), ...own.keys()]);
  return [...slugs].map((slug) => {
    const entry = own.get(slug) ?? source.get(slug)!;
    return { slug, entry, translated: own.has(slug) || lang === SOURCE_LANG };
  });
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

export const languagesWithDocs = locales;
