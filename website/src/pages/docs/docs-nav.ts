export type Article = {
  title: string
  slug: string
  available: boolean
  desc?: string
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
      { title: 'Quick Start', slug: 'quick-start', available: false, desc: 'Your first agent in under 5 minutes.' },
      { title: 'Configuration', slug: 'configuration', available: false, desc: 'Providers, API keys and runtime options.' },
      { title: 'First Agent', slug: 'first-agent', available: false, desc: 'Build and run a simple autonomous agent from scratch.' },
    ],
  },
  {
    title: 'Concepts',
    slug: 'concepts',
    desc: 'Understand the architecture and core ideas that make Seshat different.',
    articles: [
      { title: 'What is Seshat?', slug: 'what-is-seshat', available: false, desc: 'Overview of the runtime and its two layers.' },
      { title: 'Mono-Run Architecture', slug: 'mono-run', available: false, desc: 'How the single binary orchestrates every subsystem.' },
      { title: 'Runtime Modes', slug: 'runtime-modes', available: false, desc: 'CLI, API, desktop, daemon and embedded modes explained.' },
      { title: 'Agent Teams and Mailboxes', slug: 'agent-teams', available: false, desc: 'How agents communicate and delegate to each other.' },
      { title: 'Memory and RAG', slug: 'memory-rag', available: false, desc: 'Short-term, long-term memory and retrieval-augmented generation.' },
      { title: 'Skills and MCP', slug: 'skills-mcp', available: false, desc: 'Reusable agent capabilities and the Model Context Protocol.' },
      { title: 'Built-in Tools', slug: 'tools', available: false, desc: 'Complete inventory of the 60+ built-in tools and their purpose.' },
    ],
  },
  {
    title: 'Guides',
    slug: 'guides',
    desc: 'Step-by-step guides for real-world usage and concrete scenarios.',
    articles: [
      { title: 'CLI Usage', slug: 'cli', available: false, desc: 'Full reference for the seshat command-line interface.' },
      { title: 'Desktop App', slug: 'desktop', available: false, desc: 'Using the SeshatOS desktop application for teams.' },
      { title: 'Building Workflows', slug: 'workflows', available: false, desc: 'Design multi-step agentic workflows that actually run.' },
      { title: 'Multi-Agent Scenarios', slug: 'multi-agent', available: false, desc: 'Coordinating specialized agent teams on shared missions.' },
      { title: 'Developer Integration', slug: 'dev-integration', available: false, desc: 'Embed Seshat into your existing stack or product.' },
    ],
  },
  {
    title: 'SDK and API',
    slug: 'sdk',
    desc: 'Programmatic access to Seshat from any language or platform.',
    articles: [
      { title: 'Go SDK', slug: 'go', available: false, desc: 'Native Go client library and embedding guide.' },
      { title: 'Python SDK', slug: 'python', available: false, desc: 'Python bindings (roadmap).' },
      { title: 'JS / TS SDK', slug: 'js', available: false, desc: 'JavaScript and TypeScript bindings (roadmap).' },
      { title: 'REST API', slug: 'rest-api', available: false, desc: 'Full HTTP API reference with examples.' },
      { title: 'gRPC API', slug: 'grpc-api', available: false, desc: 'gRPC API reference and proto definitions.' },
    ],
  },
  {
    title: 'Learn',
    slug: 'learn',
    desc: 'Deep dives into agentic AI concepts, patterns and architecture decisions.',
    articles: [
      { title: 'What is an Agent Runtime?', slug: 'agent-runtime', available: false, desc: 'Runtime vs framework: why the distinction matters.' },
      { title: 'Why Go for AI Agents?', slug: 'why-go', available: false, desc: 'The technical case for Go as an agent runtime language.' },
      { title: 'Mono-Run Explained', slug: 'mono-run-explained', available: false, desc: 'A deep dive into the single-binary design philosophy.' },
      { title: 'Technical Hypotheses', slug: 'technical-hypotheses', available: false, desc: 'The assumptions and architectural bets behind Seshat.' },
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
