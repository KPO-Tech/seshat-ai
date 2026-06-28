export type Article = {
  title: string
  slug: string
  available: boolean
  desc?: string
  parentSlug?: string
  navTitle?: string
}

export type Section = {
  title: string
  slug: string
  desc: string
  articles: Article[]
}

export const DOC_SECTIONS: Section[] = [
  {
    title: 'Getting Started',
    slug: 'getting-started',
    desc: 'Install Seshat and run your first autonomous agent in minutes.',
    articles: [
      { title: 'Installation', slug: 'installation', available: true, desc: 'Install the Seshat binary on Linux, macOS or Windows.' },
      { title: 'Quick Start', slug: 'quick-start', available: true, desc: 'Your first agent in under 5 minutes.' },
      { title: 'Configuration', slug: 'configuration', available: true, desc: 'Providers, API keys and runtime options.' },
      { title: 'First Agent', slug: 'first-agent', available: true, desc: 'Build and run a simple autonomous agent from scratch.' },
    ],
  },
  {
    title: 'Concepts',
    slug: 'concepts',
    desc: 'Understand the architecture and core ideas that make Seshat different.',
    articles: [
      { title: 'What is Seshat?', slug: 'what-is-seshat', available: true, desc: 'The runtime, the platform layer, and the thesis behind organized agentic work.' },
      { title: 'Mono-Run Architecture', slug: 'mono-run', available: true, desc: 'How one runtime owns sessions, prompts, tools, permissions, and persistence.' },
      { title: 'Runtime Modes', slug: 'runtime-modes', available: true, desc: 'Entry surfaces like CLI, gRPC, HTTP, and SDK versus execution modes like execute, plan, and pair_programming.' },
      { title: 'Agent Teams and Mailboxes', slug: 'agent-teams', available: true, desc: 'Persistent agent identities, mailbox transport, dispatcher routing, and the beginning of a real team runtime.' },
      { title: 'Memory and RAG', slug: 'memory-rag', available: true, desc: 'Session persistence, compaction, durable memory, knowledge-graph memory tools, and retrieval-augmented generation.' },
      { title: 'Skills and MCP', slug: 'skills-mcp', available: true, desc: 'How reusable skills shape behavior and how MCP servers extend the runtime with external tools, resources, and prompts.' },
      { title: 'Tools & Providers', slug: 'tools', available: true, desc: 'How the tool surface and provider layer fit together across built-ins, external capabilities, and model providers.' },
    ],
  },
  {
    title: 'SDK and API',
    slug: 'sdk',
    desc: 'Programmatic access to Seshat from any language or platform.',
    articles: [
      { title: 'Go SDK', slug: 'go', available: true, desc: 'Embedding Seshat in Go applications, services, automation workers, and products.' },
      { title: 'Providers & Auth', slug: 'providers', available: true, parentSlug: 'go', navTitle: 'Providers & Auth', desc: 'Provider configuration, authentication flows, Codex integration patterns, and capability-provider wiring for Go developers.' },
      { title: 'Agent', slug: 'agent', available: true, parentSlug: 'go', navTitle: 'Agent', desc: 'Agent persona design, role presets, client-versus-session boundaries, and the practical embedding model for Go applications.' },
      { title: 'Prompt', slug: 'prompt', available: true, parentSlug: 'go', navTitle: 'Prompt', desc: 'Prompt architecture, shipped prompt layers, stages, overrides, tool hints, and the full prompt-shaping surface in the Go SDK.' },
      { title: 'Tools & Surface', slug: 'go-tools', available: true, parentSlug: 'go', navTitle: 'Tools & Surface', desc: 'Builtin tools, surface shaping, permissions, deferred tools, and the runtime-owned action layer for Go integrations.' },
      { title: 'Building Workflows', slug: 'workflows', available: true, parentSlug: 'go', navTitle: 'Building Workflows', desc: 'Design runtime-native workflows with sessions, tools, memory, and controlled execution loops.' },
      { title: 'Multi-Agent Scenarios', slug: 'multi-agent', available: true, parentSlug: 'go', navTitle: 'Multi-Agent Scenarios', desc: 'Coordinate specialized agents, mailbox-style delegation, and runtime teams from your Go host app.' },
      { title: 'Developer Integration', slug: 'dev-integration', available: true, parentSlug: 'go', navTitle: 'Developer Integration', desc: 'Embed Seshat cleanly into your own backend, desktop app, internal platform, or product surface.' },
      { title: 'gRPC API', slug: 'grpc-api', available: true, desc: 'Full gRPC contract, streaming semantics, proto regeneration, and polyglot client guidance.' },
      { title: 'Python SDK', slug: 'python', available: false, desc: 'Python bindings (roadmap).' },
      { title: 'JS / TS SDK', slug: 'js', available: false, desc: 'JavaScript and TypeScript bindings (roadmap).' },
      { title: 'REST API', slug: 'rest-api', available: true, desc: 'The seshat-ai HTTP layer: native query endpoints, Anthropic-compatible messages, auth, sessions, and backend resources.' },
    ],
  },
  {
    title: 'Guides',
    slug: 'guides',
    desc: 'Step-by-step guides for end users and product surfaces.',
    articles: [
      { title: 'CLI Usage', slug: 'cli', available: true, desc: 'How to use the Seshat CLI, TUI, sessions, and runtime configuration.' },
      { title: 'Desktop App', slug: 'desktop', available: false, desc: 'Using the SeshatOS desktop application for teams.' },
    ],
  },
  {
    title: 'Learn',
    slug: 'learn',
    desc: 'Deep dives into agentic AI concepts, patterns and architecture decisions.',
    articles: [
      { title: 'Vision & Direction', slug: 'vision', available: true, desc: 'Why Seshat keeps a broad open-source vision while staying narrow and credible in its current product wedge.' },
      { title: 'What is an Agent Runtime?', slug: 'agent-runtime', available: true, desc: 'Runtime versus framework versus platform, and why the boundary matters.' },
      { title: 'Why Go for AI Agents?', slug: 'why-go', available: true, desc: 'Why a Go runtime fits deployable agent systems better than a framework-only approach.' },
      { title: 'Mono-Run Explained', slug: 'mono-run-explained', available: true, desc: 'A deeper explanation of why one runtime should own the full execution lifecycle.' },
      { title: 'Technical Hypotheses', slug: 'technical-hypotheses', available: true, desc: 'The explicit architectural bets and validation signals behind Seshat.' },
    ],
  },
  {
    title: 'Comparisons',
    slug: 'comparisons',
    desc: 'Honest side-by-side comparisons with popular agent frameworks.',
    articles: [
      { title: 'Seshat vs LangGraph', slug: 'vs-langgraph', available: false, desc: 'Runtime approach vs graph-based orchestration.' },
      { title: 'Seshat vs CrewAI', slug: 'vs-crewai', available: false, desc: 'Go runtime vs Python crew abstraction.' },
      { title: 'Seshat vs AutoGen', slug: 'vs-autogen', available: false, desc: 'Production runtime vs conversation-first framework.' },
      { title: 'Seshat vs OpenAI Agents SDK', slug: 'vs-openai-agents', available: false, desc: 'Open-source runtime vs vendor-locked SDK.' },
      { title: 'Seshat vs Claude Code', slug: 'vs-claude-code', available: false, desc: 'Autonomous runtime vs coding assistant.' },
    ],
  },
]

export function findSection(slug: string): Section | undefined {
  return DOC_SECTIONS.find(s => s.slug === slug)
}

export function findArticle(sectionSlug: string, articleSlug: string): Article | undefined {
  return findSection(sectionSlug)?.articles.find(a => a.slug === articleSlug)
}
