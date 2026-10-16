import type fr from '../fr/common';

const en: typeof fr = {
  skip: 'Skip to content',
  brandAria: 'Seshat AI, home',
  navAria: 'Main navigation',
  nav: [
    { page: 'services', label: 'Services' },
    { page: 'products', label: 'Products' },
    { page: 'openSource', label: 'Open source' },
    { page: 'docs', label: 'Docs' },
    { page: 'blog', label: 'Blog' },
    { page: 'about', label: 'About' },
  ],
  groups: [
    { label: 'Services', page: 'services' },
    {
      label: 'Products',
      items: [
        { page: 'productSeshat', label: 'Seshat', note: 'The agent runtime, with its terminal', badge: 'Available', tone: 'ok' },
        { page: 'productSeshatOS', label: 'SeshatOS', note: 'The local AI environment: Chat and Projects', badge: 'Under construction', tone: 'wip' },
        { page: 'productSeshatCloud', label: 'SeshatCloud', note: 'Organizations, access and scheduled tasks', badge: 'Under construction', tone: 'wip' },
        { label: 'Knowledge', note: 'Internal knowledge', badge: 'Coming soon', tone: 'plan' },
        { page: 'products', label: 'The whole stack', note: 'Overview and maturity of each layer' },
      ] as { page?: string; label: string; note?: string; badge?: string; tone?: string }[],
    },
    { label: 'Developers', items: [{ page: 'openSource', label: 'Open source' }, { page: 'docs', label: 'Docs' }] },
    { label: 'Blog', page: 'blog' },
    { label: 'Company', items: [{ page: 'about', label: 'About' }, { page: 'contact', label: 'Contact' }] },
  ],
  cta: 'Request an assessment',
  ctaShort: 'Assessment',
  menu: 'Menu',
  themeToggle: 'Switch theme, light or dark',
  langSwitch: 'Change language',
  footer: {
    tagline: 'Sovereign AI consulting and integration for SMEs and mid-sized companies.',
    navAria: 'Footer',
    support: 'Support',
    contact: 'Contact',
    github: 'Code on GitHub',
    legal: 'Legal notices (in French)',
    privacy: 'Privacy policy (in French)',
    copyright: '© 2026 Seshat AI',
  },
};

export default en;
