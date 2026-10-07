// Données structurées (JSON-LD) et valeurs communes de référencement.
// Les nœuds ont des @id stables pour que les pages se référencent entre elles (Organization, WebSite).
import { legal } from '../data/legal';

export const SITE = 'https://seshat-ai.com';
export const GITHUB_ORG = 'https://github.com/KPO-Tech';
export const GITHUB_RUNTIME = 'https://github.com/KPO-Tech/seshat';

// Références complètes (pas seulement des @id) : chaque page doit se comprendre seule.
const orgRef = { '@type': 'Organization', name: legal.brand, url: `${SITE}/` };
const siteRef = { '@type': 'WebSite', name: legal.brand, url: `${SITE}/` };

const ID = { org: `${SITE}/#organization`, site: `${SITE}/#website`, founder: `${SITE}/#founder` };

type Lang = 'fr' | 'en';

const orgDescription: Record<Lang, string> = {
  fr: "Conseil et intégration d'IA souveraine pour PME et ETI : diagnostic, pilote, solutions auto-hébergées. Éditeur du runtime open source Seshat.",
  en: 'Sovereign AI consulting and integration for SMEs and mid-sized companies: assessment, pilot, self-hosted solutions. Publisher of the open source Seshat runtime.',
};

export function organizationNode(lang: Lang) {
  return {
    '@type': 'Organization',
    '@id': ID.org,
    name: legal.brand,
    legalName: legal.tradeName,
    url: `${SITE}/`,
    logo: { '@type': 'ImageObject', url: `${SITE}/brand/mark-on-light.svg` },
    description: orgDescription[lang],
    email: legal.email,
    founder: { '@id': ID.founder },
    sameAs: [GITHUB_ORG],
    knowsAbout: ['Artificial intelligence', 'Self-hosted AI', 'AI agents', 'Process automation', 'Document search (RAG)', 'Go'],
  };
}

export function founderNode() {
  return {
    '@type': 'Person',
    '@id': ID.founder,
    name: legal.usageName,
    jobTitle: 'Data and AI engineer, founder of Seshat AI',
    worksFor: { '@id': ID.org },
  };
}

export function websiteNode(lang: Lang) {
  return {
    '@type': 'WebSite',
    '@id': ID.site,
    url: `${SITE}/`,
    name: legal.brand,
    inLanguage: lang === 'fr' ? 'fr-FR' : 'en-US',
    publisher: { '@id': ID.org },
  };
}

export function breadcrumbNode(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: new URL(it.path, SITE).href })),
  };
}

export function webPageNode(opts: { url: string; name: string; description: string; lang: Lang; type?: string }) {
  return {
    '@type': opts.type ?? 'WebPage',
    '@id': `${opts.url}#webpage`,
    url: opts.url,
    name: opts.name,
    description: opts.description,
    inLanguage: opts.lang === 'fr' ? 'fr-FR' : 'en-US',
    isPartOf: siteRef,
    about: orgRef,
  };
}

export function techArticleNode(opts: { url: string; headline: string; description: string; dateModified?: string; section?: string }) {
  return {
    '@type': 'TechArticle',
    '@id': `${opts.url}#article`,
    url: opts.url,
    headline: opts.headline,
    description: opts.description,
    inLanguage: 'en-US',
    articleSection: opts.section,
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    author: orgRef,
    publisher: orgRef,
    isPartOf: siteRef,
    mainEntityOfPage: opts.url,
  };
}

export function runtimeSourceNode() {
  return {
    '@type': 'SoftwareSourceCode',
    name: 'Seshat',
    description: 'An open source runtime for AI agents, written in Go: agent loop, tools, permissions, sessions, providers, MCP and skills.',
    codeRepository: GITHUB_RUNTIME,
    programmingLanguage: 'Go',
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    isAccessibleForFree: true,
    author: orgRef,
  };
}

// Le film de la page d'accueil : permet à Google de le reconnaître comme une vidéo (durée, miniature, fichier).
export function videoNode(opts: { name: string; description: string; contentPath: string; thumbnailPath: string; seconds: number; uploadDate: string; lang: Lang }) {
  return {
    '@type': 'VideoObject',
    name: opts.name,
    description: opts.description,
    thumbnailUrl: new URL(opts.thumbnailPath, SITE).href,
    contentUrl: new URL(opts.contentPath, SITE).href,
    uploadDate: opts.uploadDate,
    duration: `PT${opts.seconds}S`,
    inLanguage: opts.lang === 'fr' ? 'fr-FR' : 'en-US',
    publisher: orgRef,
  };
}

export function graph(nodes: object[]) {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
}
