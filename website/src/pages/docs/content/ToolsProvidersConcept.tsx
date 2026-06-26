import { Link, useLocation } from 'react-router-dom'
import articleStyles from './DocArticle.module.css'

export default function ToolsProvidersConcept() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/concepts">Concepts</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Tools &amp; Providers</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Tools &amp; Providers</h1>
        <p className={articleStyles.sub}>
          In Seshat, tools and providers are different runtime layers. Tools define what the agent is allowed to do. Providers define which model-backed transport answers the turn. The runtime keeps those concerns separate, then joins them inside one governed mono-run execution loop.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>One Runtime, Two Layers</h2>
        <p className={articleStyles.p}>
          This distinction matters because a serious agent runtime cannot treat every external dependency as one vague bag of capabilities. A tool call is executable surface area with permissions, side effects, and runtime state. A provider is a model transport and normalization layer. Seshat keeps them separate so the runtime can evolve tool orchestration, permissions, MCP integration, and provider routing without collapsing everything into one abstraction.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Why The Separation Exists</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Tools are executable surface area</div>
            <p className={articleStyles.cardBody}>Filesystem access, shell execution, browser control, planning, memory, RAG, notebooks, agent delegation, and MCP are all runtime-owned actions with permissions and side effects.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Providers are model transports</div>
            <p className={articleStyles.cardBody}>Anthropic, OpenAI, Ollama, Bedrock, Gemini, OpenRouter, Codex, and the other provider ids are network and normalization layers that produce model responses.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Capability providers are separate slots</div>
            <p className={articleStyles.cardBody}>Image generation, speech-to-text, and text-to-speech do not have to share the same provider as the main reasoning model.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Permissions stay runtime-first</div>
            <p className={articleStyles.cardBody}>The model does not automatically inherit every tool. The visible surface is filtered by runtime rules, permission mode, destructive checks, categories, and session context.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>How The Runtime Joins Them</h2>
        <p className={articleStyles.p}>
          The mono-run loop assembles prompt context, builds the model-visible tool surface, chooses the provider adapter, executes tool calls through the orchestrator, persists state, and applies permission policy. That matters because Seshat can evolve routing, memory, multimodal capabilities, or tool governance independently without collapsing everything into one vague “agent framework” abstraction.
        </p>
        <ol className={articleStyles.orderedList}>
          <li>The registry defines built-in tools, aliases, MCP extensions, and metadata.</li>
          <li>The surface builder filters what the model can actually see for the active session.</li>
          <li>The provider client normalizes the chosen provider into the runtime message contract.</li>
          <li>The loop routes reasoning and tool execution back through one runtime owner.</li>
        </ol>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>What Belongs In Concepts And What Does Not</h2>
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Boundary</div>
          <p className={articleStyles.calloutText}>
            Concepts should explain the architecture, not duplicate the integration reference. Exact provider setup tables, environment variables, credential injection patterns, capability wiring, and Codex auth details belong in SDK and API.
          </p>
        </div>
        <p className={articleStyles.p}>
          If you want the implementation reference, continue with{' '}
          <Link className={articleStyles.link} to="/docs/sdk/go" state={{ from: location.pathname }}>
            Go SDK
          </Link>
          {' '}and then{' '}
          <Link className={articleStyles.link} to="/docs/sdk/providers" state={{ from: location.pathname }}>
            Providers &amp; Auth
          </Link>
          .
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          Continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/runtime-modes" state={{ from: location.pathname }}>
            Runtime Modes
          </Link>
          {' '}for execution surfaces and loop behavior, or{' '}
          <Link className={articleStyles.link} to="/docs/concepts/skills-mcp" state={{ from: location.pathname }}>
            Skills and MCP
          </Link>
          {' '}for extensibility.
        </p>
      </section>
    </article>
  )
}
