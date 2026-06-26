import { Link, useLocation } from 'react-router-dom'
import articleStyles from './DocArticle.module.css'
import styles from './ToolsProvidersConcept.module.css'

type Tone = 'tool' | 'provider' | 'runtime' | 'capability'
type IconName = 'wrench' | 'server' | 'shield' | 'plug' | 'layers' | 'flow' | 'search' | 'spark'

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'wrench':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a4 4 0 0 0-5.5 5.5L4 17l3 3 5.2-5.2a4 4 0 0 0 5.5-5.5l-2.2 2.2-3.1-3.2 2.3-2z" />
        </svg>
      )
    case 'server':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="6" rx="1.8" />
          <rect x="4" y="14" width="16" height="6" rx="1.8" />
          <path d="M8 7h.01M8 17h.01" />
        </svg>
      )
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v5c0 4.7-2.8 7.9-7 10-4.2-2.1-7-5.3-7-10V6l7-3z" />
        </svg>
      )
    case 'plug':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 7V3M15 7V3" />
          <path d="M8 7h8v3a4 4 0 0 1-8 0V7z" />
          <path d="M12 14v7" />
        </svg>
      )
    case 'layers':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
        </svg>
      )
    case 'flow':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="7" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
          <path d="M8 7h8M7 8.7l4 6.1M17 8.7l-4 6.1" />
        </svg>
      )
    case 'search':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      )
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </svg>
      )
  }
}

function toneClassName(tone: Tone) {
  switch (tone) {
    case 'provider':
      return styles.toneProvider
    case 'runtime':
      return styles.toneRuntime
    case 'capability':
      return styles.toneCapability
    default:
      return styles.toneTool
  }
}

function Node({ eyebrow, title, body, meta, tone, icon }: { eyebrow: string; title: string; body: string; meta: string; tone: Tone; icon: IconName }) {
  return (
    <div className={styles.node}>
      <div className={styles.top}>
        <span className={`${styles.icon} ${toneClassName(tone)}`}>
          <IconGlyph name={icon} />
        </span>
        <span className={styles.eyebrow}>{eyebrow}</span>
      </div>
      <strong className={styles.title}>{title}</strong>
      <p className={styles.body}>{body}</p>
      <span className={styles.metaChip}>{meta}</span>
    </div>
  )
}

function ArchitectureDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.glow} />
      <div className={styles.laneGrid}>
        <Node
          eyebrow="Action Layer"
          title="Tool Registry"
          body="Built-in tools, aliases, MCP entries, deferred tools, and runtime metadata live in one canonical inventory."
          meta="What the agent can attempt"
          tone="tool"
          icon="wrench"
        />
        <Node
          eyebrow="Model Layer"
          title="Provider Client"
          body="Anthropic, OpenAI, Ollama, Bedrock, Gemini, OpenRouter, Codex, and others are normalized into one message contract."
          meta="Who produces the model response"
          tone="provider"
          icon="server"
        />
        <Node
          eyebrow="Governance"
          title="Surface Builder + Permissions"
          body="Read-only flags, destructive checks, permission mode, tool-search deferral, and surface profiles filter the visible tool set."
          meta="What the model is actually allowed to see"
          tone="runtime"
          icon="shield"
        />
        <Node
          eyebrow="Capability Slots"
          title="Specialized Backends"
          body="Image generation, speech-to-text, and text-to-speech can use dedicated providers instead of sharing the reasoning model path."
          meta="Multimodal does not collapse into one vendor"
          tone="capability"
          icon="plug"
        />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hub}>
        <div className={styles.top}>
          <span className={`${styles.icon} ${styles.toneRuntime}`}>
            <IconGlyph name="layers" />
          </span>
          <span className={styles.eyebrow}>Join Point</span>
        </div>
        <strong className={styles.title}>One session loop joins both layers late</strong>
        <p className={styles.body}>
          Seshat first builds a governed tool surface, then routes the turn through the chosen provider adapter, then executes tool calls back through the runtime owner. That late join is why tools, permissions, MCP, memory, and providers can evolve independently without turning the runtime into framework glue.
        </p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.branchRow}>
        <div className={styles.branch}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneTool}`}>
              <IconGlyph name="search" />
            </span>
            <span className={styles.eyebrow}>Discovery Path</span>
          </div>
          <strong className={styles.title}>Deferred tools keep prompts smaller</strong>
          <p className={styles.body}>The runtime can hold back lower-priority or MCP-derived tools and expose them only through tool discovery when needed.</p>
        </div>
        <div className={styles.branch}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneProvider}`}>
              <IconGlyph name="spark" />
            </span>
            <span className={styles.eyebrow}>Routing Path</span>
          </div>
          <strong className={styles.title}>Provider fallback stays separate</strong>
          <p className={styles.body}>Vendor routing, retries, transport quirks, and model normalization stay on the provider side rather than leaking into the tool layer.</p>
        </div>
      </div>
    </div>
  )
}

function JoinFlowDiagram() {
  return (
    <div className={styles.flowBoard}>
      <div className={styles.flowRow}>
        <div className={styles.node}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneTool}`}><IconGlyph name="wrench" /></span>
            <span className={styles.eyebrow}>1. Inventory</span>
          </div>
          <strong className={styles.title}>Register tools and aliases</strong>
          <p className={styles.body}>Built-ins, MCP entries, and metadata exist before a turn starts.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.node}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneRuntime}`}><IconGlyph name="shield" /></span>
            <span className={styles.eyebrow}>2. Filter</span>
          </div>
          <strong className={styles.title}>Build the visible surface</strong>
          <p className={styles.body}>Permission rules, destructive checks, read-only flags, and profiles decide exposure.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.node}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneProvider}`}><IconGlyph name="server" /></span>
            <span className={styles.eyebrow}>3. Answer</span>
          </div>
          <strong className={styles.title}>Route through a provider</strong>
          <p className={styles.body}>The selected provider normalizes the request and returns the model response stream.</p>
        </div>
      </div>
      <div className={styles.flowRow}>
        <div className={styles.node}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneRuntime}`}><IconGlyph name="flow" /></span>
            <span className={styles.eyebrow}>4. Execute</span>
          </div>
          <strong className={styles.title}>Run tool calls in-path</strong>
          <p className={styles.body}>Tool calls come back through the orchestrator, not around it.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.node}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneCapability}`}><IconGlyph name="plug" /></span>
            <span className={styles.eyebrow}>5. Extend</span>
          </div>
          <strong className={styles.title}>Call capability slots if needed</strong>
          <p className={styles.body}>Image, audio, and other specialized paths do not have to share the core reasoning vendor.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.node}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneRuntime}`}><IconGlyph name="layers" /></span>
            <span className={styles.eyebrow}>6. Persist</span>
          </div>
          <strong className={styles.title}>Keep one coherent session state</strong>
          <p className={styles.body}>Messages, permission context, tool results, and memory stay under one runtime owner.</p>
        </div>
      </div>
    </div>
  )
}

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
        <h2 className={articleStyles.h2}>The Core Design Problem</h2>
        <p className={articleStyles.p}>
          A serious agent runtime cannot treat every external dependency as one vague bag of capabilities. A tool call is executable surface area with permissions, side effects, and local state. A provider is a model transport and normalization layer. When those two concerns are fused too early, routing, safety, multimodal backends, and prompt exposure all become harder to govern.
        </p>
        <ArchitectureDiagram />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Why The Separation Exists</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Tools are executable surface area</div>
            <p className={articleStyles.cardBody}>Filesystem access, shell execution, browser control, planning, memory, RAG, notebooks, agent delegation, and MCP are runtime-owned actions with permissions and side effects.</p>
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
          The mono-run loop assembles prompt context, builds the model-visible tool surface, chooses the provider adapter, executes tool calls through the orchestrator, persists state, and applies permission policy. That late join is what lets Seshat change vendors, add new tools, or harden permissions without redesigning the whole runtime contract.
        </p>
        <JoinFlowDiagram />
        <ol className={articleStyles.orderedList}>
          <li>The registry defines built-in tools, aliases, MCP extensions, and metadata.</li>
          <li>The surface builder filters what the model can actually see for the active session.</li>
          <li>The provider client normalizes the chosen provider into the runtime message contract.</li>
          <li>The loop routes reasoning and tool execution back through one runtime owner.</li>
          <li>Capability-specific backends can remain separate from the reasoning model path.</li>
        </ol>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>What This Unlocks Architecturally</h2>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>1</span>
            <span className={styles.summaryLabel}>Governed Prompt Surface</span>
            <p className={styles.summaryText}>The model sees the filtered tool surface, not the entire raw inventory.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>2</span>
            <span className={styles.summaryLabel}>Independent Routing</span>
            <p className={styles.summaryText}>Provider fallback and vendor quirks stay in the transport layer rather than leaking into tool execution.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>3</span>
            <span className={styles.summaryLabel}>Multimodal Flexibility</span>
            <p className={styles.summaryText}>Image and audio paths can evolve independently of the main reasoning model.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>4</span>
            <span className={styles.summaryLabel}>Extension Without Collapse</span>
            <p className={styles.summaryText}>MCP and deferred tools can extend the runtime without turning every integration into framework glue.</p>
          </div>
        </div>
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
          . If you want the SDK-side tool inventory and per-session shaping APIs, continue with{' '}
          <Link className={articleStyles.link} to="/docs/sdk/go-tools" state={{ from: location.pathname }}>
            Tools &amp; Surface
          </Link>
          .
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          Continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/agent-teams" state={{ from: location.pathname }}>
            Agent Teams and Mailboxes
          </Link>
          {' '}for persistent multi-agent coordination, or{' '}
          <Link className={articleStyles.link} to="/docs/concepts/skills-mcp" state={{ from: location.pathname }}>
            Skills and MCP
          </Link>
          {' '}for extensibility.
        </p>
      </section>
    </article>
  )
}
