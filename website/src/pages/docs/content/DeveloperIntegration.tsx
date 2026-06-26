import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocOnPageNav from './DocOnPageNav'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './DeveloperIntegration.module.css'

type Tone = 'host' | 'runtime' | 'ops'
type IconName = 'window' | 'server' | 'network' | 'shield' | 'cpu' | 'chat' | 'database' | 'spark'

type NavItem = {
  id: string
  label: string
}

type ReferenceRow = {
  name: string
  type?: string
  behavior?: string
  notes: string
}

const ON_PAGE: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Integration Map' },
  { id: 'seams', label: 'Public Seams' },
  { id: 'desktop', label: 'Desktop / Operator App' },
  { id: 'backend', label: 'Backend / Multi-User' },
  { id: 'streaming', label: 'Streaming UX' },
  { id: 'governance', label: 'Governance & Hooks' },
  { id: 'storage', label: 'Storage & Artifacts' },
  { id: 'boundary', label: 'When To Use gRPC' },
]

const SEAM_ROWS: ReferenceRow[] = [
  {
    name: 'CredentialResolver + OAuthDeviceFlow',
    type: 'Auth seam',
    behavior: 'Inject per-user or persisted provider credentials at client creation time.',
    notes: 'This is the clean bridge for desktop login flows, multi-user backends, Codex/OpenAI OAuth, and vault-backed provider routing.',
  },
  {
    name: 'SessionStore / SessionBackend / SessionSQLitePath',
    type: 'State seam',
    behavior: 'Persist and resume runtime sessions.',
    notes: 'Use filesystem, SQLite, or a custom backend adapter depending on whether the host is local, server-side, or shared across workers.',
  },
  {
    name: 'ResponseChunkFn / RuntimeEventFn / ProgressFn',
    type: 'Live UX seam',
    behavior: 'Observe text deltas, structured runtime events, and tool progress.',
    notes: 'These callbacks are the main bridge for live UIs, logs, operator consoles, and server-side streaming.',
  },
  {
    name: 'SetAppendSystemPrompt / PromptConfig / CreateSessionWithAdditional',
    type: 'Product context seam',
    behavior: 'Inject product-specific context, metadata, and prompt shaping without forking the runtime.',
    notes: 'Use this for tenant, channel, workspace, persona, product mode, and task-context enrichment.',
  },
  {
    name: 'PermissionMode + tool surface shaping',
    type: 'Governance seam',
    behavior: 'Decide whether the host is interactive, trusted, or locked down.',
    notes: 'Combine client-level defaults with per-session permission changes and tool unregistration for safer product profiles.',
  },
  {
    name: 'PreToolHooks / AddToolHook / RegisterHook',
    type: 'Policy seam',
    behavior: 'Attach host-side policies before and around execution.',
    notes: 'Use shell guards for practical policy enforcement and lifecycle hooks for runtime telemetry or side effects.',
  },
  {
    name: 'StorageConfig / ArtifactStore / BrowserRemoteControlURL',
    type: 'Infra seam',
    behavior: 'Control where web, browser, screenshot, and other artifacts live.',
    notes: 'Important for enterprise persistence, browser tooling, remote browser control, and artifact retention management.',
  },
  {
    name: 'GetMonitoring / MonitoringSystem',
    type: 'Observability seam',
    behavior: 'Export runtime metrics snapshots.',
    notes: 'Useful for dashboards, health surfaces, operator insight, and internal telemetry pipelines.',
  },
]

const DECISION_ROWS: ReferenceRow[] = [
  {
    name: 'Go SDK in-process',
    behavior: 'Best when your host is already in Go and needs full runtime control.',
    notes: 'Choose this for desktop apps, Go backends, internal tools, automation workers, and product features that need session, prompt, tool, and permission control together.',
  },
  {
    name: 'gRPC server boundary',
    behavior: 'Best when the runtime should live in a separate process.',
    notes: 'Choose this for non-Go stacks, service isolation, language-agnostic clients, or when the runtime should be managed independently of the product API layer.',
  },
  {
    name: 'automation package',
    behavior: 'Best when the product feature is really a background job.',
    notes: 'Choose this for stateless recurring workflows. Do not force conversational product flows into automation if they need durable sessions or interactive governance.',
  },
  {
    name: 'mailboxes / agent teams',
    behavior: 'Best when work must move between named agents over time.',
    notes: 'Choose this when the integration target is closer to a durable multi-agent operating surface than a single embedded assistant session.',
  },
]

const DESKTOP_HOST = `flow, err := sdk.NewOAuthDeviceFlow(sdk.OAuthDeviceFlowConfig{
    Provider: string(sdk.APIProviderCodex),
    Persist:  true,
})
if err != nil {
    log.Fatal(err)
}

challenge, err := flow.Start(ctx)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Open %s and enter code %s\\n", challenge.VerificationURL, challenge.UserCode)
_, err = flow.Wait(ctx, challenge)
if err != nil {
    log.Fatal(err)
}

client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderCodex,
        Model:    "gpt-5.3-codex",
    },
    CredentialResolver: flow.CredentialResolver(),
    PersistSessions:    true,
    SessionSQLitePath:  filepath.Join(appDataDir, "seshat-runtime.sqlite"),
    WorkingDir:         projectRoot,
    PermissionMode:     sdk.PermissionModeOnRequest,
    EnableMemory:       true,
    OnSessionTitled: func(id sdk.SessionID, title string) {
        ui.UpdateSessionTitle(string(id), title)
    },
    ResponseChunkFn: func(chunk sdk.ResponseChunk) {
        if chunk.Type == sdk.ResponseChunkTypeContentBlockDelta {
            ui.AppendDelta(chunk.Delta)
        }
    },
    RuntimeEventFn: func(event sdk.RuntimeEvent) {
        ui.HandleRuntimeEvent(event)
    },
})
if err != nil {
    log.Fatal(err)
}`

const BACKEND_HOST = `type TenantResolver struct {
    Store CredentialStore
    UserID string
}

func (r TenantResolver) ResolveAPIKey(ctx context.Context, provider string) (string, error) {
    return r.Store.LookupProviderKey(ctx, r.UserID, provider)
}

client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    CredentialResolver: TenantResolver{
        Store: credentialStore,
        UserID: authUser.ID,
    },
    SessionSQLitePath: filepath.Join(runtimeRoot, "runtime.sqlite"),
    WorkingDir:        filepath.Join(runtimeRoot, "workspaces", authUser.ID),
    PermissionMode:    sdk.PermissionModeNever,
    PersistSessions:   true,
    EnableMemory:      true,
    MCPServers:        mcpServers,
})
if err != nil {
    return err
}
defer client.Close()

session, err := client.CreateSessionWithAdditional(ctx, map[string]any{
    "tenant_id": authUser.TenantID,
    "user_id":   authUser.ID,
    "source":    "billing-api",
})
if err != nil {
    return err
}
defer session.Close()

session.SetAppendSystemPrompt("You are the billing operations assistant for this workspace.")
session.SetWorkingDirectory(filepath.Join(runtimeRoot, "workspaces", authUser.ID, string(session.GetID())))

for _, blocked := range []string{"bash", "write_file", "edit_file", "apply_patch"} {
    _ = session.UnregisterTool(blocked)
}

resp, err := session.SubmitMessage(ctx, request.Prompt)
if err != nil {
    return err
}

_ = resp`

const STREAMING_HOST = `session, err := client.LoadSessionWithAdditional(ctx, sessionID, map[string]any{
    "request_id": requestID,
    "surface":    "dashboard-live",
})
if err != nil {
    return err
}
defer session.Close()

session.SetResponseChunkFn(func(chunk sdk.ResponseChunk) {
    if chunk.Type == sdk.ResponseChunkTypeContentBlockDelta {
        broadcaster.PublishDelta(session.GetID(), chunk.Delta)
    }
})

session.SetRuntimeEventFn(func(event sdk.RuntimeEvent) {
    broadcaster.PublishEvent(session.GetID(), event)
})

session.SetProgressFn(func(progress sdk.ToolProgress) {
    broadcaster.PublishToolProgress(session.GetID(), progress)
})

resp, err := session.SubmitMessage(ctx, prompt)
if err != nil {
    return err
}

broadcaster.PublishFinal(session.GetID(), resp.StopReason, resp.TotalTokens)`

const GOVERNANCE_HOST = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey:         os.Getenv("ANTHROPIC_API_KEY"),
    PermissionMode: sdk.PermissionModeOnRequest,
    PreToolHooks: []sdk.PreToolHookConfig{
        {
            Matcher: "bash|write_file|edit_file|apply_patch",
            Command: "./scripts/pre_tool_guard.sh",
            Timeout: 5,
        },
    },
})
if err != nil {
    log.Fatal(err)
}

client.RegisterHook(sdk.HookEventTurnEnd, func(ctx context.Context, progress sdk.HookProgress) (*sdk.HookResult, error) {
    log.Printf("turn_end: %s", progress.Message)
    return nil, nil
})`

const STORAGE_HOST = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderOpenAI,
        Model:    "gpt-5.5",
    },
    APIKey: os.Getenv("OPENAI_API_KEY"),
    StorageConfig: &sdk.StorageConfig{
        Provider:          sdk.StorageProviderS3,
        S3Endpoint:        os.Getenv("S3_ENDPOINT"),
        S3Bucket:          os.Getenv("S3_BUCKET"),
        S3AccessKeyID:     os.Getenv("S3_ACCESS_KEY_ID"),
        S3SecretAccessKey: os.Getenv("S3_SECRET_ACCESS_KEY"),
        S3Region:          os.Getenv("S3_REGION"),
        S3KeyPrefix:       "seshat/artifacts",
    },
    StorageGCEnabled:  true,
    StorageGCInterval: time.Hour,
    StorageGCLimit:    256,
    StorageGCNamespaces: []string{
        string(sdk.NamespaceWebArtifacts),
        string(sdk.NamespaceBrowserDownloads),
    },
    BrowserRemoteControlURL: os.Getenv("SESHAT_BROWSER_REMOTE_CONTROL_URL"),
})
if err != nil {
    log.Fatal(err)
}

artifactStore := client.GetArtifactStore()
metrics, _ := client.GetMonitoring().GetMetricsSnapshot("json")
_, _ = artifactStore, metrics`

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'window':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="8" y1="4" x2="8" y2="20" />
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
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v6c0 5-3.2 7.8-7 9-3.8-1.2-7-4-7-9V6l7-3z" />
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
    case 'database':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="7" ry="3" />
          <path d="M5 5v10c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
          <path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" />
        </svg>
      )
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </svg>
      )
    default:
      return null
  }
}

function toneClassName(tone: Tone) {
  switch (tone) {
    case 'runtime':
      return styles.toneRuntime
    case 'ops':
      return styles.toneOps
    default:
      return styles.toneHost
  }
}

function IconBadge({ icon, tone }: { icon: IconName; tone: Tone }) {
  return (
    <span className={`${styles.iconBadge} ${toneClassName(tone)}`}>
      <IconGlyph name={icon} />
    </span>
  )
}

function IntegrationMapDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.entryGrid}>
        <div className={`${styles.entryCard} ${styles.entryCardHost}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="window" tone="host" />
            <span className={styles.eyebrow}>Local surface</span>
          </div>
          <strong className={styles.cardTitle}>Desktop app or operator console</strong>
          <p className={styles.cardBody}>The runtime lives inside the local product process and can expose streaming, approvals, session titles, and project-aware workspaces directly to the UI.</p>
        </div>

        <div className={`${styles.entryCard} ${styles.entryCardOps}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="server" tone="ops" />
            <span className={styles.eyebrow}>Service surface</span>
          </div>
          <strong className={styles.cardTitle}>Backend, worker, or platform service</strong>
          <p className={styles.cardBody}>The host injects credentials, persistence, governance, and storage while the runtime stays the execution core behind one or many product APIs.</p>
        </div>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <IconBadge icon="cpu" tone="runtime" />
          <span className={styles.eyebrow}>Embedding core</span>
        </div>
        <strong className={styles.cardTitle}>sdk.Client is the runtime integration boundary</strong>
        <p className={styles.cardBody}>Auth, session persistence, callbacks, prompt shaping, tool surface, memory, monitoring, MCP, multimodal providers, and browser/artifact infrastructure all converge on one client contract.</p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.flowRow}>
        <div className={styles.flowCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="chat" tone="runtime" />
            <span className={styles.eyebrow}>Session layer</span>
          </div>
          <strong className={styles.cardTitle}>Persistent or ephemeral sessions</strong>
          <p className={styles.cardBody}>The host can create, resume, annotate, and reshape sessions without reimplementing the engine loop.</p>
        </div>

        <div className={styles.flowConnector}><span /></div>

        <div className={styles.flowCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="shield" tone="runtime" />
            <span className={styles.eyebrow}>Governance layer</span>
          </div>
          <strong className={styles.cardTitle}>Permissions, hooks, and tool policy</strong>
          <p className={styles.cardBody}>The host decides whether the runtime is trusted, interactive, locked down, or policy-driven, per client and per session.</p>
        </div>

        <div className={styles.flowConnector}><span /></div>

        <div className={styles.flowCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="database" tone="ops" />
            <span className={styles.eyebrow}>Infra layer</span>
          </div>
          <strong className={styles.cardTitle}>State, artifacts, and process boundaries</strong>
          <p className={styles.cardBody}>Persistence, object storage, remote browsers, metrics, and gRPC all sit around the same runtime instead of splitting into separate agent stacks.</p>
        </div>
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.detailCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="network" tone="host" />
            <span className={styles.eyebrow}>Polyglot path</span>
          </div>
          <strong className={styles.cardTitle}>Use gRPC when the runtime should move out-of-process</strong>
          <p className={styles.cardBody}>The Go SDK is the richest embedding surface. gRPC is the right next step when another language or service boundary must own the outer API.</p>
        </div>

        <div className={`${styles.detailCard} ${styles.detailCardState}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="spark" tone="ops" />
            <span className={styles.eyebrow}>Product rule</span>
          </div>
          <strong className={styles.cardTitle}>Do not fork the runtime too early</strong>
          <p className={styles.cardBody}>Most product integrations should reshape sessions, prompts, credentials, tools, and hooks before inventing a parallel host-side orchestration layer.</p>
        </div>
      </div>
    </div>
  )
}

function ReferenceTable({ rows }: { rows: ReferenceRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Seam</th>
          <th>Type / Surface</th>
          <th>Behavior</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.name}>
            <td className={styles.codeCell}>{row.name}</td>
            <td>{row.type ?? '—'}</td>
            <td>{row.behavior ?? '—'}</td>
            <td className={styles.noteCell}>{row.notes}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function DeveloperIntegration() {
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
        <span className={articleStyles.breadCurrent}>Developer Integration</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Developer Integration</h1>
        <p className={articleStyles.sub}>
          This page is about embedding Seshat as a runtime inside a real product surface. The Go SDK is not only a “send prompt, get text” wrapper: it is the contract for auth bridging, session durability, product metadata, streaming UX, policy enforcement, artifacts, monitoring, and service boundaries.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section id="overview" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>What this page is really for</h2>
            <p className={styles.sectionLead}>
              `Providers & Auth`, `Agent`, `Prompt`, and `Tools & Surface` document the individual SDK surfaces. `Developer Integration` is where they come together. The question here is not “what does this field do?” but “how should a real host application compose the runtime cleanly?”
            </p>
            <div className={articleStyles.callout}>
              <div className={articleStyles.calloutTitle}>Integration thesis</div>
              <p className={articleStyles.calloutText}>
                The best host integrations keep Seshat responsible for runtime execution while the product owns identity, policy, persistence, UI, and infrastructure. That split is what keeps the integration maintainable as the engine grows.
              </p>
            </div>
          </section>

          <section id="architecture" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Integration Map</h2>
            <p className={styles.sectionLead}>
              The same client can power a local operator app, an internal platform service, or a product feature API. The difference is not a different runtime. The difference is which seams you use around the same runtime core.
            </p>
            <IntegrationMapDiagram />
          </section>

          <section id="seams" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Public integration seams</h2>
            <p className={styles.sectionLead}>
              These are the most important SDK-owned boundaries for product hosts. They are the places where your application should connect, rather than patching internals.
            </p>
            <ReferenceTable rows={SEAM_ROWS} />
          </section>

          <section id="desktop" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Scenario 1: desktop app or operator console</h2>
            <p className={styles.sectionLead}>
              A local app usually wants persisted login, live streaming, session titles, approvals, and project-aware working directories. That makes the in-process Go SDK the cleanest path.
            </p>
            <DocCodeBlock code={DESKTOP_HOST} label="Desktop / operator integration" language="go" />
            <div className={articleStyles.grid}>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Why OAuth matters here</div>
                <p className={articleStyles.cardBody}>Codex and ChatGPT-backed flows can be initiated directly by the host app through <span className={articleStyles.inlineCode}>sdk.NewOAuthDeviceFlow</span>, then bridged back into the runtime with the returned credential resolver.</p>
              </div>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Why in-process is strong here</div>
                <p className={articleStyles.cardBody}>Desktop and operator apps typically need immediate control over deltas, runtime events, permissions, and project files. gRPC adds an unnecessary extra boundary in that case.</p>
              </div>
            </div>
          </section>

          <section id="backend" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Scenario 2: multi-user backend or internal platform</h2>
            <p className={styles.sectionLead}>
              Server-side hosts should think in terms of tenant credentials, controlled working directories, durable session storage, and explicit policy profiles. This is where <span className={articleStyles.inlineCode}>CredentialResolver</span>, session metadata, and session-specific tool trimming matter most.
            </p>
            <DocCodeBlock code={BACKEND_HOST} label="Backend / multi-user host" language="go" />
            <div className={articleStyles.callout}>
              <div className={articleStyles.calloutTitle}>Important permission rule</div>
              <p className={articleStyles.calloutText}>
                If your backend does not have a real human approval loop, do not pretend it does. Use <span className={articleStyles.inlineCode}>PermissionModeNever</span> or a tightly-governed trusted mode, then trim the tool surface explicitly for that product route.
              </p>
            </div>
          </section>

          <section id="streaming" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Scenario 3: live product streaming and resume</h2>
            <p className={styles.sectionLead}>
              For chat surfaces, dashboards, and operator consoles, the host usually needs more than final text. It needs text deltas, tool progress, runtime events, and session resume across requests.
            </p>
            <DocCodeBlock code={STREAMING_HOST} label="Per-session live streaming" language="go" />
            <p className={articleStyles.p}>
              Client-level callbacks become the defaults for newly-created sessions, but sessions can also override them individually. That is a strong pattern for multi-tab, multi-channel, or per-request streaming surfaces.
            </p>
          </section>

          <section id="governance" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Scenario 4: governance, lifecycle hooks, and host policy</h2>
            <p className={styles.sectionLead}>
              The host should treat policy as a first-class integration concern. Practical policy starts with permission modes and tool shaping, then moves into shell pre-tool hooks and lifecycle hooks when the product needs stronger controls or observability.
            </p>
            <DocCodeBlock code={GOVERNANCE_HOST} label="Governance hooks" language="go" />
            <div className={styles.choiceBoard}>
              <div className={styles.choiceGrid}>
                <div className={`${styles.choiceCard} ${styles.choiceCardStrong}`}>
                  <span className={styles.choiceBadge}>Use pre-tool hooks</span>
                  <strong className={styles.choiceTitle}>When you need immediate tool-call policy</strong>
                  <p className={styles.choiceBody}>Shell-backed pre-tool hooks are the pragmatic way to block, rewrite, or halt risky tool calls before they execute.</p>
                  <ul className={styles.tinyList}>
                    <li>Block or rewrite tool input</li>
                    <li>Implement external policy checks</li>
                    <li>Integrate shell-era operational guardrails</li>
                  </ul>
                </div>

                <div className={styles.choiceCard}>
                  <span className={styles.choiceBadge}>Use lifecycle hooks</span>
                  <strong className={styles.choiceTitle}>When you need broader runtime telemetry</strong>
                  <p className={styles.choiceBody}>Lifecycle hooks are useful for turn-end side effects, event-driven metrics, setup notifications, and non-tool-specific host instrumentation.</p>
                  <ul className={styles.tinyList}>
                    <li>Observe turn boundaries</li>
                    <li>Attach host-side side effects</li>
                    <li>Keep the runtime loop intact</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section id="storage" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Scenario 5: storage, artifacts, browser, and metrics</h2>
            <p className={styles.sectionLead}>
              Once your product uses web, browser, screenshot, download, notebook, or multimodal flows, artifact storage stops being optional infrastructure. The SDK already exposes this as an integration seam instead of forcing you into a separate sidecar design.
            </p>
            <DocCodeBlock code={STORAGE_HOST} label="Artifacts, GC, and monitoring" language="go" />
            <p className={articleStyles.p}>
              The host can either inject a full <span className={articleStyles.inlineCode}>ArtifactStore</span> or provide a structured <span className={articleStyles.inlineCode}>StorageConfig</span>. The browser manager and reaper are then wired automatically behind the client.
            </p>
          </section>

          <section id="boundary" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>When to use gRPC instead</h2>
            <p className={styles.sectionLead}>
              The Go SDK is the richest integration surface. But it is not always the best deployment boundary. If the outer product is in another language, if the runtime should be isolated as a managed service, or if multiple systems should share one runtime process, gRPC is the better fit.
            </p>
            <ReferenceTable rows={DECISION_ROWS} />
            <div className={styles.linkRow}>
              <Link className={articleStyles.link} to="/docs/sdk/grpc-api" state={{ from: location.pathname }}>
                gRPC API
              </Link>
              <Link className={articleStyles.link} to="/docs/sdk/providers" state={{ from: location.pathname }}>
                Providers &amp; Auth
              </Link>
              <Link className={articleStyles.link} to="/docs/sdk/go-tools" state={{ from: location.pathname }}>
                Tools &amp; Surface
              </Link>
            </div>
          </section>
        </div>

        <aside className={styles.aside}>
          <DocOnPageNav title="Developer Integration" items={ON_PAGE} />
        </aside>
      </div>
    </article>
  )
}
