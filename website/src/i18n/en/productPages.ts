import type fr from '../fr/productPages';

const en: typeof fr = {
  crumb: 'Products',
  more: 'Explore',
  layersTitle: 'The layers of the stack that belong to this product',
  layersNote: 'Each layer and its maturity are detailed on the Products page.',
  seshat: {
    meta: {
      title: 'Seshat: the open source agent runtime | Seshat AI',
      description: 'Seshat, the Go agent runtime under the Apache-2.0 license: tools, sessions, permissions, model providers, MCP, terminal interface, gRPC and SDK.',
    },
    head: { title: 'Seshat, the open source agent runtime.', lead: 'The foundation of the other two building blocks, usable on its own by technical teams.' },
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
    platformsTitle: 'The platforms of SeshatOS',
    platformsLead: 'A platform is a workspace dedicated to one job, inside the product. We do not present any of them as ready if it is not.',
    platforms: [
      { name: 'Chat and Projects', badge: 'Under construction', tone: 'wip', text: 'Conversations with skills and tools, grouped into projects. Usable locally today, with search over your documents from the Chat.' },
      { name: 'Knowledge', badge: 'Roadmap', tone: 'plan', text: 'The internal knowledge platform. Its interface does not exist yet: sourced search is used from the Chat. The framing (mockups, requirements) is done.' },
      { name: 'Automation', badge: 'Roadmap', tone: 'plan', text: 'Scheduled tasks and agent workflows, with human validation. This is a product direction: nothing is shipped.' },
    ],
  },
  seshatcloud: {
    meta: {
      title: 'SeshatCloud: the multi-user layer | Seshat AI',
      description: 'SeshatCloud: organisations, access rights, SCIM, an admin console and document reading, on top of the same runtime. Solid on the server side, not offered on its own yet.',
    },
    head: { title: 'SeshatCloud, AI shared across the whole company.', lead: 'The multi-user layer on top of the same runtime: organisations, access rights, administration.' },
    availability: 'Not offered on its own yet: it is deployed as part of a pilot or a tailored engagement.',
  },
};

export default en;
