import type fr from '../fr/products';

const en: typeof fr = {
  meta: {
    title: 'Products | Seshat AI',
    description: 'Seshat, SeshatOS and SeshatCloud: what is available, what is under construction, and under which license.',
  },
  head: {
    title: 'What we deploy, you can inspect.',
    lead: 'Three building blocks, each with its real maturity level. We never present anything as ready if it is not.',
  },
  scaleAria: 'Maturity level of the products',
  stages: ['Roadmap', 'Under construction', 'Beta', 'Available'],
  codeLabel: 'See the code',
  privateLabel: 'Private repository for now',
  items: [
    {
      badge: 'Available',
      what: 'The agent runtime in Go. It is the foundation of the two other blocks, and can be used on its own by technical teams.',
      points: [
        'Tools, sessions, permissions and sandbox.',
        'About fifteen model providers, MCP, skills and RAG.',
        'Terminal interface (seshat chat), command line, gRPC and SDK.',
      ],
      licence: 'Open source runtime, Apache-2.0. The terminal interface reuses code from Crush (FSL-1.1-MIT license).',
      status: 'Version 1.3, installable today, with its terminal interface.',
    },
    {
      badge: 'Under construction',
      what: 'A local, self-hosted AI environment, on your computer or your server: a Go backend and a desktop application.',
      points: [
        'Chat and Projects, with skills and tools, already run locally.',
        'Search across your documents from the Chat. Your documents stay on your machine.',
        'Dedicated screens (knowledge, scheduling, administration) come next.',
      ],
      licence: 'Source-available: free to use and host, not for resale.',
      status: 'Public on GitHub. Chat and Projects are usable, the rest is under construction.',
    },
    {
      badge: 'Under construction',
      what: 'The multi-user layer on top of the same runtime: the one you need when AI has to be shared across a whole company.',
      points: [
        'Organizations, access rights and account provisioning (SCIM).',
        'Administration console and scheduled tasks.',
        'Document reading and evaluation of search quality.',
      ],
      licence: 'Source-available. Commercial agreement above a threshold. License being finalized.',
      status: 'Solid on the server side, not yet offered on its own.',
    },
  ],
  tui: {
    title: 'Seshat in your terminal, installable today.',
    introA: 'No need to wait for the rest: ',
    introCode: 'seshat chat',
    introB: ' opens a full interface for long agent sessions, with your own model keys, on your machine.',
    installLabel: 'Installation',
    copy: 'Copy',
    copied: 'Copied',
    galleryAria: 'Screenshots of the terminal interface',
    shots: [
      { t: 'Home', d: 'Ready in seconds, with the essential shortcuts in view.' },
      { t: 'The agent at work', d: 'The full reasoning trace: thinking, tool calls, sub-agents and task list.' },
      { t: 'Live results', d: 'Answers streamed as they come, in markdown, with the duration of each tool.' },
      { t: 'Model choice', d: 'Switch between more than twenty models with two keystrokes.' },
      { t: 'Providers', d: 'Encrypted API keys, organized by provider.' },
      { t: 'Settings', d: 'Every shortcut, one keystroke away (ctrl+p).' },
    ],
    renameTitle: 'Why “NEXUS”?',
    renameText: 'The project was called Nexus before becoming Seshat. These captures predate the name change and will be redone.',
    codeLink: 'See the code and the documentation',
  },
  kta: {
    name: 'Knowledge-to-Action',
    title: 'a pilot, not a finished product.',
    intro: 'This first use case is built with you, on your documents. The Knowledge interface does not exist yet: sourced search is used today from the Chat.',
    verbs: [
      { t: 'Ask a question', d: "Get a sourced answer on your documents, with everyone's access rights." },
      { t: 'Spot the gaps', d: 'Find outdated, contradictory, duplicated or missing content.' },
      { t: 'Act with validation', d: 'Propose an update, a task or an answer, subject to human validation.' },
    ],
  },
  cta: {
    title: 'See what fits your company.',
    text: 'The assessment says which building block, which market tool or which development fits your need best.',
    button: 'Request an assessment',
  },
};

export default en;
