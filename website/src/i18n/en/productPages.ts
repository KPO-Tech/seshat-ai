import type fr from '../fr/productPages';

const en: typeof fr = {
  crumb: 'Products',
  more: 'See the product',
  layersTitle: 'The layers of the stack that belong to this product',
  layersNote: 'Each layer and its maturity are detailed on the Products page.',
  seshat: {
    meta: {
      title: 'Seshat: the open source agent runtime | Seshat AI',
      description: 'Seshat, the Go agent runtime under the Apache-2.0 license: tools, sessions, permissions, model providers, MCP, terminal interface, gRPC and SDK.',
    },
    head: { title: 'Seshat, the open source agent runtime.', lead: 'The foundation of the other two building blocks, usable on its own by technical teams.' },
    docs: { label: 'Read the documentation', text: 'Installation, concepts, configuration and reference.' },
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
