import type fr from '../fr/home';

const en: typeof fr = {
  meta: {
    title: 'Seshat AI | Sovereign AI consulting and integration for SMEs and mid-sized companies',
    description: 'A costed assessment, a 30 to 90 day pilot, self-hosted AI solutions under your control. Publisher of the open source Seshat runtime.',
  },
  hero: {
    titleA: 'Useful AI that stays ',
    titleEm: 'with you.',
    lead: 'Fixed-price assessment, 30 to 90 day pilot, self-hosted solutions. AI consulting for SMEs and mid-sized companies.',
    primary: 'Request an assessment',
    secondary: 'See the offer',
    videoAria: 'Film: your data stays with you',
    videoFallback: 'Your browser cannot play this video.',
    videoSrc: '/videos/data-chez-vous-en.mp4',
    poster: '/videos/data-chez-vous-en-poster.jpg',
  },
  situations: {
    title: 'Where to start with AI?',
    items: [
      { t: 'Knowledge is everywhere, and impossible to find.', p: 'Procedures, contracts, notes: the information exists, but nobody knows where. Every search costs your teams time.' },
      { t: 'The same tasks, by hand.', p: 'Data entry, follow-ups, reports: hours of repetitive work that can be measured, then reduced.' },
      { t: 'AI, yes, but under your roof.', p: 'Your documents should not leave for a third party. The solution runs on your own infrastructure.' },
    ],
  },
  steps: {
    title: 'Three steps, a commitment that grows at your pace.',
    youGet: 'You get',
    formatLabel: 'Format',
    items: [
      { name: 'Assessment', what: 'We map your processes and rank use cases by value, speed, risk and feasibility.', got: 'A prioritized list, a tool recommendation and a pilot plan.', format: 'Short, fixed price.' },
      { name: 'Pilot', what: 'One use case, measured, over 30 to 90 days.', got: 'A working solution, a gain indicator set in advance and human validation on sensitive decisions.' },
      { name: 'Operation', what: 'Hosting, maintenance and extension to other uses.', got: 'Central administration, access tracking and a record of what the AI does.' },
    ],
    more: 'See the services in detail',
  },
  commitments: {
    title: 'What we commit to.',
    outside: 'Third-party services',
    where: 'With you',
    cells: ['Your data', 'Inspectable code', 'Human validation', 'The right tool'],
    items: [
      { t: 'Your data stays with you.', p: 'We deploy self-hosted solutions, on infrastructure you control.' },
      { t: 'You can inspect the code.', p: 'The Seshat runtime is open source (Apache-2.0). SeshatOS and SeshatCloud are published as source-available.' },
      { t: 'A human validates what matters.', p: 'No agents left to themselves on sensitive decisions: a person reviews and approves.' },
      { t: 'The right tool, not necessarily ours.', p: 'If a solution on the market fits your need better, the assessment tells you so.' },
    ],
  },
  proofs: {
    title: 'Seen in the field.',
    items: [
      { sector: 'Insurance', who: 'Allianz France', text: 'Migration of a datamart from SAS to Python and PySpark (over 15,000 lines), Medallion architecture on Azure Databricks, over 150 business rules and regression tests.' },
      { sector: 'Construction', who: 'Groupe Sylvagreg', text: 'Research and development in computer vision for 3D reconstruction, from images and plans.' },
      { sector: 'Agriculture and trade', who: 'Lyne et Frères', text: 'Analyses, dashboards and internal open source AI tools, deployed with non-technical teams, with support.', note: "The founder's family business: a first deployment in real conditions." },
    ],
  },
  products: {
    title: 'What we deploy, you can inspect.',
    codeLink: 'See the code',
    items: [
      { name: 'Seshat', badge: 'Available', text: 'The agent runtime in Go: tools, sessions, permissions and sandbox. Installable today, with a terminal interface.', licence: 'Open source, Apache-2.0.' },
      { name: 'SeshatOS', badge: 'Under construction', text: 'A local AI environment, on your computer or your server. Chat and Projects, with skills, already run locally.', licence: 'Source-available: free to use and host, not for resale.' },
      { name: 'SeshatCloud', badge: 'Under construction', text: 'The multi-user layer: organizations, access rights and central administration.', licence: 'Source-available, commercial agreement above a threshold.' },
    ],
    moreProducts: 'See the products',
    moreLicences: 'Licenses and source code',
  },
  cta: {
    title: "Let's talk about your situation.",
    text: 'A first conversation to understand your needs and see whether AI can help.',
    button: 'Request an assessment',
  },
};

export default en;
