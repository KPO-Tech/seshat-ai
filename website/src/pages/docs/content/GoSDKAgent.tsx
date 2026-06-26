import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './SDKPromptDocs.module.css'

type Tone = 'agent' | 'prompt' | 'runtime' | 'context'
type IconName = 'user' | 'stack' | 'shield' | 'spark' | 'flow' | 'layers'

type AgentSurfaceRow = {
  api: string
  scope: string
  purpose: string
  effect: string
  notes: string
}

type InternalProfileRow = {
  field: string
  typ: string
  meaning: string
  status: string
}

const CLIENT_PERSONA = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey:         os.Getenv("ANTHROPIC_API_KEY"),
    WorkingDir:     "/workspace/acme-backend",
    PermissionMode: sdk.PermissionModeOnRequest,
    SystemPromptTemplate: \`You are Acme's backend engineering agent.

Your priorities:
- Make minimal, correct changes.
- Prefer existing project conventions.
- Explain tradeoffs when there is real ambiguity.
- Do not invent APIs or behavior.\`,
})`

const SESSION_ROLE = `session, err := client.CreateSession(ctx)
if err != nil {
    log.Fatal(err)
}
defer session.Close()

session.SetSystemPromptTemplate(\`You are Mira, a code review agent.
- Prioritize correctness, regressions, and missing tests.
- Keep summaries short and concrete.\`)

session.SetAppendSystemPrompt(\`Repository policy:
- Findings first.
- No patching unless the caller explicitly asks.\`)

resp, err := session.SubmitMessage(ctx, "Review the recent authentication refactor.")
if err != nil {
    log.Fatal(err)
}

fmt.Println(resp.TotalTokens)`

const AGENT_PRESET = `type AgentPreset struct {
    Name         string
    Role         string
    Persona      string
    Context      string
}

func NewAgentSession(ctx context.Context, client *sdk.Client, preset AgentPreset) (*sdk.Session, error) {
    session, err := client.CreateSession(ctx)
    if err != nil {
        return nil, err
    }

    session.SetSystemPromptTemplate(fmt.Sprintf(
        "You are %s, a %s.\n\n%s",
        preset.Name,
        preset.Role,
        preset.Persona,
    ))

    if preset.Context != "" {
        session.SetAppendSystemPrompt(preset.Context)
    }

    return session, nil
}`

const CLIENT_POOL = `reviewClient, _ := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{Provider: sdk.APIProviderAnthropic, Model: "claude-sonnet-4-20250514"},
    APIKey: os.Getenv("ANTHROPIC_API_KEY"),
    SystemPromptTemplate: "You are the code review runtime.",
})

researchClient, _ := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{Provider: sdk.APIProviderOpenAI, Model: "gpt-5.5"},
    APIKey: os.Getenv("OPENAI_API_KEY"),
    SystemPromptTemplate: "You are the research runtime.",
})`

const AGENT_SURFACE_ROWS: AgentSurfaceRow[] = [
  {
    api: 'ClientConfig.Model',
    scope: 'client',
    purpose: 'Chooses the default reasoning provider and model for that embedded runtime.',
    effect: 'All sessions opened from the client inherit the same model path.',
    notes: 'There is no public session-level model override in the current SDK surface.',
  },
  {
    api: 'ClientConfig.PermissionMode',
    scope: 'client',
    purpose: 'Defines how the agent gets approval for risky actions.',
    effect: 'Changes the operational behavior of every session created by that client.',
    notes: 'This is part of agent behavior even though it is runtime policy rather than prompt text.',
  },
  {
    api: 'ClientConfig.WorkingDir',
    scope: 'client',
    purpose: 'Defines the repository or workspace root the agent operates from.',
    effect: 'Affects runtime context, project instructions discovery, and tool execution paths.',
    notes: 'Use different clients when roles should live in different roots by default.',
  },
  {
    api: 'ClientConfig.SystemPromptTemplate',
    scope: 'client',
    purpose: 'Defines the base persona and standing instructions for the embedded agent.',
    effect: 'Becomes the default system prompt template for every session unless overridden.',
    notes: 'Best fit for one-role runtimes such as review agent, research agent, or support agent.',
  },
  {
    api: 'PromptConfig.AppendSystemPrompt',
    scope: 'client',
    purpose: 'Adds stable business or domain context on top of the base persona.',
    effect: 'Appends shared organization rules every turn without replacing the core persona.',
    notes: 'Use for company policy, product constraints, or compliance context.',
  },
  {
    api: 'PromptConfig.ToolHints',
    scope: 'client',
    purpose: 'Biases how the agent should use selected tools.',
    effect: 'Appends extra provider-facing guidance to chosen tool descriptions.',
    notes: 'This shapes behavior without forcing a full prompt rewrite.',
  },
  {
    api: 'Session.SetSystemPromptTemplate',
    scope: 'session',
    purpose: 'Replaces the base persona for one run.',
    effect: 'Lets one shared client create many different role-specific agents.',
    notes: 'Passing an empty string clears the session override.',
  },
  {
    api: 'Session.SetAppendSystemPrompt',
    scope: 'session',
    purpose: 'Attaches run-specific assignment context or constraints.',
    effect: 'Keeps the role the same while changing the mission context for one session.',
    notes: 'Use this for release window details, tenant context, or task-specific rules.',
  },
  {
    api: 'Session.SetWorkingDirectory',
    scope: 'session',
    purpose: 'Moves one agent session into a different workspace root.',
    effect: 'Updates runtime context, file tools, and project-instruction lookup for that run.',
    notes: 'Useful when the same app-level role operates across multiple repositories.',
  },
]

const INTERNAL_PROFILE_ROWS: InternalProfileRow[] = [
  {
    field: 'ID',
    typ: 'string',
    meaning: 'Stable UUID for a persistent team member identity.',
    status: 'Internal runtime concept today, not the primary public Go SDK integration surface.',
  },
  {
    field: 'Nickname',
    typ: 'string',
    meaning: 'Human-facing name injected into the persona prompt.',
    status: 'Useful for understanding the long-term team runtime direction.',
  },
  {
    field: 'Role',
    typ: 'string',
    meaning: 'Routing tag such as researcher, engineer, or manager.',
    status: 'Used by dispatcher and mailbox-based team coordination internally.',
  },
  {
    field: 'TeamID',
    typ: 'string',
    meaning: 'Associates the profile with a named persistent team.',
    status: 'Concept/runtime-level field, not a top-level Go SDK app setting yet.',
  },
  {
    field: 'SystemPromptTemplate',
    typ: 'string',
    meaning: 'Base persona template for that persistent team member.',
    status: 'This is conceptually aligned with SDK persona shaping, but not exposed as the same public type.',
  },
  {
    field: 'Model',
    typ: 'string',
    meaning: 'Preferred model in provider:model format.',
    status: 'Internal profile preference; embedded SDK apps currently handle this with separate clients or client pools.',
  },
  {
    field: 'Skills',
    typ: '[]string',
    meaning: 'Preloaded skill names attached to the persistent profile.',
    status: 'Runtime-team feature direction rather than a first-class public SDK persona field.',
  },
  {
    field: 'Metadata',
    typ: 'map[string]string',
    meaning: 'Extension attributes for domain-specific behavior.',
    status: 'Internal extensibility point for future richer team profiles.',
  },
]

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'user':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="8" r="4" />
        </svg>
      )
    case 'stack':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="5" width="14" height="4" rx="1.5" />
          <rect x="5" y="10" width="14" height="4" rx="1.5" />
          <rect x="5" y="15" width="14" height="4" rx="1.5" />
        </svg>
      )
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v5c0 4.7-2.8 7.9-7 10-4.2-2.1-7-5.3-7-10V6l7-3z" />
        </svg>
      )
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
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
    case 'layers':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
        </svg>
      )
  }
}

function toneClassName(tone: Tone) {
  switch (tone) {
    case 'prompt':
      return styles.tonePrompt
    case 'runtime':
      return styles.toneRuntime
    case 'context':
      return styles.toneContext
    default:
      return styles.toneAgent
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

function AgentRuntimeDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.glow} />
      <div className={styles.laneGrid}>
        <Node
          eyebrow="App Layer"
          title="Your agent catalog"
          body="Your product defines named roles, tenancy, policies, and reusable persona presets."
          meta="What your app owns"
          tone="agent"
          icon="user"
        />
        <Node
          eyebrow="Runtime Layer"
          title="sdk.Client defaults"
          body="Model, working directory, permissions, memory, tools, and the base persona live on the client."
          meta="What the shared runtime owns"
          tone="runtime"
          icon="stack"
        />
        <Node
          eyebrow="Session Layer"
          title="Per-run role override"
          body="A session can replace the persona, append mission context, and even switch the working directory for one run."
          meta="How one client creates many agents"
          tone="prompt"
          icon="flow"
        />
        <Node
          eyebrow="Execution Layer"
          title="Mono-run execution"
          body="The resulting agent still executes through one governed runtime: prompt, tool surface, permissions, memory, and provider path stay coherent."
          meta="What actually runs"
          tone="context"
          icon="spark"
        />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hub}>
        <div className={styles.top}>
          <span className={`${styles.icon} ${styles.toneRuntime}`}>
            <IconGlyph name="layers" />
          </span>
          <span className={styles.eyebrow}>Embedded Agent Pattern</span>
        </div>
        <strong className={styles.title}>In the current public SDK, an agent is a persona plus runtime policy plus session context</strong>
        <p className={styles.body}>
          There is no single exported Agent object that you must construct first. The public boundary is simpler and more composable: define a base runtime, then shape role behavior through prompt and session overrides.
        </p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.branchRow}>
        <div className={styles.branch}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.tonePrompt}`}>
              <IconGlyph name="shield" />
            </span>
            <span className={styles.eyebrow}>Model Boundary</span>
          </div>
          <strong className={styles.title}>Different roles, same client</strong>
          <p className={styles.body}>Use session overrides when the model, tools, and runtime policy can stay shared but the persona or task context changes.</p>
        </div>
        <div className={styles.branch}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneAgent}`}>
              <IconGlyph name="user" />
            </span>
            <span className={styles.eyebrow}>Client Pool Pattern</span>
          </div>
          <strong className={styles.title}>Different model, different client</strong>
          <p className={styles.body}>If one role should use a different provider, default permission policy, or root path, build a dedicated client for that role instead of fighting session-level state.</p>
        </div>
      </div>
    </div>
  )
}

function AgentSurfaceTable() {
  return (
    <DocTable variant="balanced" className={styles.fixedTable}>
      <colgroup>
        <col className={styles.surfaceColApi} />
        <col className={styles.surfaceColScope} />
        <col className={styles.surfaceColPurpose} />
        <col className={styles.surfaceColEffect} />
        <col className={styles.surfaceColNotes} />
      </colgroup>
      <thead>
        <tr>
          <th>API surface</th>
          <th>Scope</th>
          <th>Purpose</th>
          <th>Runtime effect</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {AGENT_SURFACE_ROWS.map(row => (
          <tr key={row.api}>
            <td className={styles.wrapCodeCell}>{row.api}</td>
            <td>{row.scope}</td>
            <td>{row.purpose}</td>
            <td>{row.effect}</td>
            <td className={styles.noteCell}>{row.notes}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function InternalProfileTable() {
  return (
    <DocTable variant="balanced" className={styles.fixedTable}>
      <colgroup>
        <col className={styles.profileColField} />
        <col className={styles.profileColType} />
        <col className={styles.profileColMeaning} />
        <col className={styles.profileColStatus} />
      </colgroup>
      <thead>
        <tr>
          <th>Field</th>
          <th>Type</th>
          <th>Meaning</th>
          <th>Status for Go SDK users</th>
        </tr>
      </thead>
      <tbody>
        {INTERNAL_PROFILE_ROWS.map(row => (
          <tr key={row.field}>
            <td className={styles.monoCell}>{row.field}</td>
            <td className={styles.monoCell}>{row.typ}</td>
            <td>{row.meaning}</td>
            <td className={styles.noteCell}>{row.status}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function GoSDKAgent() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/sdk">SDK and API</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/sdk/go">Go SDK</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Agent</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Agent</h1>
        <p className={articleStyles.sub}>
          In the current public Go SDK, an embedded agent is defined by runtime defaults plus prompt shaping plus session overrides. This page shows the clean patterns for building named agent roles in your own product without inventing an abstraction the SDK does not actually require.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>The Public SDK Model</h2>
        <p className={articleStyles.p}>
          The Go SDK does not force you through a heavyweight exported <span className={articleStyles.inlineCode}>Agent</span> type before you can run anything. The real integration surface is more direct: configure a <span className={articleStyles.inlineCode}>sdk.Client</span>, then create sessions and shape role behavior through prompt and runtime overrides.
        </p>
        <AgentRuntimeDiagram />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Base Persona At Client Level</h2>
        <p className={articleStyles.p}>
          Use <span className={articleStyles.inlineCode}>ClientConfig.SystemPromptTemplate</span> when one runtime instance is fundamentally one role. This is the right pattern for a review runtime, a support runtime, a repository migration runtime, or a research runtime.
        </p>
        <DocCodeBlock code={CLIENT_PERSONA} label="Client-level persona" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Role Variation At Session Level</h2>
        <p className={articleStyles.p}>
          The better scaling pattern for multi-role applications is one shared client and many sessions. Each session can change persona and assignment context without rebuilding the provider, tool registry, memory system, or permission engine from scratch.
        </p>
        <DocCodeBlock code={SESSION_ROLE} label="Role-specific session" language="go" />
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Practical Rule</div>
          <p className={articleStyles.calloutText}>
            If only the role or mission changes, keep one shared client. If the model, root path, or default permission policy changes materially, create a dedicated client for that role.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Agent Parameters In Practice</h2>
        <p className={articleStyles.p}>
          These are the surfaces that actually define an embedded agent today. This table is intentionally practical: it focuses on the parameters and methods that change behavior for Go SDK integrations.
        </p>
        <AgentSurfaceTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Own Your Agent Catalog In App Code</h2>
        <p className={articleStyles.p}>
          Your product should usually own its role catalog instead of waiting for the runtime to expose one perfect universal type. Keep a thin preset struct on your side and translate it into session overrides when a run starts.
        </p>
        <DocCodeBlock code={AGENT_PRESET} label="Agent preset helper" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>When To Use A Client Pool</h2>
        <p className={articleStyles.p}>
          There is no public session-level model switch in the current SDK. If one role should use a different provider or a cheaper local model while another role uses a premium reasoning model, model separation belongs at the client layer.
        </p>
        <DocCodeBlock code={CLIENT_POOL} label="Role-specific client pool" language="go" />
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>1</span>
            <span className={styles.summaryLabel}>Shared client</span>
            <p className={styles.summaryText}>Best when only persona or mission context changes.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>2</span>
            <span className={styles.summaryLabel}>Client pool</span>
            <p className={styles.summaryText}>Best when provider, model, or default runtime policy differs by role.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>3</span>
            <span className={styles.summaryLabel}>Team runtime</span>
            <p className={styles.summaryText}>Persistent mailbox-based profiles are the deeper runtime level, not the first embedding API.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Internal Team-Agent Model Behind The Scenes</h2>
        <p className={articleStyles.p}>
          The repository already contains a richer persistent team model built around <span className={articleStyles.inlineCode}>AgentProfile</span>, mailboxes, and dispatching. It matters conceptually because it shows the long-term direction, but it is not the main public Go SDK contract for embedded product developers today.
        </p>
        <InternalProfileTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          Continue with{' '}
          <Link className={articleStyles.link} to="/docs/sdk/prompt" state={{ from: location.pathname }}>
            Prompt
          </Link>
          {' '}for the full prompt architecture and override matrix,{' '}
          <Link className={articleStyles.link} to="/docs/sdk/providers" state={{ from: location.pathname }}>
            Providers &amp; Auth
          </Link>
          {' '}for model wiring, or{' '}
          <Link className={articleStyles.link} to="/docs/concepts/agent-teams" state={{ from: location.pathname }}>
            Agent Teams and Mailboxes
          </Link>
          {' '}for the persistent team runtime level.
        </p>
      </section>
    </article>
  )
}
