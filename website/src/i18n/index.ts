// Mécanique de traduction du site.
// Les textes vivent dans un dictionnaire par langue (fr.ts, en.ts, ...). Les pages lisent le
// dictionnaire et ne contiennent plus de texte. Ajouter une langue : créer son fichier (même forme
// que fr.ts), l'enregistrer dans `dictionaries` et dans `locales`.
import fr from './fr';
import en from './en';

export const locales = ['fr', 'en'] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = 'fr';

export const dictionaries: Record<Lang, typeof fr> = { fr, en };

// Libellés du sélecteur de langue, dans leur propre langue.
export const langNames: Record<Lang, string> = { fr: 'Français', en: 'English' };
export const ogLocales: Record<Lang, string> = { fr: 'fr_FR', en: 'en_US' };

export function getLang(locale: string | undefined): Lang {
  return (locales as readonly string[]).includes(locale ?? '') ? (locale as Lang) : defaultLang;
}

// Gras simple dans un texte du dictionnaire : **mot**. À afficher avec set:html (textes écrits par nous).
export function rich(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function dict(lang: Lang) {
  return dictionaries[lang];
}

// Pages traduites et leur adresse dans chaque langue. Ajouter une langue : ajouter sa colonne.
// L'adresse de la page d'accueil de la langue par défaut est vide (`/`).
export type PageKey = 'home' | 'services' | 'products' | 'openSource' | 'about' | 'contact' | 'docs' | 'blog' | 'productSeshat' | 'productSeshatOS' | 'productSeshatCloud' | 'download';

export const slugs: Record<PageKey, Record<Lang, string>> = {
  home: { fr: '', en: 'en' },
  services: { fr: 'services', en: 'en/services' },
  products: { fr: 'produits', en: 'en/products' },
  productSeshat: { fr: 'produits/seshat', en: 'en/products/seshat' },
  productSeshatOS: { fr: 'produits/seshatos', en: 'en/products/seshatos' },
  productSeshatCloud: { fr: 'produits/seshatcloud', en: 'en/products/seshatcloud' },
  download: { fr: 'telechargement', en: 'en/download' },
  openSource: { fr: 'open-source', en: 'en/open-source' },
  about: { fr: 'a-propos', en: 'en/about' },
  contact: { fr: 'contact', en: 'en/contact' },
  // La documentation n'existe qu'en anglais : le menu français y renvoie aussi.
  docs: { fr: 'en/docs', en: 'en/docs' },
  blog: { fr: 'blog', en: 'en/blog' },
};

// Adresse d'une page dans une langue, par exemple url('en', 'products') donne '/en/products'.
export function url(lang: Lang, page: PageKey): string {
  return '/' + slugs[page][lang];
}

// Adresse d'une page de documentation (anglais uniquement) : /en/docs/<section>/<page>.
export function docUrl(slug = ''): string {
  const base = url('en', 'docs');
  return slug ? `${base}/${slug}` : base;
}

// Pour getStaticPaths de src/pages/[...slug].astro : une entrée par page et par langue.
export function allRoutes() {
  const out: { slug: string | undefined; lang: Lang; page: PageKey }[] = [];
  for (const lang of locales) {
    for (const page of Object.keys(slugs) as PageKey[]) {
      const slug = slugs[page][lang];
      out.push({ slug: slug === '' ? undefined : slug, lang, page });
    }
  }
  return out;
}
