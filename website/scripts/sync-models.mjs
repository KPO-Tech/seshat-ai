// Génère src/content/docs/en/reference/models.mdx à partir de seshat-runtime/docs/providers.md
// (lui-même produit par `go run scripts/gen_provider_docs.go` dans le dépôt seshat-runtime, d'après le registre des providers).
//
// Usage : npm run sync:models            (cherche ../../seshat-runtime)
//         SESHAT_DIR=/chemin/vers/seshat-runtime npm run sync:models
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const seshat = resolve(process.env.SESHAT_DIR ?? resolve(here, '../../../seshat-runtime'));
const source = readFileSync(resolve(seshat, 'docs/providers.md'), 'utf8').replace(/\r\n/g, '\n');

const start = source.indexOf('## Supported providers');
const end = source.indexOf('## Client hierarchy');
if (start < 0 || end < 0) throw new Error('providers.md: sections introuvables');
const block = source.slice(start, end);

// Les cases oui/non du générateur deviennent des mots (pas de tiret cadratin dans le site).
const flag = (c) => (c === '✓' ? 'Yes' : c === '—' ? 'No' : c);
const rows = (table) => table.split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.split('|').slice(1, -1).map((c) => flag(c.trim())));

// Tableau des providers
const provTable = block.slice(block.indexOf('| Provider ID'), block.indexOf('## Model reference'));
const providers = rows(provTable).map(([id, service, auth, vision, cache]) => `| ${id} | ${service} | ${auth} | ${vision} | ${cache} |`);

// Modèles par provider (sans la colonne Description, tronquée par le générateur)
const modelsPart = block.slice(block.indexOf('## Model reference') + '## Model reference'.length);
const sections = modelsPart.split(/\n### /).slice(1).map((s) => {
  const [title, ...rest] = s.split('\n');
  const table = rest.join('\n');
  const body = rows(table).map(([id, ctx, out, cache]) => `| ${id} | ${ctx} | ${out} | ${cache} |`);
  // The generator adds one sentence when it shows only a provider's default models; keep it.
  const note = rest.find((l) => l.startsWith('Default large and small model shown.'));
  return `### ${title.replace(/ — .*$/, '')}\n\n| Model ID | Context | Max output | Prompt cache |\n|---|---|:---:|:---:|\n${body.join('\n')}\n${note ? `\n${note}\n` : ''}`;
});

const today = new Date().toISOString().slice(0, 10);
const out = `---
title: Providers and models
description: "Every provider Seshat supports, with the models it knows, their context window and their capabilities."
section: reference
order: 1
updated: "${today}"
---
import Callout from '@/components/docs/Callout.astro';

{/* Généré par scripts/sync-models.mjs : ne pas modifier à la main. */}

This page is generated from the provider registry of the runtime. How to set keys and endpoints is in [Configuration](/en/docs/getting-started/configuration), and the code side in [Providers and authentication](/en/docs/sdk/providers-and-auth).

<Callout type="note" title="Models change often">
Providers retire and add models all the time, so the runtime does not keep its own lists: the models of each provider come from the public models.dev catalog embedded in the program, and the page below shows each provider's default large and small model. You can use any model name your provider accepts, and \`ollama\` models are whatever you have pulled locally.
</Callout>

## Providers

| Provider ID | Service | Authentication | Vision | Prompt cache |
|---|---|---|:---:|:---:|
${providers.join('\n')}

## Models

${sections.join('\n')}`;
writeFileSync(resolve(here, '../src/content/docs/en/reference/models.mdx'), out);
console.log('models.mdx : ' + providers.length + ' providers, ' + sections.length + ' sections');
