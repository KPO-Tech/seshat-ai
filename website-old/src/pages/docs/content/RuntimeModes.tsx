import { Link, useLocation } from 'react-router-dom'
import articleStyles from './DocArticle.module.css'
import styles from './RuntimeModes.module.css'

type Tone = 'surface' | 'core' | 'mode'
type IconName =
  | 'terminal'
  | 'network'
  | 'cloud'
  | 'package'
  | 'cpu'
  | 'chat'
  | 'refresh'
  | 'play'
  | 'plan'
  | 'pair'
  | 'shield'
  | 'spark'
  | 'check'
  | 'branch'
  | 'lock'
  | 'filter'

type EntrySurface = {
  eyebrow: string
  title: string
  body: string
  code: string
  icon: IconName
}

type RuntimeModeCard = {
  title: string
  code: string
  body: string
  detail: string
  icon: IconName
}

type PermissionModeCard = {
  title: string
  code: string
  body: string
  detail: string
  icon: IconName
}

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'terminal':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 6 9 12 4 18" />
          <line x1="12" y1="18" x2="20" y2="18" />
        </svg>
      )
    case 'network':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M8 11l7.7-4" />
          <path d="M8 13l7.7 4" />
        </svg>
      )
    case 'cloud':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 18h10a4 4 0 0 0 .2-8 5.5 5.5 0 0 0-10.4-1.5A4 4 0 0 0 7 18z" />
        </svg>
      )
    case 'package':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l8 4.5v11L12 22 4 17.5v-11L12 2z" />
          <path d="M4 6.5L12 11l8-4.5" />
          <path d="M12 11v11" />
        </svg>
      )
    case 'cpu':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <rect x="10" y="10" width="4" height="4" rx="1" />
          <path d="M10 2v3M14 2v3M10 19v3M14 19v3M19 10h3M19 14h3M2 10h3M2 14h3" />
        </svg>
      )
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 18l-1.5 3L7 19h10a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v7a4 4 0 0 0 2 3z" />
        </svg>
      )
    case 'refresh':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6v5h-5" />
          <path d="M4 18v-5h5" />
          <path d="M7 18a8 8 0 0 0 12-5" />
          <path d="M17 6A8 8 0 0 0 5 11" />
        </svg>
      )
    case 'play':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'plan':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h12" />
          <path d="M8 12h12" />
          <path d="M8 18h12" />
          <circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'pair':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3" />
          <circle cx="16.5" cy="9.5" r="2.5" />
          <path d="M4.5 18a5.5 5.5 0 0 1 9 0" />
          <path d="M14 18a4 4 0 0 1 6 0" />
        </svg>
      )
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v6c0 5-3.2 7.8-7 9-3.8-1.2-7-4-7-9V6l7-3z" />
        </svg>
      )
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </svg>
      )
    case 'check':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )
    case 'branch':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M8 6h6" />
          <path d="M16 8v8" />
          <path d="M8 6v12h8" />
        </svg>
      )
    case 'lock':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )
    case 'filter':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />
        </svg>
      )
  }
}

function toneClassName(tone: Tone) {
  switch (tone) {
    case 'core':
      return styles.toneCore
    case 'mode':
      return styles.toneMode
    default:
      return styles.toneSurface
  }
}

function IconBadge({ icon, tone = 'surface' }: { icon: IconName; tone?: Tone }) {
  return (
    <span className={`${styles.iconBadge} ${toneClassName(tone)}`}>
      <IconGlyph name={icon} />
    </span>
  )
}

function RuntimeSurfaceMap() {
  const entrySurfaces: EntrySurface[] = [
    {
      eyebrow: 'CLI Surface',
      title: 'CLI App',
      body: 'The same binary exposes single-turn run, text chat, and interactive TUI chat.',
      code: 'cmd/cli',
      icon: 'terminal',
    },
    {
      eyebrow: 'Remote Surface',
      title: 'gRPC Server',
      body: 'A long-running service wraps the same SDK and streams runtime events over RPC.',
      code: 'cmd/grpc',
      icon: 'network',
    },
    {
      eyebrow: 'Product Surface',
      title: 'HTTP API',
      body: 'seshat-ai adds REST + SSE on top of the runtime for desktop and product integrations.',
      code: 'seshat-ai/cmd/api',
      icon: 'cloud',
    },
    {
      eyebrow: 'Embedded Surface',
      title: 'Go SDK',
      body: 'Applications can instantiate the runtime directly and keep full control of callbacks and wiring.',
      code: 'pkg/sdk',
      icon: 'package',
    },
  ]

  return (
    <div className={styles.surfaceBoard}>
      <div className={styles.boardGlow} />
      <div className={styles.surfaceRow}>
        {entrySurfaces.map((item) => (
          <div key={item.title} className={styles.surfaceCard}>
            <div className={styles.surfaceCardTop}>
              <IconBadge icon={item.icon} />
              <span className={styles.eyebrow}>{item.eyebrow}</span>
            </div>
            <strong className={styles.cardTitle}>{item.title}</strong>
            <p className={styles.cardBody}>{item.body}</p>
            <span className={styles.codeChip}>{item.code}</span>
          </div>
        ))}
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.surfaceCardTop}>
          <IconBadge icon="package" tone="core" />
          <span className={styles.eyebrow}>Shared Composition Boundary</span>
        </div>
        <strong className={styles.cardTitle}>sdk.Client</strong>
        <p className={styles.cardBody}>
          Providers, tools, permissions, browser, memory, persistence, hooks, storage, and monitoring are wired here once.
        </p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.coreRow}>
        <div className={styles.coreCard}>
          <IconBadge icon="cpu" tone="core" />
          <strong className={styles.cardTitle}>Engine</strong>
          <p className={styles.cardBody}>Owns long-lived runtime wiring and session creation.</p>
        </div>
        <div className={styles.coreConnector}><span /></div>
        <div className={styles.coreCard}>
          <IconBadge icon="chat" tone="core" />
          <strong className={styles.cardTitle}>Session</strong>
          <p className={styles.cardBody}>Owns transcript, tool surface, memory, and permission context.</p>
        </div>
        <div className={styles.coreConnector}><span /></div>
        <div className={styles.coreCard}>
          <IconBadge icon="refresh" tone="core" />
          <strong className={styles.cardTitle}>Loop</strong>
          <p className={styles.cardBody}>Runs the turn until a legitimate terminal state exists.</p>
        </div>
      </div>
    </div>
  )
}

function PermissionModeMap() {
  const permissionCards: PermissionModeCard[] = [
    {
      title: 'On Request',
      code: 'onRequest',
      body: 'Default interactive mode. The runtime asks when an action should be escalated to the user.',
      detail: 'Good default for real interactive work.',
      icon: 'shield',
    },
    {
      title: 'Auto',
      code: 'auto',
      body: 'The runtime attempts automatic approval through its classifier and safety pipeline.',
      detail: 'Fast when the action is judged safe enough to avoid user interruption.',
      icon: 'spark',
    },
    {
      title: 'Accept Edits',
      code: 'acceptEdits',
      body: 'Safe file operations inside the working directory can be approved automatically.',
      detail: 'Useful when local code edits should flow without repeated confirmations.',
      icon: 'check',
    },
    {
      title: 'Bypass',
      code: 'bypass',
      body: 'Permission checks are bypassed entirely.',
      detail: 'Powerful and dangerous. Mostly appropriate for tightly controlled automation paths.',
      icon: 'branch',
    },
    {
      title: 'Never',
      code: 'never',
      body: 'The runtime never asks the user. If approval would be needed, the action fails immediately.',
      detail: 'Designed for headless and background agents that cannot surface approval UI.',
      icon: 'lock',
    },
    {
      title: 'Granular',
      code: 'granular',
      body: 'Fine-grained approval policy where sandbox, rules, skills, and request_permissions prompts can be controlled independently.',
      detail: 'This is the most governance-oriented permission mode in the current code.',
      icon: 'filter',
    },
  ]

  return (
    <div className={styles.modeBoard}>
      <div className={styles.modeHeader}>
        <div>
          <span className={styles.modeBadge}>Permission Modes</span>
          <strong className={styles.modeTitle}>Permissions answer who approves and when.</strong>
        </div>
        <p className={styles.modeText}>
          The runtime keeps permissions inside execution. These modes do not define the transport surface, and they do not replace execution modes. They govern approval behavior around tool use.
        </p>
      </div>

      <div className={styles.modeGrid}>
        {permissionCards.map((item) => (
          <div key={item.code} className={styles.modeCard}>
            <div className={styles.modeCardTop}>
              <IconBadge icon={item.icon} tone="mode" />
              <span className={styles.codeChip}>{item.code}</span>
            </div>
            <strong className={styles.cardTitle}>{item.title}</strong>
            <p className={styles.cardBody}>{item.body}</p>
            <p className={styles.modeDetail}>{item.detail}</p>
          </div>
        ))}
      </div>

      <div className={styles.noticeRow}>
        <div className={styles.noticeCard}>
          <span className={styles.noticeTitle}>Execution and permissions combine</span>
          <p className={styles.noticeBody}>
            A session can be in <span className={articleStyles.inlineCode}>plan</span> mode while still remembering its previous approval mode in <span className={articleStyles.inlineCode}>PrePlanMode</span>. That is exactly why the code separates the two concerns.
          </p>
        </div>
        <div className={styles.noticeCard}>
          <span className={styles.noticeTitle}>Headless paths</span>
          <p className={styles.noticeBody}>
            Background agents and some automation flows tend to use <span className={articleStyles.inlineCode}>never</span> or carefully scoped <span className={articleStyles.inlineCode}>bypass</span>, because there is no interactive user there to answer prompts.
          </p>
        </div>
      </div>
    </div>
  )
}

function ExecutionModeMap() {
  const modeCards: RuntimeModeCard[] = [
    {
      title: 'Execute',
      code: 'execute',
      body: 'Default runtime behavior. Tools execute normally and the loop resolves real work end to end.',
      detail: 'This is the baseline mode represented by ExecutionModeExecute.',
      icon: 'play',
    },
    {
      title: 'Plan',
      code: 'plan',
      body: 'Tool execution is suspended. The runtime asks for a concrete plan instead of performing actions immediately.',
      detail: 'Plan files are tracked per session and approval mode is preserved separately.',
      icon: 'plan',
    },
    {
      title: 'Pair Programming',
      code: 'pair_programming',
      body: 'Tools still run, but the collaboration style becomes more interactive and suggestion-oriented.',
      detail: 'This is modeled as a distinct execution mode, not just a UI color change.',
      icon: 'pair',
    },
  ]

  return (
    <div className={styles.modeBoard}>
      <div className={styles.modeHeader}>
        <div>
          <span className={styles.modeBadge}>Execution Modes</span>
          <strong className={styles.modeTitle}>Modes change runtime behavior, not transport.</strong>
        </div>
        <p className={styles.modeText}>
          The session keeps a permission context with both approval mode and execution mode. That is why plan mode is no longer treated as a permission mode.
        </p>
      </div>

      <div className={styles.modeGrid}>
        {modeCards.map((item) => (
          <div key={item.code} className={styles.modeCard}>
            <div className={styles.modeCardTop}>
              <IconBadge icon={item.icon} tone="mode" />
              <span className={styles.codeChip}>{item.code}</span>
            </div>
            <strong className={styles.cardTitle}>{item.title}</strong>
            <p className={styles.cardBody}>{item.body}</p>
            <p className={styles.modeDetail}>{item.detail}</p>
          </div>
        ))}
      </div>

      <div className={styles.noticeRow}>
        <div className={styles.noticeCard}>
          <span className={styles.noticeTitle}>Important distinction</span>
          <p className={styles.noticeBody}>
            <span className={articleStyles.inlineCode}>onRequest</span>, <span className={articleStyles.inlineCode}>auto</span>, <span className={articleStyles.inlineCode}>never</span>, and <span className={articleStyles.inlineCode}>bypass</span> answer “who approves?”. <span className={articleStyles.inlineCode}>execute</span>, <span className={articleStyles.inlineCode}>plan</span>, and <span className={articleStyles.inlineCode}>pair_programming</span> answer “how does the agent behave?”.
          </p>
        </div>
        <div className={styles.noticeCard}>
          <span className={styles.noticeTitle}>About browse</span>
          <p className={styles.noticeBody}>
            The prompt layer already talks about <span className={articleStyles.inlineCode}>browse</span> as a useful behavior, but it is not yet exposed as a first-class execution-mode constant like the three modes above.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function RuntimeModes() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link to={base} className={articleStyles.breadLink}>Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link to={`${base}/concepts`} className={articleStyles.breadLink}>Concepts</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Runtime Modes</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Runtime Modes</h1>
        <p className={articleStyles.sub}>
          Runtime modes in Seshat are easiest to understand when you separate two axes that are often mixed together: the surface that hosts the runtime, and the execution mode that changes how the session behaves. The codebase already supports multiple entry surfaces, while the session model also tracks execution behavior such as <span className={articleStyles.inlineCode}>execute</span>, <span className={articleStyles.inlineCode}>plan</span>, and <span className={articleStyles.inlineCode}>pair_programming</span>.
        </p>
      </header>

      <section className={articleStyles.section}>
        <div className={articleStyles.callout}>
          <span className={articleStyles.calloutTitle}>Short version</span>
          <p className={articleStyles.calloutText}>
            A runtime mode is not just a UI choice. In Seshat, it can mean either a hosting surface like the CLI app, gRPC, HTTP API, or embedded Go SDK, or a session execution behavior like planning instead of executing. The same engine powers all of them, but not all of them change the runtime in the same way.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Two axes, not one list</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Entry surfaces</span>
            <p className={articleStyles.cardBody}>
              These are host environments and transport layers: <span className={articleStyles.inlineCode}>cmd/cli</span>, <span className={articleStyles.inlineCode}>cmd/grpc</span>, the HTTP API in <span className={articleStyles.inlineCode}>seshat-ai</span>, and direct embedding through <span className={articleStyles.inlineCode}>pkg/sdk</span>.
            </p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Execution modes</span>
            <p className={articleStyles.cardBody}>
              These are session behaviors carried in the permission context. They decide whether the agent executes, plans, or collaborates in pair-programming style.
            </p>
          </div>
        </div>
        <p className={articleStyles.p}>
          The practical consequence is important: a CLI app and a gRPC server are not two different engines. They are two surfaces over the same runtime. By contrast, <span className={articleStyles.inlineCode}>plan</span> is not a second surface at all. It is a behavioral mode inside the same session contract.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>1. One engine, multiple entry surfaces</h2>
        <RuntimeSurfaceMap />
        <p className={articleStyles.p}>
          This is the cleanest way to read the code. The CLI, the gRPC server, the product-layer HTTP API, and the embedded Go SDK all collapse into <span className={articleStyles.inlineCode}>sdk.Client</span>, which then wires the same engine, session, loop, providers, tools, memory, permissions, and persistence stack.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>2. The CLI app already contains its own local interaction modes</h2>
        <p className={articleStyles.p}>
          The CLI surface is more than one experience. In <span className={articleStyles.inlineCode}>cmd/cli/run.go</span>, <span className={articleStyles.inlineCode}>seshat chat</span> switches into the full TUI when stdout is a real terminal and <span className={articleStyles.inlineCode}>--no-tui</span> is not set. Otherwise it falls back to a text-mode chat loop. Separate from both, <span className={articleStyles.inlineCode}>seshat run</span> is a single-turn, non-interactive execution path.
        </p>
        <ul className={articleStyles.list}>
          <li><span className={articleStyles.inlineCode}>chat + TUI</span>: interactive terminal application with session browser, settings, MCP, provider switching, and richer runtime events.</li>
          <li><span className={articleStyles.inlineCode}>chat + text mode</span>: simpler interactive loop for shells, pipes, and non-TTY environments.</li>
          <li><span className={articleStyles.inlineCode}>run</span>: one prompt in, one completed turn out, useful for scripts and direct automation.</li>
        </ul>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>3. gRPC and HTTP are server surfaces over the same core</h2>
        <p className={articleStyles.p}>
          The gRPC server in <span className={articleStyles.inlineCode}>cmd/grpc/main.go</span> does not implement a different runtime. It builds an SDK client for each request, persists sessions, optionally resumes by context ID, supports both unary and streaming query paths, and can restrict the live tool surface per request.
        </p>
        <p className={articleStyles.p}>
          The HTTP API in <span className={articleStyles.inlineCode}>seshat-ai/cmd/api/main.go</span> follows the same idea from the product layer. It bootstraps an application using the Seshat runtime, then exposes REST and SSE endpoints for desktop and other clients. This means the product layer is not a parallel engine. It is another host over the same runtime foundation.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>4. Embedded mode is the most direct developer surface</h2>
        <p className={articleStyles.p}>
          For developers, the embedded runtime is the most explicit form. <span className={articleStyles.inlineCode}>sdk.NewClient()</span> constructs the provider client, orchestrator, compactor, prompt assembler, permission engine, registry, browser manager, memory services, monitoring, and session store. If you embed Seshat this way, you do not re-create the engine logic yourself. You host it directly.
        </p>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Callbacks</span>
            <p className={articleStyles.cardBody}>Hosts can subscribe to chunks, tool progress, runtime events, and session title generation without forking the loop.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Prompt control</span>
            <p className={articleStyles.cardBody}>Apps can set <span className={articleStyles.inlineCode}>PromptConfig</span>, including stage overlays such as plan mode.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Tool and MCP wiring</span>
            <p className={articleStyles.cardBody}>Tool registries, MCP servers, browser managers, storage backends, and long-term memory are composed through the client config.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>5. Permission modes are part of the same runtime contract</h2>
        <PermissionModeMap />
        <p className={articleStyles.p}>
          Permission modes are stored in the same session context as execution modes, but they answer a different question. They define who approves actions, what can be auto-approved, and how the runtime behaves when user interaction is impossible.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>6. Execution modes are session behavior</h2>
        <ExecutionModeMap />
        <p className={articleStyles.p}>
          In the runtime model, execution modes live inside the session permission context. That is why the engine can preserve approval state while switching the behavior of the agent. It is also why restored sessions can come back in plan mode instead of silently dropping that context.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>7. Plan mode is no longer a permission mode</h2>
        <p className={articleStyles.p}>
          This distinction is now explicit in the code. The CLI parser rejects <span className={articleStyles.inlineCode}>plan</span> as a permission mode and tells you it is now an execution mode instead. The session permission context stores <span className={articleStyles.inlineCode}>Mode</span> for approval behavior and <span className={articleStyles.inlineCode}>ExecutionMode</span> for runtime behavior.
        </p>
        <ul className={articleStyles.list}>
          <li>Approval mode answers: should this action be auto-approved, denied, or asked?</li>
          <li>Execution mode answers: should this turn execute, plan, or collaborate?</li>
          <li>Exiting plan mode restores the previous approval mode instead of flattening everything into one flag.</li>
        </ul>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>8. What is fully shipped versus still emerging</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Shipped surfaces</span>
            <p className={articleStyles.cardBody}>CLI app, gRPC service, embedded Go SDK, and the HTTP API built in <span className={articleStyles.inlineCode}>seshat-ai</span>.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Shipped execution modes</span>
            <p className={articleStyles.cardBody}><span className={articleStyles.inlineCode}>execute</span>, <span className={articleStyles.inlineCode}>plan</span>, and <span className={articleStyles.inlineCode}>pair_programming</span> are represented directly in the code.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Emerging behavior</span>
            <p className={articleStyles.cardBody}><span className={articleStyles.inlineCode}>browse</span> already appears in prompts and guidance, but it is not yet exposed at the same maturity level as the formal execution-mode constants.</p>
          </div>
        </div>
        <p className={articleStyles.p}>
          That is the honest state of the project today. The architecture is already capable of hosting several surfaces and several behavior patterns, but not every planned runtime behavior should be documented as if it were already fully stabilized.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Why this matters</h2>
        <p className={articleStyles.p}>
          If you do not separate surfaces from behavior, the runtime becomes hard to reason about. You start treating a TUI, an API server, and a planning stage as if they were the same category. Seshat becomes clearer when you keep the hierarchy strict: one runtime core, several host surfaces, and explicit per-session behavior modes.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Next concept</h2>
        <p className={articleStyles.p}>
          Once runtime modes are clear, the next technical question is how long-running work stays coherent when context grows, history accumulates, and retrieval becomes necessary.
        </p>
        <div className={articleStyles.actionRow}>
          <Link to={`${base}/concepts/what-is-seshat`} className={articleStyles.secondaryLink}>What is Seshat?</Link>
          <Link to={`${base}/concepts/mono-run`} className={articleStyles.secondaryLink}>Mono-Run Architecture</Link>
          <Link to={`${base}/concepts/memory-rag`} className={articleStyles.primaryLink}>Memory and RAG</Link>
        </div>
      </section>
    </div>
  )
}
