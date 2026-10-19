import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Une page de documentation = un fichier .md ou .mdx dans src/content/docs/<langue>/<section>/<page>.
// L'identifiant (ex. « en/getting-started/installation ») donne la langue et l'adresse de la page.
const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Section du menu : voir src/i18n/<langue>/docs.ts
    section: z.enum(['start', 'concepts', 'sdk', 'guides', 'learn', 'reference']),
    // Ordre dans la section (plus petit = plus haut)
    order: z.number().default(100),
    // Date de dernière révision, au format AAAA-MM-JJ
    updated: z.string().optional(),
  }),
});

// Un article de blog = un fichier .md ou .mdx dans src/content/blog/<langue>/<adresse>.
// L'identifiant (ex. « en/running-agents-safely ») donne la langue et l'adresse de l'article.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    // Titre court pour la balise <title> quand le titre éditorial dépasse la limite SERP
    seoTitle: z.string().optional(),
    description: z.string(),
    // Date de publication et de dernière révision, au format AAAA-MM-JJ
    date: z.string(),
    updated: z.string().optional(),
    // pme = dirigeants de PME, dev = développeurs, proof = preuves (mesures, audits, captures),
    // public = secteur public et administrations
    category: z.enum(['pme', 'dev', 'proof', 'public']),
    // Brouillon : visible avec « npm run dev », absent du site publié
    draft: z.boolean().default(false),
    // Adresse (sans la langue) de la même page dans l'autre langue, quand elle existe
    translationOf: z.string().optional(),
    // Image de partage et de carte (chemin sous /public), sinon l'image par défaut de la langue
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { docs, blog };
