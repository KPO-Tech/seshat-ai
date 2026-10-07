import type fr from '../fr/blog';

const en: typeof fr = {
  meta: {
    title: 'Blog: sovereign AI and agents | Seshat AI',
    description: 'Field notes, measurements and guides on sovereign AI for SMEs and on AI agents for developers.',
  },
  head: {
    title: 'The blog.',
    lead: 'Checkable field notes: what we built, measured and fixed. For SME leaders and for developers.',
  },
  categories: { pme: 'For SMEs', dev: 'For developers', proof: 'Evidence' },
  labels: {
    all: 'All',
    minutes: 'min read',
    published: 'Published on',
    updated: 'Updated on',
    by: 'By',
    related: 'Keep reading',
    back: 'All articles',
    rss: 'RSS feed',
    read: 'Read the article',
    draft: 'Draft: only visible in development',
    empty: 'The first articles are coming soon.',
    english: 'Français',
  },
  cta: {
    pme: {
      title: "Let's talk about your situation.",
      text: 'A costed assessment, then a 30 to 90 day pilot. Describe your situation in a few lines.',
      button: 'Request an assessment',
    },
    dev: {
      title: 'Try Seshat.',
      text: 'An open source agent runtime, installed with one command.',
      button: 'Read the documentation',
      second: 'See the code',
    },
  },
};

export default en;
