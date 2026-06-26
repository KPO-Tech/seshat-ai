import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocOnPageNav from './DocOnPageNav'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './BuildingWorkflows.module.css'

type Tone = 'host' | 'runtime' | 'ops'
type IconName = 'play' | 'clock' | 'stack' | 'shield' | 'cpu' | 'chat' | 'database' | 'send'

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
  { id: 'architecture', label: 'Architecture Map' },
  { id: 'execution-contract', label: 'Execution Contract' },
  { id: 'scenario-one-shot', label: 'One-Shot Workflow' },
  { id: 'scenario-executor', label: 'Executor Control' },
  { id: 'scenario-scheduled', label: 'Scheduling & State' },
  { id: 'scenario-choice', label: 'Choose The Right Layer' },
  { id: 'current-shape', label: 'Current Shape' },
]

const PRIMITIVE_ROWS: ReferenceRow[] = [
  {
    name: 'automation.Workflow',
    type: 'Interface',
    behavior: 'Your unit of work.',
    notes: 'Implements Name, Description, and Run(ctx, session). The workflow receives an SDK session and decides what prompt or session operations to perform.',
  },
  {
    name: 'automation.Runner',
    type: 'Execution primitive',
    behavior: 'Creates a fresh SDK client and session for each run.',
    notes: 'This is why model overrides and system-prompt replacement stay isolated per execution.',
  },
  {
    name: 'automation.Executor',
    type: 'Orchestrator',
    behavior: 'Wraps Runner with middleware, sinks, and execution state.',
    notes: 'This is the main production entry point for scheduled jobs, internal workers, and background automation.',
  },
  {
    name: 'automation.Options',
    type: 'Per-run config',
    behavior: 'Model override, timeout, retries, dry-run, and workflow-specific extra flags.',
    notes: 'Cross-cutting execution controls live here. Workflow-specific business parameters belong in the workflow struct itself.',
  },
  {
    name: 'automation.Schedule',
    type: 'Trigger contract',
    behavior: 'Computes the next run time.',
    notes: 'Built-in helpers cover interval, one-shot, and cron-style schedules.',
  },
  {
    name: 'automation.StateStore',
    type: 'Persistence hook',
    behavior: 'Stores execution history across runs.',
    notes: 'This is execution metadata persistence, not session memory or RAG storage.',
  },
  {
    name: 'automation.Sink',
    type: 'Output hook',
    behavior: 'Receives the final Result after each run.',
    notes: 'Use sinks for stdout, file snapshots, webhooks, or custom delivery paths.',
  },
]

const OPTION_ROWS: ReferenceRow[] = [
  {
    name: 'Model',
    type: 'string',
    notes: 'Per-run model override in provider:model format. Empty means use RunnerConfig.Model.',
  },
  {
    name: 'DryRun',
    type: 'bool',
    notes: 'Skips the actual LLM execution and returns a dry-run result. Useful to validate schedules or plumbing without cost.',
  },
  {
    name: 'Timeout',
    type: 'time.Duration',
    notes: 'Caps total wall-clock time when WithTimeout is active or when Options itself overrides timeout behavior.',
  },
  {
    name: 'MaxRetries',
    type: 'int',
    notes: 'Additional attempts after a failure. Used by WithRetry.',
  },
  {
    name: 'RetryBackoff',
    type: 'time.Duration',
    notes: 'Initial backoff used by WithRetry. It doubles after each failure.',
  },
  {
    name: 'Extra',
    type: 'map[string]any',
    notes: 'Escape hatch for workflow-specific flags. The automation package stores it, but your workflow must read it explicitly.',
  },
]

const CHOICE_ROWS: ReferenceRow[] = [
  {
    name: 'pkg/automation',
    behavior: 'Best for one-shot or scheduled background runs.',
    notes: 'Choose this when each execution can start from a clean session and you want retries, sinks, scheduling, or execution-state tracking.',
  },
  {
    name: 'pkg/sdk directly',
    behavior: 'Best for multi-turn product flows or interactive operator tools.',
    notes: 'Choose this when you need persistent sessions, interactive permissions, session resume, prompt appends, or richer per-turn orchestration.',
  },
  {
    name: 'Mailbox / agent teams',
    behavior: 'Best for durable multi-agent identity and delegation.',
    notes: 'Choose this when work must move between named agents instead of staying inside one fresh session per run.',
  },
  {
    name: 'gRPC API',
    behavior: 'Best for other languages or process boundaries.',
    notes: 'Choose this when the runtime should stay in a separate process and your host system only needs transport-level access.',
  },
]

const CURRENT_ROWS: ReferenceRow[] = [
  {
    name: 'Fresh client per execution',
    notes: 'Runner creates a brand-new SDK client every time. That keeps runs isolated, but it also means workflow executions do not automatically share session state.',
  },
  {
    name: 'PermissionModeBypass',
    notes: 'The stock automation runner forces bypass permissions. That is correct for trusted background automation, not for end-user interactive approval flows.',
  },
  {
    name: 'Memory disabled',
    notes: 'Runner disables memory, hooks, monitoring, session persistence, and title generation. The current automation layer is intentionally lean and stateless by default.',
  },
  {
    name: 'Scheduler is single-threaded',
    notes: 'One Scheduler runs due jobs synchronously, one at a time. Use multiple schedulers or your own outer concurrency if you need parallel pipelines.',
  },
  {
    name: 'StateStore is execution history only',
    notes: 'FileStateStore and MemoryStateStore track last status, counters, and last error. They do not persist the runtime conversation transcript.',
  },
  {
    name: 'CLI surface is early',
    notes: 'Today cmd/automation ships a small seshat-auto wrapper with a tech-watch example. The runtime primitives are more general than the built-in CLI workflow list.',
  },
]

const MINIMAL_WORKFLOW = `type DailyDigest struct {
    Topic string
}

func (w *DailyDigest) Name() string        { return "daily-digest" }
func (w *DailyDigest) Description() string { return "Produce a concise digest for one topic" }

func (w *DailyDigest) Run(ctx context.Context, session *sdk.Session) error {
    prompt := fmt.Sprintf(
        "Produce a markdown digest about %s with the 5 most relevant updates and why they matter.",
        w.Topic,
    )

    _, err := session.SubmitMessage(ctx, prompt)
    return err
}

func main() {
    ctx := context.Background()

    runnerCfg, err := automation.RunnerConfigFromEnv("anthropic:claude-sonnet-4-6")
    if err != nil {
        log.Fatal(err)
    }

    executor, err := automation.NewExecutor(automation.ExecutorConfig{
        RunnerConfig: runnerCfg,
        Sinks: []automation.Sink{
            &automation.StdoutSink{},
        },
    })
    if err != nil {
        log.Fatal(err)
    }
    defer executor.Close()

    opts := automation.DefaultOptions().WithTimeout(15 * time.Minute)
    result, err := executor.Run(ctx, &DailyDigest{Topic: "open-source Go agents"}, opts)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.Output)
}`

const SYSTEM_PROMPT_WORKFLOW = `type StrictReviewer struct{}

func (w *StrictReviewer) Name() string        { return "strict-reviewer" }
func (w *StrictReviewer) Description() string { return "Review a patch with a hard review contract" }

func (w *StrictReviewer) SystemPrompt() string {
    return \`You are a strict software reviewer.
Only report concrete defects, risks, or missing tests.
Do not praise code. Do not speculate without evidence.\`
}

func (w *StrictReviewer) Run(ctx context.Context, session *sdk.Session) error {
    _, err := session.SubmitMessage(ctx, "Review the current repository diff.")
    return err
}`

const CONTROLLED_EXECUTOR = `state, err := automation.NewFileStateStore("./var/automation-state")
if err != nil {
    log.Fatal(err)
}

executor, err := automation.NewExecutor(automation.ExecutorConfig{
    RunnerConfig: runnerCfg,
    Middleware: []automation.Middleware{
        automation.WithLogging(nil),
        automation.WithTimeout(20 * time.Minute),
        automation.WithRetry(2, 10 * time.Second),
        automation.WithMetrics(func(result automation.Result) {
            fmt.Printf("workflow=%s success=%v duration=%s\\n",
                result.WorkflowName,
                result.Success(),
                result.Duration.Round(time.Second),
            )
        }),
    },
    Sinks: []automation.Sink{
        &automation.StdoutSink{},
        &automation.FileSink{Dir: "./var/workflow-runs", Format: "json"},
        automation.NewWebhookSink("https://ops.example.com/hooks/seshat"),
    },
    State: state,
})
if err != nil {
    log.Fatal(err)
}`

const SCHEDULED_WORKFLOW = `executor, err := automation.NewExecutor(automation.ExecutorConfig{
    RunnerConfig: runnerCfg,
    Middleware: []automation.Middleware{
        automation.WithLogging(nil),
        automation.WithRetry(3, 15 * time.Second),
    },
    Sinks: []automation.Sink{
        &automation.StdoutSink{},
        &automation.FileSink{Dir: "./var/digests"},
    },
    State: state,
})
if err != nil {
    log.Fatal(err)
}
defer executor.Close()

scheduler := automation.NewScheduler(executor).
    Add(
        &DailyDigest{Topic: "AI agents and orchestration"},
        automation.MustCron("0 */6 * * *"),
        automation.DefaultOptions().WithTimeout(20*time.Minute),
    ).
    Add(
        &DailyDigest{Topic: "Go runtime engineering"},
        automation.Every(12*time.Hour),
        automation.DefaultOptions().WithRetry(2, 20*time.Second),
    )

for _, item := range scheduler.Next() {
    fmt.Printf("%s -> %s (%s)\\n", item.WorkflowName, item.NextRun.Format(time.RFC3339), item.Schedule)
}

log.Fatal(scheduler.Run(ctx))`

const DIRECT_SDK_FLOW = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey:          os.Getenv("ANTHROPIC_API_KEY"),
    PermissionMode:  sdk.PermissionModeOnRequest,
    PersistSessions: true,
    EnableMemory:    true,
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

session.SetAppendSystemPrompt("You are the billing operations agent for this company.")
session.SetPermissionMode(sdk.PermissionModeOnRequest)

_, err = session.SubmitMessage(ctx, "Investigate the invoice mismatch and ask for approval before changing files.")
if err != nil {
    log.Fatal(err)
}`

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'play':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="8 6 18 12 8 18 8 6" />
        </svg>
      )
    case 'clock':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      )
    case 'stack':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
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
    case 'send':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2L11 13" />
          <path d="M22 2L15 22l-4-9-9-4 20-7z" />
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

function WorkflowMapDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.entryGrid}>
        <div className={`${styles.entryCard} ${styles.entryCardHost}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="play" tone="host" />
            <span className={styles.eyebrow}>Trigger</span>
          </div>
          <strong className={styles.cardTitle}>Host app or worker</strong>
          <p className={styles.cardBody}>A cron job, queue worker, operator tool, or internal backend decides that a workflow should run now.</p>
        </div>

        <div className={`${styles.entryCard} ${styles.entryCardRuntime}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="stack" tone="runtime" />
            <span className={styles.eyebrow}>Definition</span>
          </div>
          <strong className={styles.cardTitle}>Workflow + Options</strong>
          <p className={styles.cardBody}>Business parameters live in the workflow struct. Cross-cutting execution controls live in automation.Options.</p>
        </div>

        <div className={`${styles.entryCard} ${styles.entryCardOps}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="clock" tone="ops" />
            <span className={styles.eyebrow}>Scheduling</span>
          </div>
          <strong className={styles.cardTitle}>Optional scheduler</strong>
          <p className={styles.cardBody}>The same executor can be fired manually or behind Every, Once, and Cron schedules.</p>
        </div>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <IconBadge icon="shield" tone="runtime" />
          <span className={styles.eyebrow}>Control Layer</span>
        </div>
        <strong className={styles.cardTitle}>Executor = runner + middleware + sinks + execution state</strong>
        <p className={styles.cardBody}>Executor is the production shell around the actual workflow call. It adds retries, timeout policy, logging, result fan-out, and persistent run counters without changing the workflow code itself.</p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.flowRow}>
        <div className={styles.flowCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="cpu" tone="runtime" />
            <span className={styles.eyebrow}>Runner</span>
          </div>
          <strong className={styles.cardTitle}>Fresh client per run</strong>
          <p className={styles.cardBody}>Runner builds a new SDK client for each execution so model overrides and prompt replacement stay isolated.</p>
        </div>

        <div className={styles.flowConnector}><span /></div>

        <div className={styles.flowCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="stack" tone="runtime" />
            <span className={styles.eyebrow}>SDK layer</span>
          </div>
          <strong className={styles.cardTitle}>Mono-run runtime</strong>
          <p className={styles.cardBody}>The runner still enters the normal Seshat runtime: provider client, prompt stack, tool surface, and response streaming.</p>
        </div>

        <div className={styles.flowConnector}><span /></div>

        <div className={styles.flowCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="chat" tone="runtime" />
            <span className={styles.eyebrow}>Session</span>
          </div>
          <strong className={styles.cardTitle}>Fresh session</strong>
          <p className={styles.cardBody}>A new session is created for the workflow run, then your workflow owns the turn by calling session methods directly.</p>
        </div>

        <div className={styles.flowConnector}><span /></div>

        <div className={styles.flowCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="send" tone="host" />
            <span className={styles.eyebrow}>Run</span>
          </div>
          <strong className={styles.cardTitle}>Workflow.Run(ctx, session)</strong>
          <p className={styles.cardBody}>This is the business logic boundary. The workflow crafts the prompt, submits the message, and decides what success means.</p>
        </div>
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.detailCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="send" tone="host" />
            <span className={styles.eyebrow}>Outputs</span>
          </div>
          <strong className={styles.cardTitle}>Sinks capture the final result</strong>
          <p className={styles.cardBody}>Stdout, file, webhook, or custom sinks run after every execution. They receive accumulated output, timing, and error information.</p>
        </div>

        <div className={`${styles.detailCard} ${styles.detailCardState}`}>
          <div className={styles.cardTop}>
            <IconBadge icon="database" tone="ops" />
            <span className={styles.eyebrow}>State</span>
          </div>
          <strong className={styles.cardTitle}>Execution state is separate from memory</strong>
          <p className={styles.cardBody}>StateStore persists last run status, counters, and next-run metadata. It is not the same thing as chat memory, RAG, or knowledge graphs.</p>
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
          <th>Name</th>
          <th>Type / Shape</th>
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

export default function BuildingWorkflows() {
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
        <span className={articleStyles.breadCurrent}>Building Workflows</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Building Workflows</h1>
        <p className={articleStyles.sub}>
          Seshat workflows are not a separate graph engine bolted on top of the runtime. They are runtime-native executions built from the same SDK session model, then wrapped with scheduling, retries, sinks, and execution state when you need automation discipline.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section id="overview" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>What “workflow” means here</h2>
            <p className={styles.sectionLead}>
              In Seshat today, a workflow is best understood as one controlled mission executed inside one fresh runtime session. That makes it ideal for recurring research, maintenance, compliance, reporting, alert triage, or other automation jobs where each run should be isolated and observable.
            </p>
            <div className={articleStyles.callout}>
              <div className={articleStyles.calloutTitle}>Important distinction</div>
              <p className={articleStyles.calloutText}>
                This layer is not a DAG designer or a node-graph DSL. If you need a clean per-run execution contract over the runtime, use <span className={articleStyles.inlineCode}>pkg/automation</span>. If you need a durable multi-turn or multi-agent product loop, stay closer to <span className={articleStyles.inlineCode}>pkg/sdk</span> or the mailbox runtime.
              </p>
            </div>
          </section>

          <section id="architecture" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Workflow Architecture Map</h2>
            <p className={styles.sectionLead}>
              The package split matters. <span className={articleStyles.inlineCode}>Workflow</span> carries business intent, <span className={articleStyles.inlineCode}>Executor</span> carries operational control, and <span className={articleStyles.inlineCode}>Runner</span> is the bridge back into the normal mono-run runtime.
            </p>
            <WorkflowMapDiagram />
          </section>

          <section id="execution-contract" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Execution Contract</h2>
            <p className={styles.sectionLead}>
              These are the public primitives exposed by <span className={articleStyles.inlineCode}>pkg/automation</span>. They are small on purpose, but they already give you a workable host-side automation surface.
            </p>
            <ReferenceTable rows={PRIMITIVE_ROWS} />
            <h3 className={articleStyles.h3}>Per-run options</h3>
            <ReferenceTable rows={OPTION_ROWS} />
            <p className={articleStyles.p}>
              If a workflow needs to fully replace the stock system prompt, implement <span className={articleStyles.inlineCode}>automation.SystemPrompter</span>. That replacement is total, not additive, so use it only when the workflow truly needs a dedicated contract.
            </p>
            <DocCodeBlock code={SYSTEM_PROMPT_WORKFLOW} label="Custom system prompt workflow" language="go" />
          </section>

          <section id="scenario-one-shot" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Scenario 1: one-shot isolated workflow</h2>
            <p className={styles.sectionLead}>
              Start here for internal automation. Put business parameters in the workflow struct, keep the run body inside <span className={articleStyles.inlineCode}>Run</span>, and let the executor handle output capture.
            </p>
            <DocCodeBlock code={MINIMAL_WORKFLOW} label="Minimal automation workflow" language="go" />
            <div className={articleStyles.grid}>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Why this shape works</div>
                <p className={articleStyles.cardBody}>The workflow stays business-oriented. It knows about prompts and session calls, not about retries, persistence, or webhook delivery.</p>
              </div>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>What you get automatically</div>
                <p className={articleStyles.cardBody}>A fresh runtime session, streamed output accumulation into Result.Output, duration tracking, and a consistent error boundary.</p>
              </div>
            </div>
          </section>

          <section id="scenario-executor" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Scenario 2: add operational control with Executor</h2>
            <p className={styles.sectionLead}>
              This is the real production layer. Middleware adds retry, timeout, logging, recovery, and metrics. Sinks define where results go. StateStore makes the workflow observable across restarts.
            </p>
            <DocCodeBlock code={CONTROLLED_EXECUTOR} label="Executor with middleware, sinks, and state" language="go" />
            <div className={articleStyles.callout}>
              <div className={articleStyles.calloutTitle}>Current behavior to know</div>
              <p className={articleStyles.calloutText}>
                <span className={articleStyles.inlineCode}>WithRecovery()</span> is always prepended by <span className={articleStyles.inlineCode}>NewExecutor</span>, and sinks still run even when the workflow fails. That makes the output path reliable for ops reporting.
              </p>
            </div>
          </section>

          <section id="scenario-scheduled" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Scenario 3: scheduling and persistent run state</h2>
            <p className={styles.sectionLead}>
              When you want recurring automation, put the executor behind a scheduler. The built-in scheduler supports interval, once, and cron patterns, and it exposes the next upcoming runs for inspection.
            </p>
            <DocCodeBlock code={SCHEDULED_WORKFLOW} label="Scheduled automation" language="go" />
            <div className={articleStyles.grid}>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Interval schedule</div>
                <p className={articleStyles.cardBody}>Use <span className={articleStyles.inlineCode}>automation.Every</span> for simple recurring jobs such as “every 6 hours” or “every day”.</p>
              </div>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>One-shot schedule</div>
                <p className={articleStyles.cardBody}>Use <span className={articleStyles.inlineCode}>automation.Once</span> for delayed one-time runs such as approval follow-ups or migration windows.</p>
              </div>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>Cron schedule</div>
                <p className={articleStyles.cardBody}>Use <span className={articleStyles.inlineCode}>automation.Cron</span> or <span className={articleStyles.inlineCode}>automation.MustCron</span> for structured calendars and daily operating rhythms.</p>
              </div>
              <div className={articleStyles.card}>
                <div className={articleStyles.cardTitle}>State store</div>
                <p className={articleStyles.cardBody}>Use <span className={articleStyles.inlineCode}>FileStateStore</span> when the process may restart and you still want run counters and last-status visibility.</p>
              </div>
            </div>
          </section>

          <section id="scenario-choice" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Choose the right runtime layer</h2>
            <p className={styles.sectionLead}>
              The most common mistake is forcing everything into the automation package. Use it when it fits. Drop lower or move sideways when your product shape demands it.
            </p>
            <ReferenceTable rows={CHOICE_ROWS} />
            <div className={styles.choiceBoard}>
              <div className={styles.choiceGrid}>
                <div className={`${styles.choiceCard} ${styles.choiceCardStrong}`}>
                  <span className={styles.choiceBadge}>Choose automation</span>
                  <strong className={styles.choiceTitle}>When each run should start clean</strong>
                  <p className={styles.choiceBody}>Scheduled research, recurring compliance checks, repo audits, daily digests, or background maintenance jobs fit the current automation surface well.</p>
                  <ul className={styles.tinyList}>
                    <li>Fresh session per execution</li>
                    <li>Retry and timeout policy</li>
                    <li>File or webhook delivery</li>
                    <li>Simple cron-style scheduling</li>
                  </ul>
                </div>

                <div className={styles.choiceCard}>
                  <span className={styles.choiceBadge}>Choose raw SDK</span>
                  <strong className={styles.choiceTitle}>When the workflow is really a product conversation</strong>
                  <p className={styles.choiceBody}>If users need approvals, long-lived context, prompt appends, session resume, or memory-backed interactions, keep control at the SDK layer instead of wrapping it too early.</p>
                  <ul className={styles.tinyList}>
                    <li>Persisted sessions</li>
                    <li>Interactive permission flows</li>
                    <li>Prompt appends and session shaping</li>
                    <li>Richer runtime event handling</li>
                  </ul>
                </div>
              </div>
            </div>
            <DocCodeBlock code={DIRECT_SDK_FLOW} label="When to stay on pkg/sdk directly" language="go" />
          </section>

          <section id="current-shape" className={`${articleStyles.section} ${styles.anchorSection}`}>
            <h2 className={articleStyles.h2}>Current shape and next likely enrichments</h2>
            <p className={styles.sectionLead}>
              The current automation layer is already useful, but it is intentionally narrow. Knowing the real shape helps you document and extend it correctly instead of assuming features that are not wired yet.
            </p>
            <ReferenceTable rows={CURRENT_ROWS} />
            <div className={styles.linkRow}>
              <Link className={articleStyles.link} to="/docs/concepts/runtime-modes" state={{ from: location.pathname }}>
                Runtime Modes
              </Link>
              <Link className={articleStyles.link} to="/docs/concepts/agent-teams" state={{ from: location.pathname }}>
                Agent Teams and Mailboxes
              </Link>
              <Link className={articleStyles.link} to="/docs/sdk/go-tools" state={{ from: location.pathname }}>
                Tools &amp; Surface
              </Link>
            </div>
          </section>
        </div>

        <aside className={styles.aside}>
          <DocOnPageNav title="Building Workflows" items={ON_PAGE} />
        </aside>
      </div>
    </article>
  )
}
