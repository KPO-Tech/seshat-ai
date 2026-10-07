// /llms.txt : résumé du site pour les assistants IA (format llmstxt.org). Généré à la compilation.
import type { APIRoute } from 'astro';
import { docsFor, sortItems } from '../lib/docs';
import { allPosts } from '../lib/blog';
import { docUrl, dict, url } from '../i18n';
import { SITE } from '../lib/seo';
import { legal } from '../data/legal';

export const GET: APIRoute = async () => {
  const fr = dict('fr');
  const en = dict('en');
  const abs = (path: string) => new URL(path, SITE).href;
  const docs = sortItems(await docsFor());
  const d = dict('en').docs;
  const bySection = new Map<string, typeof docs>();
  for (const it of docs) bySection.set(it.entry.data.section, [...(bySection.get(it.entry.data.section) ?? []), it]);

  const lines: string[] = [
    '# Seshat AI',
    '',
    '> Sovereign AI consulting and integration for SMEs and mid-sized companies (France): a costed assessment, a 30 to 90 day pilot, self-hosted solutions. Publisher of Seshat, an open source (Apache-2.0) runtime for AI agents written in Go.',
    '',
    'The website is available in French (default) and English. The documentation is in English only.',
    '',
    '## Website',
    '',
    `- [Home (FR)](${abs(url('fr', 'home'))}): ${fr.home.meta.description}`,
    `- [Home (EN)](${abs(url('en', 'home'))}): ${en.home.meta.description}`,
    `- [Services (EN)](${abs(url('en', 'services'))}): ${en.services.meta.description}`,
    `- [Products (EN)](${abs(url('en', 'products'))}): ${en.products.meta.description}`,
    `- [Open source and licenses (EN)](${abs(url('en', 'openSource'))}): ${en.openSource.meta.description}`,
    `- [About (EN)](${abs(url('en', 'about'))}): ${en.about.meta.description}`,
    `- [Contact (EN)](${abs(url('en', 'contact'))}): ${en.contact.meta.description}`,
    '',
    '## Documentation',
    '',
    `- [Documentation home](${abs(docUrl())}): ${d.meta.description}`,
  ];
  for (const [section, items] of bySection) {
    const title = d.sections[section as keyof typeof d.sections].title;
    lines.push('', `### ${title}`, '');
    for (const it of items) lines.push(`- [${it.entry.data.title}](${abs(docUrl(it.slug))}): ${it.entry.data.description}`);
  }
  const posts = (await allPosts()).filter((p) => !p.entry.data.draft);
  if (posts.length) {
    lines.push('', '## Blog', '');
    for (const p of posts) lines.push(`- [${p.entry.data.title}](${abs(`${url(p.lang, 'blog')}/${p.slug}`)}): ${p.entry.data.description}`);
  }
  lines.push('', '## Contact', '', `- Sales and assessments: ${legal.email}`, `- Support (runtime, documentation, installed products): ${legal.supportEmail}`);
  lines.push('', '## Source code', '', '- [Seshat runtime on GitHub](https://github.com/KPO-Tech/seshat): the open source runtime, with its architecture notes.', '');
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
