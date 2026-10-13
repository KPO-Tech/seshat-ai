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
    { label: 'Products', page: 'products' },
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
