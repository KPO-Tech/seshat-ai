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

export const collections = { docs };
