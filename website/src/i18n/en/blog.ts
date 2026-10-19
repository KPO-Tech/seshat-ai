import type fr from '../fr/blog';

const en: typeof fr = {
  meta: {
    title: 'Blog: sovereign AI and agents | Seshat AI',
    description: 'Field notes, measurements and guides on sovereign AI for SMEs and on AI agents for developers.',
  },
  head: {
    eyebrow: 'Blog',
    pre: 'Ideas and field notes for AI that is ',
    em: 'actually useful',
    post: ' in business',
    lead: 'Field notes, engineering and guides to adopt sovereign AI that fits your company and can be checked.',
  },
  categories: { pme: 'For SMEs', dev: 'For developers', proof: 'Evidence', public: 'Public sector' },
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
    search: 'Search articles',
    filters: 'Filter by category',
    noResults: 'No article matches this search.',
    reset: 'Reset',
    sort: 'Sort by',
    newest: 'Newest',
    oldest: 'Oldest',
    categoriesTitle: 'Categories',
    follow: 'Follow the blog',
    followText: 'Every new article lands in your feed reader, no sign-up needed.',
    helpTitle: 'Have a project in mind?',
    helpText: 'Describe your situation: we reply with a costed assessment.',
    helpButton: 'Request an assessment',
    count: 'articles',
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
    public: {
      title: 'A document project?',
      text: 'A corpus, access rights, real questions and a stop criterion: we scope the perimeter before discussing tools.',
      button: 'Describe your corpus',
    },
  },
};

export default en;
