import type fr from '../fr/openSource';

const en: typeof fr = {
  meta: {
    title: 'Open source and licenses | Seshat AI',
    description: 'The Seshat runtime is open source (Apache-2.0). SeshatOS and SeshatCloud are source-available. What each license allows.',
  },
  head: {
    title: 'Code you can read, test and host.',
    lead: 'We say precisely what is open source and what is not, so you know what you can do.',
  },
  terms: {
    openTitle: 'Open source',
    open: 'The code is public and the license allows you to use it, modify it and resell it. Only the **Seshat** runtime falls in this category (Apache-2.0).',
    openNote: 'One clarification: the Seshat terminal interface reuses code from Crush (Charmbracelet), published under the FSL-1.1-MIT license. That part remains subject to this license, which mainly forbids reselling it as a product competing with Crush.',
    srcTitle: 'Source-available',
    src: 'The code is readable and you can use and host it yourself, but the license limits resale. This is the case for **SeshatOS**, already public, and **SeshatCloud**.',
    honest: 'We only write “open source” for what truly is.',
  },
  matrix: {
    title: 'What each license allows.',
    colBrick: 'Component',
    cols: ['Read the code', 'Use and host', 'Modify', 'Resell'],
    yes: 'Yes',
    no: 'No',
    seshat: { kind: 'Open source', lic: 'Apache-2.0' },
    os: { kind: 'Source-available', lic: 'Apache-2.0 with Commons Clause' },
    cloud: { kind: 'Source-available', draft: 'License being finalized: commercial agreement above a usage threshold.' },
    fine: "Simplified summary. The license text prevails. For Seshat, the row applies to the runtime: the terminal interface is also subject to Crush's FSL-1.1-MIT license.",
  },
  where: {
    title: 'Where to look.',
    repos: [
      { name: 'Seshat', badge: 'Open source', text: 'The agent runtime in Go and its terminal interface: code, releases and history.' },
      { name: 'SeshatOS', badge: 'Source-available', text: 'The local application, already public. Chat and Projects, with skills, run locally; the rest is under construction.' },
      { name: 'Skills', badge: 'Public', text: 'The skills that Seshat and SeshatOS can load.' },
    ],
    noteCloud: '**SeshatCloud**: private repository for now, the license is being finalized.',
    noteAllA: 'Everything is on ',
    noteAllLink: 'github.com/KPO-Tech',
    thirdTitle: 'Third-party solutions, carefully integrated',
    thirdText: 'We select, configure and integrate the solutions that fit your need, including open source ones, while protecting the sovereignty of your data.',
  },
  cta: {
    title: 'A question about a license?',
    text: 'We answer precisely, before any commitment.',
    button: 'Write to us',
  },
};

export default en;
