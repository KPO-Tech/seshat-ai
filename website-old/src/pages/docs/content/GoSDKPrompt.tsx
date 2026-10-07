import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './SDKPromptDocs.module.css'

type Tone = 'agent' | 'prompt' | 'runtime' | 'context'
type IconName = 'layers' | 'stack' | 'shield' | 'spark' | 'flow' | 'boundary'

type PromptSurfaceRow = {
  api: string
  scope: string
  purpose: string
  effect: string
  notes: string
}

type PromptSectionRow = {
  name: string
  priority: string
  layer: string
  purpose: string
  notes: string
}

type StageRow = {
  name: string
  value: string
  typicalUse: string
  effect: string
}

const STRUCTURED_PROMPT = `func ptr(value string) *string { return &value }

client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey: os.Getenv("ANTHROPIC_API_KEY"),
    PromptConfig: &sdk.PromptConfig{
        AppendSystemPrompt: ptr(\`Business context:
- Reliability beats speed.
- Migrations must be backward compatible.\`),
        ToolHints: map[string]string{
            "bash":        "Prefer inspection commands before mutating commands.",
            "apply_patch": "Keep edits minimal and reviewable.",
        },
        StageOverrides: map[sdk.ExecutionStage]string{
            sdk.StagePlan: \`# Stage: plan mode

Tool execution is suspended.
- Produce a concise numbered plan.
- Mention risks and validation steps.
- Do not execute tools.\`,
        },
    },
})`

const FULL_OVERRIDE = `func ptr(value string) *string { return &value }

client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey: os.Getenv("ANTHROPIC_API_KEY"),
    PromptConfig: &sdk.PromptConfig{
        SystemPrompt: ptr(\`You are the internal release-audit runtime.

Rules:
- Be conservative.
- Audit for regressions and rollback risk.
- Return blockers before suggestions.\`),
    },
})`

const SESSION_APPEND = `session, err := client.CreateSession(ctx)
if err != nil {
    log.Fatal(err)
}
defer session.Close()

session.SetAppendSystemPrompt(\`Release context:
- branch: release/2026.06
- freeze: active
- production incidents: 0 open\`)

_, err = session.SubmitMessage(ctx, "Inspect the auth service for release blockers.")`

const STAGE_PLAN = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey: os.Getenv("ANTHROPIC_API_KEY"),
    PromptConfig: &sdk.PromptConfig{
        Stage: sdk.StagePlan,
    },
})`

const PROMPT_SURFACE_ROWS: PromptSurfaceRow[] = [
  {
    api: 'ClientConfig.SystemPromptTemplate',
    scope: 'client',
    purpose: 'Provides a base system prompt template for the client.',
    effect: 'Replaces the default Seshat stable identity while keeping runtime-owned dynamic context.',
    notes: 'Best when you want one durable persona per client.',
  },
  {
    api: 'PromptConfig.SystemPrompt',
    scope: 'client',
    purpose: 'Performs the strongest prompt override.',
    effect: 'Replaces the core stable prompt contract and skips the normal stable core sections.',
    notes: 'Use deliberately; you now own more of the behavior contract yourself.',
  },
  {
    api: 'PromptConfig.AppendSystemPrompt',
    scope: 'client',
    purpose: 'Appends stable business or product context after runtime-built sections.',
    effect: 'Adds domain context every turn without replacing the base persona.',
    notes: 'Often the safest customization path.',
  },
  {
    api: 'PromptConfig.Stage',
    scope: 'client',
    purpose: 'Pins the prompt into a specific execution-stage overlay.',
    effect: 'Injects the selected stage behavior into the dynamic prompt section.',
    notes: 'Useful for forcing plan mode from the host side.',
  },
  {
    api: 'PromptConfig.StageOverrides',
    scope: 'client',
    purpose: 'Replaces built-in overlay text for one or more stages.',
    effect: 'Lets the host keep runtime stages but rewrite their instructions.',
    notes: 'Good for custom planning or continuation discipline.',
  },
  {
    api: 'PromptConfig.ToolHints',
    scope: 'client',
    purpose: 'Adds extra guidance to chosen provider-facing tool descriptions.',
    effect: 'Changes tool selection behavior without editing tool definitions.',
    notes: 'Hints are applied per canonical tool name.',
  },
  {
    api: 'Session.SetSystemPromptTemplate',
    scope: 'session',
    purpose: 'Overrides the client-level base prompt for one run.',
    effect: 'Creates a session-specific persona while keeping the same runtime stack.',
    notes: 'Empty string clears the override.',
  },
  {
    api: 'Session.SetAppendSystemPrompt',
    scope: 'session',
    purpose: 'Adds run-specific appended context.',
    effect: 'Useful for one release window, tenant context, or assignment-specific rules.',
    notes: 'Empty string clears the override.',
  },
  {
    api: 'Session.SetWorkingDirectory',
    scope: 'session',
    purpose: 'Changes the working directory used in runtime prompt context.',
    effect: 'Also changes where project instructions are discovered from.',
    notes: 'Project instructions lookup checks SESHAT.md, AGENTS.md, and .seshat/instructions.md in that root.',
  },
  {
    api: 'PromptFn',
    scope: 'client',
    purpose: 'Bridges runtime-to-user prompts such as approvals or questions.',
    effect: 'Does not customize the system prompt itself.',
    notes: 'Important to document because developers often confuse it with prompt shaping.',
  },
]

const PROMPT_SECTION_ROWS: PromptSectionRow[] = [
  {
    name: 'identity',
    priority: '1000',
    layer: 'stable',
    purpose: 'Defines the default Seshat role and baseline identity.',
    notes: 'Part of the cacheable stable prefix.',
  },
  {
    name: 'runtime_contract',
    priority: '975',
    layer: 'stable',
    purpose: 'Defines transcript correctness and recoverable runtime behavior.',
    notes: 'Stable core behavior contract.',
  },
  {
    name: 'working_rules',
    priority: '950',
    layer: 'stable',
    purpose: 'Covers read-before-write discipline and destructive-action caution.',
    notes: 'One of the main guardrail sections.',
  },
  {
    name: 'factual_discipline',
    priority: '940',
    layer: 'stable',
    purpose: 'Pushes verification over unsupported claims.',
    notes: 'Important for high-risk or current facts.',
  },
  {
    name: 'tool_use',
    priority: '900',
    layer: 'stable',
    purpose: 'Explains how the model should use the runtime tool surface.',
    notes: 'Includes progress-tracking and ask-user guidance.',
  },
  {
    name: 'tool_priority',
    priority: '899',
    layer: 'stable',
    purpose: 'Defines preferred tool ordering and information-gathering chain.',
    notes: 'Includes MCP-vs-builtin preference rules.',
  },
  {
    name: 'workflow',
    priority: '898',
    layer: 'stable',
    purpose: 'Defines the default mono-run workflow order.',
    notes: 'Connects repo inspection, todo tracking, delegation, and completion rules.',
  },
  {
    name: 'modes',
    priority: '897',
    layer: 'stable',
    purpose: 'Explains plan mode and sub-agent usage.',
    notes: 'Part of the built-in orchestration behavior.',
  },
  {
    name: 'orchestration',
    priority: '895',
    layer: 'stable',
    purpose: 'Gives deeper rules for delegation and sub-agent prompt writing.',
    notes: 'Extends the multi-agent discipline.',
  },
  {
    name: 'workflow_examples',
    priority: '890',
    layer: 'stable',
    purpose: 'Provides example execution patterns for direct work, planning, and delegation.',
    notes: 'Stable example section in the shipped prompt.',
  },
  {
    name: 'verification_examples',
    priority: '888',
    layer: 'stable',
    purpose: 'Shows when local evidence is enough versus when verification is required.',
    notes: 'Strengthens the factual-discipline contract.',
  },
  {
    name: 'output_discipline',
    priority: '875',
    layer: 'stable',
    purpose: 'Constrain final output style toward concise implementation-oriented responses.',
    notes: 'Last stable section before the dynamic boundary.',
  },
  {
    name: 'dynamic_boundary',
    priority: '850',
    layer: 'dynamic marker',
    purpose: 'Separates cacheable stable prompt text from turn-specific dynamic content.',
    notes: 'Structural marker only; it is not rendered into the provider-facing prompt text.',
  },
  {
    name: 'runtime_context',
    priority: '800',
    layer: 'dynamic',
    purpose: 'Injects session id, turn number, working directory, model, provider, and visible tools.',
    notes: 'Changes every turn and is never part of the stable cacheable prefix.',
  },
  {
    name: 'runtime_guidance',
    priority: '780',
    layer: 'dynamic',
    purpose: 'Explains how to interpret the live runtime context and tool surface.',
    notes: 'Built dynamically by the prompt builder.',
  },
  {
    name: 'project_instructions',
    priority: '775',
    layer: 'dynamic',
    purpose: 'Injects project-level instructions discovered from the working directory.',
    notes: 'Checks SESHAT.md, AGENTS.md, then .seshat/instructions.md, capped at 32 KB.',
  },
  {
    name: 'stage_overlay',
    priority: '770',
    layer: 'dynamic',
    purpose: 'Adds stage-specific instructions such as plan mode or continuation.',
    notes: 'Can be replaced with StageOverrides.',
  },
  {
    name: 'runtime_memory',
    priority: '760',
    layer: 'dynamic',
    purpose: 'Injects memory context when the runtime memory system is active.',
    notes: 'Absent when memory is disabled or no context exists.',
  },
  {
    name: 'append_system_prompt',
    priority: 'after assembly',
    layer: 'dynamic append',
    purpose: 'Adds caller-supplied appended instructions after all runtime-built sections.',
    notes: 'Comes from PromptConfig.AppendSystemPrompt or Session.SetAppendSystemPrompt.',
  },
]

const STAGE_ROWS: StageRow[] = [
  {
    name: 'StageDefault',
    value: '""',
    typicalUse: 'Normal operation with no forced overlay.',
    effect: 'No extra stage section is injected unless the loop auto-detects a stage such as tool-result handling.',
  },
  {
    name: 'StageToolCall',
    value: 'tool_call',
    typicalUse: 'Manual loop wiring when the model is expected to dispatch tools.',
    effect: 'Adds guidance telling the model to proceed with necessary tool calls without duplication.',
  },
  {
    name: 'StageToolResult',
    value: 'tool_result',
    typicalUse: 'Manual or advanced loop control when tool results are being reintegrated.',
    effect: 'Tells the model to integrate results into a direct useful response.',
  },
  {
    name: 'StageContinuation',
    value: 'continuation',
    typicalUse: 'Resume an unfinished response cleanly.',
    effect: 'Adds a continuation nudge that tells the model to resume directly instead of recapping.',
  },
  {
    name: 'StagePlan',
    value: 'plan',
    typicalUse: 'Host-enforced planning mode or custom plan-mode products.',
    effect: 'Suspends tool execution expectations and asks for a numbered plan instead.',
  },
]

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'layers':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
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
    case 'boundary':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h16" />
          <path d="M8 8l-4 4 4 4" />
          <path d="M16 8l4 4-4 4" />
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

function FlowCard({ eyebrow, title, body, meta, tone, icon }: { eyebrow: string; title: string; body: string; meta: string; tone: Tone; icon: IconName }) {
  return (
    <div className={styles.flowCard}>
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

function PromptArchitectureDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.glow} />
      <div className={styles.flowStack}>
        <FlowCard
          eyebrow="Stable Core"
          title="Default Seshat prompt sections"
          body="Identity, runtime contract, working rules, factual discipline, tool use, workflow, modes, orchestration, examples, and output discipline form the cacheable stable prefix."
          meta="Shipped prompt core"
          tone="runtime"
          icon="stack"
        />
        <div className={styles.connector}><span /></div>
        <FlowCard
          eyebrow="Boundary"
          title="Dynamic boundary marker"
          body="The builder inserts a structural marker between stable and dynamic prompt layers. It changes prompt assembly behavior but is never rendered into the final text sent to the provider."
          meta="Assembly-only protocol marker"
          tone="prompt"
          icon="boundary"
        />
        <div className={styles.connector}><span /></div>
        <FlowCard
          eyebrow="Dynamic Runtime"
          title="Runtime context, project instructions, memory, and stage overlay"
          body="The builder injects live session metadata, tool surface, project instructions from the working directory, memory context, and any execution-stage overlay for the current turn."
          meta="Turn-specific runtime layer"
          tone="context"
          icon="flow"
        />
        <div className={styles.connector}><span /></div>
        <FlowCard
          eyebrow="Caller Layer"
          title="Append prompt and session overrides"
          body="Client-level and session-level overrides can replace the base persona or append durable and run-specific business context after the runtime-owned layers."
          meta="Host-controlled customization"
          tone="agent"
          icon="shield"
        />
        <div className={styles.connector}><span /></div>
        <FlowCard
          eyebrow="Provider Layer"
          title="Provider-facing tool definitions with hints"
          body="Tool hints do not rewrite the main system prompt. They are appended to provider-facing tool descriptions so tool choice behavior can change without mutating tool code."
          meta="Prompt plus tool-definition shaping"
          tone="prompt"
          icon="spark"
        />
      </div>
    </div>
  )
}

function PromptSurfaceTable() {
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
        {PROMPT_SURFACE_ROWS.map(row => (
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

function PromptSectionsTable() {
  return (
    <DocTable variant="balanced" className={styles.fixedTable}>
      <colgroup>
        <col className={styles.sectionColName} />
        <col className={styles.sectionColPriority} />
        <col className={styles.sectionColLayer} />
        <col className={styles.sectionColPurpose} />
        <col className={styles.sectionColNotes} />
      </colgroup>
      <thead>
        <tr>
          <th>Section</th>
          <th>Priority</th>
          <th>Layer</th>
          <th>Purpose</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {PROMPT_SECTION_ROWS.map(row => (
          <tr key={row.name}>
            <td className={styles.monoCell}>{row.name}</td>
            <td className={styles.monoCell}>{row.priority}</td>
            <td>{row.layer}</td>
            <td>{row.purpose}</td>
            <td className={styles.noteCell}>{row.notes}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function StageTable() {
  return (
    <DocTable variant="balanced" className={styles.fixedTable}>
      <colgroup>
        <col className={styles.stageColName} />
        <col className={styles.stageColValue} />
        <col className={styles.stageColUse} />
        <col className={styles.stageColEffect} />
      </colgroup>
      <thead>
        <tr>
          <th>Stage constant</th>
          <th>Value</th>
          <th>Typical use</th>
          <th>Effect</th>
        </tr>
      </thead>
      <tbody>
        {STAGE_ROWS.map(row => (
          <tr key={row.name}>
            <td className={styles.monoCell}>{row.name}</td>
            <td className={styles.monoCell}>{row.value}</td>
            <td>{row.typicalUse}</td>
            <td className={styles.noteCell}>{row.effect}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function GoSDKPrompt() {
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
        <span className={articleStyles.breadCurrent}>Prompt</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Prompt</h1>
        <p className={articleStyles.sub}>
          Seshat does not treat the system prompt as one flat string glued together at random. The runtime builds a layered prompt with a stable core, a dynamic boundary, turn-specific runtime context, project instructions, memory, stage overlays, appended caller context, and provider-facing tool hints. This page documents that architecture and every important prompt-shaping parameter exposed to Go SDK developers.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Prompt Assembly Architecture</h2>
        <p className={articleStyles.p}>
          The prompt builder is intentionally layered so that stable identity and behavior rules remain cacheable while live session context stays dynamic. That is why Seshat can preserve a durable runtime contract without pretending the whole prompt is static across turns.
        </p>
        <PromptArchitectureDiagram />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>The Pre-Existing Prompt Core</h2>
        <p className={articleStyles.p}>
          Before your application appends or overrides anything, Seshat already ships a substantial default prompt core. It covers identity, runtime contract, working rules, factual discipline, tool usage, workflow, orchestration, examples, and output discipline.
        </p>
        <PromptSectionsTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Prompt Parameters And Overrides</h2>
        <p className={articleStyles.p}>
          These are the practical Go SDK surfaces that shape the prompt. The table deliberately mixes client-level config with session methods because both matter when you design embedded agent behavior.
        </p>
        <PromptSurfaceTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Structured Prompt Customization</h2>
        <p className={articleStyles.p}>
          In most products, <span className={articleStyles.inlineCode}>PromptConfig</span> is the right first tool. It is strong enough to add durable business context, tool-use bias, and custom stage overlays without forcing a full replacement of the shipped runtime contract.
        </p>
        <DocCodeBlock code={STRUCTURED_PROMPT} label="PromptConfig" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Full Override Versus Safe Extension</h2>
        <p className={articleStyles.p}>
          A full override exists because some host applications genuinely need it, but it should not be your default instinct. Extending the prompt is usually safer than replacing the whole stable contract.
        </p>
        <DocCodeBlock code={FULL_OVERRIDE} label="Full override" language="go" />
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>1</span>
            <span className={styles.summaryLabel}>Append first</span>
            <p className={styles.summaryText}>Use AppendSystemPrompt when you only need extra business or domain context.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>2</span>
            <span className={styles.summaryLabel}>Hint tools second</span>
            <p className={styles.summaryText}>Use ToolHints when the issue is tool-choice behavior rather than the full persona.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>3</span>
            <span className={styles.summaryLabel}>Override last</span>
            <p className={styles.summaryText}>Use SystemPrompt only when you intentionally want to own more of the core behavior contract.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Session-Level Prompt Context</h2>
        <p className={articleStyles.p}>
          Session overrides are the right layer for context that should not affect every future run. Release windows, tenant details, one-off compliance instructions, or temporary operational context belong here.
        </p>
        <DocCodeBlock code={SESSION_APPEND} label="Session append" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Execution Stages</h2>
        <p className={articleStyles.p}>
          Stages are not generic labels. They are real overlays injected into the dynamic prompt layer. You can let the loop infer them when appropriate, or you can pin the stage explicitly from the host side.
        </p>
        <DocCodeBlock code={STAGE_PLAN} label="Pinned stage" language="go" />
        <StageTable />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Project Instructions And Working Directory</h2>
        <p className={articleStyles.p}>
          The prompt builder also pulls project-level instructions from the active working directory. It checks <span className={articleStyles.inlineCode}>SESHAT.md</span>, then <span className={articleStyles.inlineCode}>AGENTS.md</span>, then <span className={articleStyles.inlineCode}>.seshat/instructions.md</span>, taking the first non-empty file and truncating at 32 KB if needed. This is why working-directory control is part of prompt architecture, not just file-tool setup.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>What To Use When</h2>
        <ol className={articleStyles.orderedList}>
          <li>Use <span className={articleStyles.inlineCode}>SystemPromptTemplate</span> for a durable client-level persona.</li>
          <li>Use <span className={articleStyles.inlineCode}>AppendSystemPrompt</span> for stable domain or business context.</li>
          <li>Use <span className={articleStyles.inlineCode}>ToolHints</span> to nudge tool behavior without rewriting the persona.</li>
          <li>Use <span className={articleStyles.inlineCode}>StageOverrides</span> when the built-in plan or continuation wording is not right for your product.</li>
          <li>Use session overrides for one run, one tenant, one release, or one mission.</li>
          <li>Use a full override only when you intentionally want to replace the shipped stable contract.</li>
        </ol>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          Continue with{' '}
          <Link className={articleStyles.link} to="/docs/sdk/agent" state={{ from: location.pathname }}>
            Agent
          </Link>
          {' '}for persona and role patterns,{' '}
          <Link className={articleStyles.link} to="/docs/sdk/go-tools" state={{ from: location.pathname }}>
            Tools &amp; Surface
          </Link>
          {' '}for the action layer, or{' '}
          <Link className={articleStyles.link} to="/docs/concepts/mono-run" state={{ from: location.pathname }}>
            Mono-Run Architecture
          </Link>
          {' '}for the runtime-side view behind this prompt assembly.
        </p>
      </section>
    </article>
  )
}
