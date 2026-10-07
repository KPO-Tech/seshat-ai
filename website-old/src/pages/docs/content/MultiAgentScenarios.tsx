import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocOnPageNav from './DocOnPageNav'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './MultiAgentScenarios.module.css'

type Tone = 'host' | 'runtime' | 'internal'
type IconName = 'spark' | 'users' | 'split' | 'cpu' | 'mail' | 'server' | 'network'

type NavItem = {
  id: string
  label: string
}

type SurfaceRow = {
  surface: string
  ownedBy: string
  bestFor: string
  notes: string
}

type LimitRow = {
  area: string
  shape: string
  impact: string
}

const ON_PAGE: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'runtime-levels', label: 'Runtime Levels' },
  { id: 'surface-matrix', label: 'Surface Matrix' },
  { id: 'session-delegation', label: 'Model-Led Delegation' },
  { id: 'host-orchestration', label: 'Host-Led Orchestration' },
  { id: 'persistent-teams', label: 'Persistent Teams' },
  { id: 'limits', label: 'Events & Limits' },
]

const SURFACE_ROWS: SurfaceRow[] = [
  {
    surface: 'agent',
    ownedBy: 'Runtime tool inside one session',
    bestFor: 'Synchronous delegation decided by the model during the current turn.',
    notes: 'Good when the manager agent should decompose work itself and return one final answer before the turn ends.',
  },
  {
    surface: 'spawn_agent + wait_agent + send_agent_message + resume_agent',
    ownedBy: 'Runtime tool family inside one session',
    bestFor: 'Background sub-agents with stable agent ids and resumable session ids.',
    notes: 'This is the closest public multi-agent surface today when the runtime itself should own delegation, concurrency, and synthesis.',
  },
  {
    surface: 'Multiple sdk.Session instances from the host app',
    ownedBy: 'Your Go application',
    bestFor: 'Deterministic fan-out where the host decides which roles run, in what order, and how outputs are merged.',
    notes: 'Best for product workflows, backend orchestration, and explicit governance where you do not want the model to invent the topology.',
  },
  {
    surface: 'internal/agent + internal/mailbox + internal/team',
    ownedBy: 'Seshat core runtime',
    bestFor: 'Durable identities, async inboxes, role-based routing, and work that moves across sessions and restarts.',
    notes: 'Important: this path is internal to the Seshat module today, so treat it as first-party or contributor-facing rather than a stable external SDK facade.',
  },
]

const LIMIT_ROWS: LimitRow[] = [
  {
    area: 'Agent runtime events',
    shape: 'The engine emits structured agent events, but the Go SDK does not yet re-export named constants for every agent.* variant.',
    impact: 'Host apps can still observe them through RuntimeEventFn and compare string(event.Type) against raw values like agent.spawn.begin.',
  },
  {
    area: 'Persistent team runtime',
    shape: 'Profiles, mailboxes, dispatcher, TeamBus, and session handler live under internal/ packages.',
    impact: 'External consumers outside the Seshat module cannot import them directly. Today that path is for monorepo work, first-party surfaces, and contributors.',
  },
  {
    area: 'Public SDK facade',
    shape: 'There is no single high-level sdk.Team client yet.',
    impact: 'If you need a stable public integration today, prefer runtime-owned sub-agent tools or host-managed multi-session orchestration.',
  },
  {
    area: 'Cross-language usage',
    shape: 'Go is still the richest embedding surface.',
    impact: 'If another language must own the outer application API, use the gRPC boundary rather than rebuilding orchestration semantics from scratch.',
  },
]

const MODEL_LED_DELEGATION = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey:         os.Getenv("ANTHROPIC_API_KEY"),
    WorkingDir:     repoRoot,
    PermissionMode: sdk.PermissionModeOnRequest,
    RuntimeEventFn: func(event sdk.RuntimeEvent) {
        switch string(event.Type) {
        case "agent.spawn.begin", "agent.spawn.end", "agent.wait.begin", "agent.wait.end":
            if event.AgentEvent != nil {
                log.Printf(
                    "agent=%s role=%s status=%s type=%s",
                    event.AgentEvent.AgentID,
                    event.AgentEvent.AgentRole,
                    event.AgentEvent.Status,
                    event.Type,
                )
            }
        }
    },
})
if err != nil {
    log.Fatal(err)
}
defer client.Close()

session, err := client.CreateSession(ctx)
if err != nil {
    log.Fatal(err)
}
defer session.Close()

session.SetAppendSystemPrompt(\`If the task benefits from delegation, use the built-in
agent tools. Prefer a researcher, implementer, and reviewer split.
Wait for spawned agents before returning the final synthesis.\`)

resp, err := session.SubmitMessage(ctx, \`Inspect this repository. Research the bug,
propose the patch, and review the risk before you answer.\`)
if err != nil {
    log.Fatal(err)
}

fmt.Println(resp.Content)`

const HOST_LED_ORCHESTRATION = `type RoleResult struct {
    Role   string
    Output string
}

runRole := func(ctx context.Context, role string, instruction string) (RoleResult, error) {
    session, err := client.CreateSession(ctx)
    if err != nil {
        return RoleResult{}, err
    }
    defer session.Close()

    session.SetSystemPromptTemplate(fmt.Sprintf(\`You are the %s agent.
Stay focused on your role and return structured output.\`, role))

    resp, err := session.SubmitMessage(ctx, instruction)
    if err != nil {
        return RoleResult{}, err
    }

    return RoleResult{Role: role, Output: resp.Content}, nil
}

var (
    g       errgroup.Group
    mu      sync.Mutex
    results []RoleResult
)

for role, task := range map[string]string{
    "researcher": "Investigate the bug reports and likely root cause.",
    "engineer":   "Draft the implementation strategy and patch outline.",
    "reviewer":   "List the highest-risk regressions and missing tests.",
} {
    role := role
    task := task
    g.Go(func() error {
        result, err := runRole(ctx, role, task)
        if err != nil {
            return err
        }
        mu.Lock()
        results = append(results, result)
        mu.Unlock()
        return nil
    })
}

if err := g.Wait(); err != nil {
    log.Fatal(err)
}

payload, err := json.MarshalIndent(results, "", "  ")
if err != nil {
    log.Fatal(err)
}

manager, err := client.CreateSession(ctx)
if err != nil {
    log.Fatal(err)
}
defer manager.Close()

manager.SetAppendSystemPrompt("Synthesize specialist outputs into one decisive plan.")

resp, err := manager.SubmitMessage(ctx, string(payload))
if err != nil {
    log.Fatal(err)
}

fmt.Println(resp.Content)`

const PERSISTENT_TEAM_RUNTIME = `database, err := db.Open(ctx, db.Config{
    Driver:      db.DriverSQLite,
    DSN:         "seshat.db",
    AutoMigrate: true,
})
if err != nil {
    log.Fatal(err)
}

profiles := agent.NewProfileRegistry(database)
teams := team.NewTeamRegistry(database)
_ = profiles.Seed(ctx)

agentLister := func(ctx context.Context, teamID string) ([]string, error) {
    members, err := teams.Members(ctx, teamID)
    if err != nil {
        return nil, err
    }

    ids := make([]string, 0, len(members))
    for _, member := range members {
        ids = append(ids, member.ID)
    }
    return ids, nil
}

mail := mailbox.New(database, agentLister)
dispatcher := team.NewDispatcher(profiles, mail)

handler := team.NewSessionHandler(engineInstance, nil, profiles, teams)
bus := team.NewTeamBus(profiles, mail, handler, 2*time.Second)
bus.Start(ctx)
defer bus.Stop()

_ = dispatcher.Assign(
    ctx,
    orchestratorID,
    "researcher",
    "alpha",
    "Research competitors",
    "Summarise pricing, positioning, and distribution channels.",
)`

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </svg>
      )
    case 'users':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 4.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'split':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M12 10h5a3 3 0 1 0 0-6" />
          <path d="M12 14H7a3 3 0 1 0 0 6" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="17" cy="4" r="2" />
          <circle cx="7" cy="20" r="2" />
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
    case 'mail':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
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
    default:
      return null
  }
}

function toneClassName(tone: Tone) {
  switch (tone) {
    case 'runtime':
      return styles.toneRuntime
    case 'internal':
      return styles.toneInternal
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

function RuntimeMapDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.topGrid}>
        <div className={`${styles.topCard} ${styles.topCardHost}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="server" tone="host" />
            <span className={styles.eyebrow}>Outer host</span>
          </div>
          <strong className={styles.cardTitle}>CLI app, desktop surface, backend, or worker</strong>
          <p className={styles.cardBody}>Your product chooses whether multi-agent behavior is runtime-owned, host-owned, or a durable internal team system.</p>
        </div>

        <div className={`${styles.topCard} ${styles.topCardRuntime}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="cpu" tone="runtime" />
            <span className={styles.eyebrow}>Mono-run core</span>
          </div>
          <strong className={styles.cardTitle}>One engine, multiple multi-agent levels</strong>
          <p className={styles.cardBody}>The same runtime can expose sub-agent tools, parallel SDK sessions, or mailbox-driven team execution depending on which boundary owns coordination.</p>
        </div>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <IconBadge icon="split" tone="runtime" />
          <span className={styles.eyebrow}>Decision point</span>
        </div>
        <strong className={styles.cardTitle}>Do not collapse every collaboration pattern into one “agent team” label</strong>
        <p className={styles.cardBody}>Seshat currently has three useful shapes: model-led delegation inside one session, deterministic orchestration from the host app, and persistent mailbox teams inside the core runtime.</p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.branchGrid}>
        <div className={`${styles.branchCard} ${styles.branchCardHost}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="spark" tone="host" />
            <span className={styles.eyebrow}>Level 1</span>
          </div>
          <strong className={styles.cardTitle}>In-session delegation</strong>
          <p className={styles.cardBody}>Use <span className={articleStyles.inlineCode}>agent</span> for bounded synchronous delegation or <span className={articleStyles.inlineCode}>spawn_agent</span> for async work that returns a stable <span className={articleStyles.inlineCode}>agent_id</span>.</p>
        </div>

        <div className={`${styles.branchCard} ${styles.branchCardRuntime}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="network" tone="runtime" />
            <span className={styles.eyebrow}>Level 2</span>
          </div>
          <strong className={styles.cardTitle}>Host-led orchestration</strong>
          <p className={styles.cardBody}>Create multiple <span className={articleStyles.inlineCode}>sdk.Session</span> instances in parallel when the application, not the model, must decide roles, ordering, and synthesis rules.</p>
        </div>

        <div className={`${styles.branchCard} ${styles.branchCardInternal}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="mail" tone="internal" />
            <span className={styles.eyebrow}>Level 3</span>
          </div>
          <strong className={styles.cardTitle}>Persistent team runtime</strong>
          <p className={styles.cardBody}>Profiles, mailbox transport, dispatcher routing, and TeamBus execution are the durable layer for named agents that can receive work over time and across restarts.</p>
        </div>
      </div>
    </div>
  )
}

function SurfaceTable({ rows }: { rows: SurfaceRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Surface</th>
          <th>Owned By</th>
          <th>Best For</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.surface}>
            <td className={styles.codeCell}>{row.surface}</td>
            <td>{row.ownedBy}</td>
            <td>{row.bestFor}</td>
            <td className={styles.noteCell}>{row.notes}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function LimitsTable({ rows }: { rows: LimitRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Area</th>
          <th>Current Shape</th>
          <th>Why It Matters</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.area}>
            <td className={styles.codeCell}>{row.area}</td>
            <td className={styles.noteCell}>{row.shape}</td>
            <td className={styles.noteCell}>{row.impact}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function MultiAgentScenarios() {
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
        <span className={articleStyles.breadCurrent}>Multi-Agent Scenarios</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Multi-Agent Scenarios</h1>
        <p className={articleStyles.sub}>
          Multi-agent in Seshat is not one feature with one API. There are at least two distinct runtime levels you need to separate clearly, plus one deeper internal team runtime: short-lived delegated sub-agents inside a session, deterministic orchestration across multiple sessions, and persistent mailbox-driven teams inside the core.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section className={styles.anchorSection} id="overview">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Overview</h2>
              <p className={styles.sectionLead}>
                If you blur these levels together, the docs become vague and the integration model becomes misleading. The public Go SDK already gives you enough to build real multi-agent product flows, but the exact approach depends on who should own coordination: the model, the host application, or the durable runtime itself.
              </p>
              <div className={articleStyles.callout}>
                <div className={articleStyles.calloutTitle}>Important Distinction</div>
                <p className={articleStyles.calloutText}>
                  <span className={articleStyles.inlineCode}>spawn_agent</span> is not the same thing as the mailbox team runtime described in Concepts. One is short-lived delegated execution. The other is durable identity, async transport, routing, and message-driven execution over time.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.anchorSection} id="runtime-levels">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Runtime Levels</h2>
              <p className={styles.sectionLead}>
                The visual map below is the practical way to think about multi-agent in Seshat today. Start with the lightest layer that solves the problem instead of jumping straight to a durable team system.
              </p>
              <RuntimeMapDiagram />
            </div>
          </section>

          <section className={styles.anchorSection} id="surface-matrix">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Surface Matrix</h2>
              <p className={styles.sectionLead}>
                These surfaces all count as multi-agent in some sense, but they differ sharply in ownership, durability, and how much topology is hidden inside the runtime.
              </p>
              <SurfaceTable rows={SURFACE_ROWS} />
            </div>
          </section>

          <section className={styles.anchorSection} id="session-delegation">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Scenario 1: Model-Led Delegation Inside One Session</h2>
              <p className={styles.sectionLead}>
                This is the cleanest path when you want the manager agent to decide whether the task should branch into researcher, implementer, planner, or reviewer work. The host configures the runtime, but the model chooses when to call <span className={articleStyles.inlineCode}>agent</span> or <span className={articleStyles.inlineCode}>spawn_agent</span>.
              </p>
              <DocCodeBlock code={MODEL_LED_DELEGATION} label="Runtime-owned sub-agents" language="go" />
              <ul className={articleStyles.list}>
                <li>Use <span className={articleStyles.inlineCode}>agent</span> when the sub-task should stay tightly bounded and complete synchronously before the manager continues.</li>
                <li>Use <span className={articleStyles.inlineCode}>spawn_agent</span> when the runtime should launch background work and later reconcile it with <span className={articleStyles.inlineCode}>wait_agent</span> or <span className={articleStyles.inlineCode}>resume_agent</span>.</li>
                <li>This pattern keeps the whole collaboration inside one durable session, which is usually the right default for coding, research, and analyst-style flows.</li>
              </ul>
            </div>
          </section>

          <section className={styles.anchorSection} id="host-orchestration">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Scenario 2: Host-Led Orchestration Across Sessions</h2>
              <p className={styles.sectionLead}>
                Sometimes the product must decide the topology explicitly. In that case, create multiple sessions yourself and run them in parallel from the host application. This is often the better choice for backends, workflow engines, API products, and deterministic enterprise flows.
              </p>
              <DocCodeBlock code={HOST_LED_ORCHESTRATION} label="Host-managed parallel sessions" language="go" />
              <div className={articleStyles.grid}>
                <div className={articleStyles.card}>
                  <div className={articleStyles.cardTitle}>Why choose this path</div>
                  <p className={articleStyles.cardBody}>You want explicit control over role count, concurrency, tool policy, provider choice, retries, and final synthesis instead of leaving topology decisions to the model.</p>
                </div>
                <div className={articleStyles.card}>
                  <div className={articleStyles.cardTitle}>Typical fit</div>
                  <p className={articleStyles.cardBody}>Backend orchestration, workflow services, audited business processes, or product features where each specialist output must be clearly attributable and reproducible.</p>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.anchorSection} id="persistent-teams">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Scenario 3: Persistent Teams, Mailboxes, And TeamBus</h2>
              <p className={styles.sectionLead}>
                This is the deeper runtime layer already present inside Seshat core: <span className={articleStyles.inlineCode}>AgentProfile</span>, <span className={articleStyles.inlineCode}>Mailbox</span>, <span className={articleStyles.inlineCode}>Dispatcher</span>, and <span className={articleStyles.inlineCode}>TeamBus</span>. It models named agents that can be offline, receive tasks asynchronously, reply later, and collaborate through durable inboxes.
              </p>
              <div className={articleStyles.callout}>
                <div className={articleStyles.calloutTitle}>Current Boundary</div>
                <p className={articleStyles.calloutText}>
                  This path lives under <span className={articleStyles.inlineCode}>internal/</span> packages. That means it is suitable today for core contributors, first-party surfaces, and monorepo work, but not yet a stable public SDK facade for external consumers.
                </p>
              </div>
              <DocCodeBlock code={PERSISTENT_TEAM_RUNTIME} label="Internal durable team runtime" language="go" />
              <p className={articleStyles.p}>
                For the conceptual explanation of this durable layer, continue with{' '}
                <Link className={articleStyles.link} to="/docs/concepts/agent-teams" state={{ from: location.pathname }}>
                  Agent Teams and Mailboxes
                </Link>
                .
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="limits">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Events, Limits, And Current Shape</h2>
              <p className={styles.sectionLead}>
                The runtime already exposes real collaboration mechanics, but the public surface is still uneven. These are the points worth documenting explicitly so developers know what is stable, what is internal, and where gRPC starts to matter.
              </p>
              <LimitsTable rows={LIMIT_ROWS} />
              <p className={articleStyles.p}>
                If you need a polyglot boundary after Go, continue with{' '}
                <Link className={articleStyles.link} to="/docs/sdk/grpc-api" state={{ from: location.pathname }}>
                  gRPC API
                </Link>
                . That is the right bridge for future Python, JS, and other SDKs rather than copying the runtime model separately in each language.
              </p>
            </div>
          </section>
        </div>

        <aside className={styles.aside}>
          <DocOnPageNav items={ON_PAGE} />
        </aside>
      </div>
    </article>
  )
}
