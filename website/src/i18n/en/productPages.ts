import type fr from '../fr/productPages';

const en: typeof fr = {
  crumb: 'Products',
  whoLabel: 'Who it is for',
  notLabel: 'What it is not',
  more: 'Explore',
  layersTitle: 'The layers of the stack that belong to this product',
  layersNote: 'Each layer and its maturity are detailed on the Products page.',
  seshat: {
    meta: {
      title: 'Seshat: the AI agent in your terminal, open source | Seshat AI',
      description: 'Seshat opens a full terminal interface for long agent sessions, with your own models. Under it, an open source Go runtime (Apache-2.0): tools, sessions, permissions, MCP, gRPC and SDK.',
    },
    head: { title: 'Seshat, the AI agent in your terminal.', lead: 'A full interface for long agent sessions, with your own models, on your machine. Under it, an open source runtime that the other two building blocks also build on.' },
    who: 'For technical teams (developers, data and AI engineers) who want agents under their control, with the model of their choice, rather than a closed assistant.',
    not: 'It is not a ready-to-use assistant for non-technical teams: that one is SeshatOS, which builds on this same runtime.',
    docs: { label: 'Read the documentation', text: 'Installation, concepts, configuration and reference.' },
    detail: {
      map: {
        title: 'Seshat in one picture.',
        lead: 'One runtime, several ways to reach it, and the model of your choice behind it.',
        aria: 'Diagram: the interfaces, the Seshat runtime and the models',
        colA: 'How you reach it',
        surfaces: [
          { name: 'Terminal', note: 'seshat chat, seshat run', icon: 'terminal-window' },
          { name: 'Go SDK', note: 'In your application', icon: 'code' },
          { name: 'gRPC server', note: 'As a service', icon: 'plugs-connected' },
        ],
        built: 'Also built on Seshat',
        colB: 'The Seshat runtime',
        core: [
          { name: 'Query loop', icon: 'arrows-clockwise' },
          { name: 'Tools and permissions', icon: 'shield-check' },
          { name: 'Sessions', icon: 'clock-counter-clockwise' },
          { name: 'Skills', icon: 'book-open-text' },
          { name: 'MCP', icon: 'plugs' },
        ],
        stays: 'Your files and sessions stay on your machine.',
        colC: 'The models',
        models: [
          { name: 'Hosted APIs', note: 'About fifteen providers' },
          { name: 'Local models', note: 'With Ollama, no key' },
        ],
        leaves: 'Only the request goes to the provider you chose.',
      },
      loop: {
        title: 'What happens when you ask for something.',
        lead: 'Seshat runs the loop that turns a language model into something that can act. Example: "List all TODO comments in this project and group them by file."',
        aria: 'The steps of the query loop',
        loopBack: 'Repeated until the task is done',
        steps: [
          { icon: 'chat-circle-text', title: 'You ask', text: 'Your message and the conversation go to the model.' },
          { icon: 'robot', title: 'The model decides', text: 'It answers if it can. Otherwise it asks for a tool: read files, search, run a command.' },
          { icon: 'shield-check', title: 'Seshat checks', text: 'Sensitive actions ask for your approval before they run.' },
          { icon: 'wrench', title: 'Tools run', text: 'The result is added to the conversation.' },
          { icon: 'check-circle', title: 'Result', text: 'The model is called again with the results, until it has nothing left to do. You see every step.' },
        ],
      },
      surfaces: {
        title: 'Three ways to use it.',
        lead: 'The same runtime is behind each of them: same sessions, same tools, same providers.',
        docs: 'Documentation',
        cards: [
          { icon: 'terminal-window', name: 'Terminal', badge: 'Available', tone: 'ok', who: 'An agent for your own work, in your project folder.', note: 'For developers and technical teams.', href: 'getting-started/quick-start' },
          { icon: 'code', name: 'Go SDK', badge: 'Available', tone: 'ok', who: 'An agent to embed in your application, with your tools and your providers.', note: 'For teams building a product.', href: 'sdk/go-sdk' },
          { icon: 'plugs-connected', name: 'gRPC server', badge: 'Experimental', tone: 'wip', who: 'The agent as a service, called by other programs.', note: 'Partial surface: one service, SeshatService, with Query, QueryStream, skills, MCP, models and health.', href: 'sdk/grpc-api' },
        ],
      },
      gives: {
        title: 'What the runtime gives you.',
        items: [
          { icon: 'cpu', title: 'The model of your choice', text: 'About fifteen providers, from hosted APIs to local models with Ollama. Switch models without touching your code.' },
          { icon: 'wrench', title: 'Tools under control', text: 'Files, shell, search, web. Each tool is declared, and sensitive actions ask for your approval.' },
          { icon: 'clock-counter-clockwise', title: 'Work you can pick up again', text: 'Sessions are saved locally: resume the latest one, or a specific session.' },
          { icon: 'book-open-text', title: 'Your rules', text: "Skills are Markdown files that teach the agent your team's conventions." },
          { icon: 'plugs', title: 'Connected services', text: 'MCP servers add external tools.' },
          { icon: 'shield-check', title: 'Safe by default', text: 'The configuration of a cloned project is ignored until you approve it, and secrets are not passed to the commands the model runs.' },
        ],
      },
      start: {
        title: 'Start with three commands.',
        lead: 'Install, choose a model, open a session.',
        steps: [
          { title: 'Install', text: 'Linux and macOS. On Windows, use the Go toolchain.' },
          { title: 'Choose a model', text: 'Here a local model with Ollama, no API key. For a hosted provider, add --provider and --api-key.' },
          { title: 'Open a session', text: 'Or run a one-off task with seshat run "…".' },
        ],
        docs: 'Quick start guide',
      },
    },
  },
  seshatos: {
    meta: {
      title: 'SeshatOS: a local, self-hosted AI environment | Seshat AI',
      description: 'SeshatOS: a local-first, self-hosted AI environment with a Go backend and a desktop app. What is usable today and what is under construction.',
    },
    head: { title: 'SeshatOS, AI that runs on your premises.', lead: 'A local, self-hosted environment organised in platforms. Each platform carries its own level of maturity.' },
    who: 'For one person or a small team who wants an AI assistant on their own machine or server, without sending documents to a third party.',
    not: 'It is not a complete product yet: only Chat and Projects are usable. It is not multi-user, and scheduled tasks are in SeshatCloud.',
    download: {
      title: 'Download SeshatOS',
      lead: 'The desktop app for Windows and Linux. It runs on your machine and checks for updates itself.',
      note: 'Chat and Projects are the usable part today; the other platforms below are not. The Windows installer is not always signed yet, so Windows may ask you to confirm before the first launch.',
      loading: 'Looking for the latest version…',
      versionLabel: 'Latest version',
      unavailable: 'The list of downloads could not be loaded. Every file is on the releases page.',
      files: [
        { id: 'windows', label: 'Windows', detail: 'Installer (.exe)' },
        { id: 'appimage', label: 'Linux', detail: 'AppImage' },
        { id: 'deb', label: 'Debian and Ubuntu', detail: 'Package (.deb)' },
        { id: 'macos-arm64', label: 'macOS, Apple silicon', detail: 'Disk image (.dmg), experimental: not tested on a Mac yet, and macOS asks you to confirm the first launch' },
        { id: 'macos-x64', label: 'macOS, Intel', detail: 'Disk image (.dmg), experimental: not tested on a Mac yet, and macOS asks you to confirm the first launch' },
      ],
      checksums: 'SHA-256 checksums',
      allReleases: 'All releases and notes',
    },
    platformsTitle: 'SeshatOS platforms',
    platformsLead: 'A platform is a workspace dedicated to one job, inside the product. We do not present any of them as ready if it is not.',
    platforms: [
      { name: 'Chat and Projects', badge: 'Under construction', tone: 'wip', text: 'Conversations with skills and tools, grouped into projects. Usable locally today, with search over your documents from the Chat.' },
      { name: 'Knowledge', badge: 'Roadmap', tone: 'plan', text: 'The internal knowledge platform. Its interface does not exist yet: sourced search is used from the Chat. The framing (mockups, requirements) is done.' },
      { name: 'Scheduled tasks', badge: 'In SeshatCloud', tone: 'wip', text: 'They do not run inside SeshatOS: they run on a SeshatCloud server, so they keep going when your computer is off. They exist on the server side; the administration console and the packaged offer are under construction.' },
    ],
  },
  seshatcloud: {
    meta: {
      title: 'SeshatCloud: the multi-user layer | Seshat AI',
      description: 'SeshatCloud: organisations, access rights, SCIM, an admin console and document reading, on top of the Seshat runtime. Not offered on its own yet.',
    },
    head: { title: 'SeshatCloud, AI shared across the whole company.', lead: 'The multi-user layer on top of the same runtime: organisations, access rights, administration.' },
    who: 'For an organization where AI has to be shared: several people, access rights, and tasks that run without a computer being on.',
    not: 'It is not a packaged offer yet: the server is advanced, the console is under construction, and setting it up goes through a pilot or tailored support.',
    can: {
      title: 'What the server can already do.',
      lead: 'Read in the code, not in a roadmap. Each card says where it stands.',
      items: [
        { icon: 'clock', title: 'Scheduled tasks, run by the server', text: 'A scheduler queues due tasks, starts them, and takes over the ones whose process stopped. Your computer can be off.', badge: 'Server side', tone: 'wip' },
        { icon: 'lightning', title: 'Triggers', text: 'At a set time, by webhook, or when an email arrives (Gmail).', badge: 'Server side', tone: 'wip' },
        { icon: 'graph', title: 'Workflows in steps', text: 'Agent steps, conditions and sends, built as a graph, with a test run before they are switched on.', badge: 'Server side', tone: 'wip' },
        { icon: 'plugs-connected', title: 'About twenty connectors', text: 'Email, tickets, CRM, messaging, calendar, spreadsheets, payment: for example Gmail, Outlook, Jira, Notion, HubSpot, Teams.', badge: 'Server side', tone: 'wip' },
        { icon: 'files', title: 'Starter templates', text: 'Invoice intake and extraction, operational inbox triage, document compliance check, weekly report digest.', badge: 'Server side', tone: 'wip' },
        { icon: 'browser', title: 'An administration console', text: 'To manage organizations, access and tasks.', badge: 'Under construction', tone: 'plan' },
      ],
    },
    availability: 'Not offered on its own yet: it is deployed as part of a pilot or a tailored engagement.',
  },
};

export default en;
