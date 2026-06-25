import { Link, useLocation } from 'react-router-dom'
import articleStyles from './DocArticle.module.css'
import styles from './MonoRunArchitecture.module.css'

type Tone = 'entry' | 'engine' | 'runtime' | 'system'
type IconName =
  | 'terminal'
  | 'network'
  | 'package'
  | 'window'
  | 'spark'
  | 'cpu'
  | 'chat'
  | 'refresh'
  | 'layers'
  | 'shield'
  | 'tools'
  | 'route'
  | 'database'
  | 'filter'
  | 'check'
  | 'branch'
  | 'bolt'
  | 'folder'
  | 'stack'
  | 'radar'

type VisualNodeProps = {
  eyebrow?: string
  title: string
  body: string
  tone?: Tone
  icon: IconName
}

type MapCardProps = {
  title: string
  packageName: string
  files: string
  body: string
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
    case 'package':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l8 4.5v11L12 22 4 17.5v-11L12 2z" />
          <path d="M4 6.5L12 11l8-4.5" />
          <path d="M12 11v11" />
        </svg>
      )
    case 'window':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="8" y1="4" x2="8" y2="20" />
        </svg>
      )
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
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
    case 'layers':
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
    case 'tools':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 7l3-3 3 3-3 3" />
          <path d="M4 20l9-9" />
          <path d="M12 4l8 8" />
        </svg>
      )
    case 'route':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M8 6h4a4 4 0 0 1 4 4v2" />
          <path d="M16 14v2" />
          <path d="M10 18h6" />
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
    case 'filter':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />
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
    case 'bolt':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" />
        </svg>
      )
    case 'folder':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h6l2 2h10v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5V7z" />
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
    case 'radar':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 12l5-5" />
          <circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}

function IconBadge({ icon, tone = 'system' }: { icon: IconName; tone?: Tone }) {
  return (
    <span className={`${styles.iconBadge} ${styles[`iconTone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
      <IconGlyph name={icon} />
    </span>
  )
}

function NodeCard({ eyebrow, title, body, tone = 'system', icon }: VisualNodeProps) {
  return (
    <div className={`${styles.nodeCard} ${styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
      <div className={styles.nodeTop}>
        <IconBadge icon={icon} tone={tone} />
        {eyebrow ? <span className={styles.nodeEyebrow}>{eyebrow}</span> : null}
      </div>
      <strong className={styles.nodeTitle}>{title}</strong>
      <p className={styles.nodeBody}>{body}</p>
    </div>
  )
}

function RuntimeMapDiagram() {
  return (
    <div className={styles.diagramBoard}>
      <div className={styles.diagramGlow} />
      <div className={styles.entryRail}>
        <NodeCard eyebrow="Entry" title="CLI" body="Terminal command surface" tone="entry" icon="terminal" />
        <NodeCard eyebrow="Entry" title="gRPC" body="Remote runtime access" tone="entry" icon="network" />
        <NodeCard eyebrow="Entry" title="Go SDK" body="Embedding and local control" tone="entry" icon="package" />
        <NodeCard eyebrow="Entry" title="seshat-ai" body="Desktop and product layer" tone="entry" icon="window" />
      </div>

      <div className={styles.centerLine} />

      <div className={styles.sdkHubWrap}>
        <div className={styles.flowPulse} />
        <NodeCard
          eyebrow="Composition Boundary"
          title="sdk.Client"
          body="Wires providers, prompt, tools, permissions, runtime memory, browser, persistence, and monitoring once."
          tone="system"
          icon="spark"
        />
      </div>

      <div className={styles.centerLine} />

      <div className={styles.coreRail}>
        <NodeCard eyebrow="Core" title="Engine" body="Owns long-lived runtime wiring and session creation." tone="engine" icon="cpu" />
        <div className={styles.horizontalConnector}><span /></div>
        <NodeCard eyebrow="Core" title="Session" body="Owns canonical transcript, counters, tool surface, and permission state." tone="engine" icon="chat" />
        <div className={styles.horizontalConnector}><span /></div>
        <NodeCard eyebrow="Core" title="Loop" body="Runs the turn until a legitimate terminal state exists." tone="engine" icon="refresh" />
      </div>

      <div className={styles.subsystemShell}>
        <div className={styles.subsystemColumn}>
          <NodeCard eyebrow="Input" title="Prompt" body="Builder + Assembler compose the provider-facing system prompt." tone="system" icon="layers" />
          <NodeCard eyebrow="Control" title="Permissions" body="Safety checks, modes, prompts, and session approvals stay in-path." tone="system" icon="shield" />
          <NodeCard eyebrow="Surface" title="Tools" body="Registry + SurfaceBuilder derive one deterministic tool surface." tone="system" icon="tools" />
        </div>

        <div className={styles.loopHub}>
          <div className={styles.loopRing}>
            <div className={styles.loopCenter}>
              <IconBadge icon="radar" tone="engine" />
              <span className={styles.loopLabel}>Mono-Run Boundary</span>
              <strong className={styles.loopTitle}>One Runtime Owns the Turn</strong>
              <p className={styles.loopBody}>
                Prompt assembly, model call, tool execution, recovery, persistence, and continuation stay inside the same execution owner.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.subsystemColumn}>
          <NodeCard eyebrow="Model I/O" title="Providers" body="Streaming request path, retry strategy, fallback client, and circuit breaker." tone="runtime" icon="route" />
          <NodeCard eyebrow="Action" title="Execution" body="Orchestrator validates, gates, batches, executes, and formats tool calls." tone="runtime" icon="bolt" />
          <NodeCard eyebrow="Recovery" title="Runtime State" body="Compaction, checkpoints, artifacts, plans, and local session persistence." tone="runtime" icon="database" />
        </div>
      </div>

      <div className={styles.centerLineTall} />

      <div className={styles.runtimeRootCard}>
        <div className={styles.runtimeRootHeader}>
          <span className={styles.runtimeRootBadge}>Local Gravity</span>
          <strong className={styles.runtimeRootTitle}>SESHAT_RUNTIME_ROOT</strong>
        </div>
        <p className={styles.runtimeRootText}>
          One local root holds sessions, checkpoints, artifacts, logs, plans, skills, caches, and runtime-owned state. Recovery stays physically attached to execution.
        </p>
      </div>
    </div>
  )
}

function QueryLoopDiagram() {
  return (
    <div className={styles.queryBoard}>
      <div className={styles.diagramIntro}>
        <div>
          <span className={styles.diagramBadge}>Query Loop</span>
          <strong className={styles.diagramTitle}>One turn is a bounded state machine.</strong>
        </div>
        <p className={styles.diagramText}>
          The loop does not stop at the first model response. It keeps ownership until it can legitimately terminate or continue with recovery.
        </p>
      </div>

      <div className={styles.queryCanvas}>
        <div className={styles.queryMainRail}>
          <div className={styles.queryCard}>
            <div className={styles.queryCardHeader}>
              <IconBadge icon="radar" tone="engine" />
              <div>
                <span className={styles.promptColumnEyebrow}>Entry</span>
                <strong className={styles.queryCardTitle}>Loop.Run(req)</strong>
              </div>
            </div>
            <p className={styles.queryCardBody}>Initialize turn state and create the bounded execution owner for this query.</p>
          </div>

          <div className={styles.queryConnector}><span /></div>

          <div className={styles.queryCard}>
            <div className={styles.queryCardHeader}>
              <IconBadge icon="stack" tone="system" />
              <div>
                <span className={styles.promptColumnEyebrow}>Setup</span>
                <strong className={styles.queryCardTitle}>initializeState() + maybeAutoCompact()</strong>
              </div>
            </div>
            <p className={styles.queryCardBody}>Prepare counters, transcript state, recovery context, and compact early if the context window is already tight.</p>
          </div>

          <div className={styles.queryConnector}><span /></div>

          <div className={styles.queryCard}>
            <div className={styles.queryCardHeader}>
              <IconBadge icon="route" tone="runtime" />
              <div>
                <span className={styles.promptColumnEyebrow}>Model Call</span>
                <strong className={styles.queryCardTitle}>callModel()</strong>
              </div>
            </div>
            <p className={styles.queryCardBody}>Send the provider request, stream the answer, classify failures, and preserve recovery context for the same turn.</p>
          </div>
        </div>

        <div className={styles.queryBranchGrid}>
          <div className={styles.queryBranchColumn}>
            <div className={styles.queryDecisionCard}>
              <IconBadge icon="tools" tone="system" />
              <strong className={styles.queryDecisionTitle}>tool_use blocks?</strong>
              <p className={styles.queryDecisionBody}>If the model wants tools, the turn is not done yet.</p>
            </div>
            <div className={styles.queryArrowColumn}><span /></div>
            <div className={styles.queryCard}>
              <div className={styles.queryCardHeader}>
                <IconBadge icon="bolt" tone="runtime" />
                <div>
                  <span className={styles.promptColumnEyebrow}>Yes</span>
                  <strong className={styles.queryCardTitle}>Execute tools</strong>
                </div>
              </div>
              <p className={styles.queryCardBody}>Validate, gate, batch, execute, format, append results, then feed them back into the same transcript.</p>
            </div>
            <div className={styles.queryLoopBack}>Continue loop with fresh tool results</div>
          </div>

          <div className={styles.queryBranchColumn}>
            <div className={styles.queryDecisionCard}>
              <IconBadge icon="check" tone="engine" />
              <strong className={styles.queryDecisionTitle}>end_turn or terminal stop?</strong>
              <p className={styles.queryDecisionBody}>If not, the loop can still nudge, recover, or run stop hooks.</p>
            </div>
            <div className={styles.queryArrowColumn}><span /></div>
            <div className={styles.querySplitRow}>
              <div className={styles.queryMiniCard}>
                <IconBadge icon="refresh" tone="engine" />
                <strong className={styles.queryMiniTitle}>Nudge / recovery</strong>
                <p className={styles.queryMiniBody}>Continuation nudge, max-token resume, or recoverable retry path.</p>
              </div>
              <div className={styles.queryMiniCard}>
                <IconBadge icon="shield" tone="system" />
                <strong className={styles.queryMiniTitle}>Stop hooks</strong>
                <p className={styles.queryMiniBody}>Hooks can inject follow-up work or allow a clean break.</p>
              </div>
            </div>
            <div className={styles.queryLoopBack}>Either re-enter the loop or terminate with RunResult</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PromptAssemblyDiagram() {
  const stableSections = ['identity', 'runtime_contract', 'working_rules', 'tool_use', 'output_discipline', 'tool_catalog']
  const dynamicSections = ['runtime_guidance', 'project_instructions', 'stage_overlay', 'runtime_context', 'runtime_memory']
  const variables = ['cwd', 'session_id', 'turn_id', 'model', 'date', 'memory_context', 'instructions_block']

  return (
    <div className={styles.promptBoard}>
      <div className={styles.diagramIntro}>
        <div>
          <span className={styles.diagramBadge}>Prompt Assembly</span>
          <strong className={styles.diagramTitle}>Two phases, one provider-facing contract.</strong>
        </div>
        <p className={styles.diagramText}>
          The builder prepares stable and dynamic sections, then the assembler injects runtime variables and preserves the cache-safe breakpoint.
        </p>
      </div>

      <div className={styles.promptColumns}>
        <div className={styles.promptColumn}>
          <div className={styles.promptColumnHeader}>
            <IconBadge icon="stack" tone="system" />
            <div>
              <span className={styles.promptColumnEyebrow}>Phase 1</span>
              <strong className={styles.promptColumnTitle}>Stable sections</strong>
            </div>
          </div>
          <div className={styles.promptList}>
            {stableSections.map((item) => (
              <div key={item} className={styles.promptListItem}>
                <span>{item}</span>
                <small>cacheable</small>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.promptDivider}>
          <div className={styles.promptDividerLine} />
          <span className={styles.promptDividerLabel}>Cache boundary</span>
          <div className={styles.promptDividerLine} />
        </div>

        <div className={styles.promptColumn}>
          <div className={styles.promptColumnHeader}>
            <IconBadge icon="folder" tone="runtime" />
            <div>
              <span className={styles.promptColumnEyebrow}>Phase 1</span>
              <strong className={styles.promptColumnTitle}>Dynamic sections</strong>
            </div>
          </div>
          <div className={styles.promptList}>
            {dynamicSections.map((item) => (
              <div key={item} className={styles.promptListItem}>
                <span>{item}</span>
                <small>per turn</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.promptFooter}>
        <div className={styles.promptFooterHeader}>
          <IconBadge icon="spark" tone="engine" />
          <div>
            <span className={styles.promptColumnEyebrow}>Phase 2</span>
            <strong className={styles.promptColumnTitle}>BuildCanonicalPrompt()</strong>
          </div>
        </div>
        <div className={styles.variableGrid}>
          {variables.map((item) => (
            <span key={item} className={styles.variableChip}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function PermissionPipelineDiagram() {
  const steps = [
    { title: 'Deny rules', body: 'Path patterns, command patterns, and explicit deny entries can stop the request immediately.', icon: 'filter' as const },
    { title: 'Tool-owned checks', body: 'The tool can reject unsafe input before any approval mode is considered.', icon: 'shield' as const },
    { title: 'Always-allow rules', body: 'Trivially safe and explicitly approved patterns can pass without user friction.', icon: 'check' as const },
    { title: 'Permission mode gate', body: 'bypass, never, auto, acceptEdits, onRequest, and granular determine the final path.', icon: 'branch' as const },
  ]

  const modes = ['bypass', 'never', 'auto', 'acceptEdits', 'onRequest', 'granular']

  return (
    <div className={styles.permissionBoard}>
      <div className={styles.diagramIntro}>
        <div>
          <span className={styles.diagramBadge}>Permission Pipeline</span>
          <strong className={styles.diagramTitle}>Safety and approval live inside execution.</strong>
        </div>
        <p className={styles.diagramText}>
          A tool call does not jump outside the runtime for governance. The governance path is the execution path.
        </p>
      </div>

      <div className={styles.permissionTrack}>
        {steps.map((step, index) => (
          <div key={step.title} className={styles.permissionStepWrap}>
            <div className={styles.permissionStep}>
              <IconBadge icon={step.icon} tone="system" />
              <div className={styles.permissionStepCopy}>
                <strong className={styles.permissionStepTitle}>{step.title}</strong>
                <p className={styles.permissionStepBody}>{step.body}</p>
              </div>
            </div>
            {index < steps.length - 1 ? <div className={styles.permissionArrow}><span /></div> : null}
          </div>
        ))}
      </div>

      <div className={styles.modeGrid}>
        {modes.map((mode) => (
          <div key={mode} className={styles.modeCard}>
            <span>{mode}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProviderRoutingDiagram() {
  return (
    <div className={styles.providerBoard}>
      <div className={styles.diagramIntro}>
        <div>
          <span className={styles.diagramBadge}>Provider Routing</span>
          <strong className={styles.diagramTitle}>Retry inside a provider, then branch across models and providers.</strong>
        </div>
        <p className={styles.diagramText}>
          The runtime keeps the same session owner while it retries, falls back, and classifies recoverable failures.
        </p>
      </div>

      <div className={styles.providerGrid}>
        <div className={styles.providerCard}>
          <IconBadge icon="route" tone="runtime" />
          <strong className={styles.providerCardTitle}>Primary client call</strong>
          <p className={styles.providerCardBody}>Create message stream against the selected provider and model.</p>
        </div>

        <div className={styles.providerArrowRow}><span /></div>

        <div className={styles.providerDecision}>
          <IconBadge icon="radar" tone="engine" />
          <strong className={styles.providerCardTitle}>Recoverable error?</strong>
          <p className={styles.providerCardBody}>Rate limit, timeout, network, or temporary overload.</p>
        </div>

        <div className={styles.providerBranchRow}>
          <div className={styles.providerBranchCard}>
            <IconBadge icon="refresh" tone="runtime" />
            <strong className={styles.providerCardTitle}>Retry</strong>
            <p className={styles.providerCardBody}>Exponential backoff with jitter inside the same provider.</p>
          </div>
          <div className={styles.providerBranchCard}>
            <IconBadge icon="branch" tone="runtime" />
            <strong className={styles.providerCardTitle}>Fallback model</strong>
            <p className={styles.providerCardBody}>Try the next configured model in the routing chain.</p>
          </div>
          <div className={styles.providerBranchCard}>
            <IconBadge icon="network" tone="runtime" />
            <strong className={styles.providerCardTitle}>Fallback provider</strong>
            <p className={styles.providerCardBody}>Escalate to the next provider client when models are exhausted.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExecutionPipeline() {
  const executionSteps = [
    { step: '01', title: 'Partition by concurrency safety', body: 'The orchestrator decides which tool calls can run together and which ones must stay serial.', icon: 'branch' as const },
    { step: '02', title: 'Resolve, enable, validate, backfill', body: 'The tool is resolved from the registry, checked for availability, normalized, and enriched before policy decisions.', icon: 'stack' as const },
    { step: '03', title: 'Run hooks and permission gate', body: 'Pre-tool hooks fire, then deny rules, tool-owned checks, allow rules, and permission modes decide allow, deny, or ask.', icon: 'shield' as const },
    { step: '04', title: 'Execute and format result', body: 'The runtime calls the tool, runs post-tool hooks, serializes the result, applies size limits, and records traces.', icon: 'bolt' as const },
    { step: '05', title: 'Re-inject into the same transcript', body: 'Tool results become conversation blocks for the same session and the same loop, not an external workflow hop.', icon: 'refresh' as const },
  ]

  return (
    <div className={styles.pipelineBoard}>
      <div className={styles.pipelineRail}>
        {executionSteps.map((item, index) => (
          <div key={item.step} className={styles.pipelineItem}>
            <div className={styles.pipelineStep}>{item.step}</div>
            <div className={styles.pipelineCard}>
              <div className={styles.pipelineCardHeader}>
                <IconBadge icon={item.icon} tone="runtime" />
                <strong className={styles.pipelineTitle}>{item.title}</strong>
              </div>
              <p className={styles.pipelineBody}>{item.body}</p>
            </div>
            {index < executionSteps.length - 1 ? <div className={styles.pipelineConnector}><span /></div> : null}
          </div>
        ))}
      </div>

      <div className={styles.toolSummary}>
        <span className={styles.toolSummaryEyebrow}>Built-in tool families</span>
        <div className={styles.toolSummaryTags}>
          <span>files</span>
          <span>bash</span>
          <span>web</span>
          <span>mcp</span>
          <span>skills</span>
          <span>lsp</span>
          <span>tasks</span>
          <span>agent</span>
        </div>
        <p className={styles.toolSummaryText}>
          The important point is not the count. It is that the same orchestrator owns them all under one permission and transcript contract.
        </p>
      </div>
    </div>
  )
}

function RuntimeRootDiagram() {
  return (
    <div className={styles.storageBoard}>
      <div className={styles.storageHeader}>
        <span className={styles.storageBadge}>Persistence Topology</span>
        <strong className={styles.storageTitle}>One Local Runtime Root, Multiple State Planes</strong>
      </div>

      <div className={styles.storageGrid}>
        <div className={styles.storageGroup}>
          <div className={styles.storageGroupHead}>
            <IconBadge icon="database" tone="runtime" />
            <span className={styles.storageGroupTitle}>Core state</span>
          </div>
          <div className={styles.storageItems}>
            <span>seshat.db</span>
            <span>data/</span>
            <span>cache/</span>
            <span>tmp/</span>
          </div>
        </div>

        <div className={styles.storageGroup}>
          <div className={styles.storageGroupHead}>
            <IconBadge icon="chat" tone="engine" />
            <span className={styles.storageGroupTitle}>Session scope</span>
          </div>
          <div className={styles.storageItems}>
            <span>sessions/{'{id}'}/transcript</span>
            <span>checkpoint</span>
            <span>artifacts/</span>
            <span>tools/</span>
            <span>plans/</span>
            <span>session.log</span>
          </div>
        </div>

        <div className={styles.storageGroup}>
          <div className={styles.storageGroupHead}>
            <IconBadge icon="folder" tone="system" />
            <span className={styles.storageGroupTitle}>Reusable assets</span>
          </div>
          <div className={styles.storageItems}>
            <span>skills/</span>
            <span>logs/</span>
            <span>storage/</span>
            <span>vector data</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const capabilityCards: MapCardProps[] = [
  {
    title: 'Entry surfaces',
    packageName: 'cmd/cli, cmd/grpc, pkg/sdk',
    files: 'main.go, client.go',
    body: 'Different interfaces exist, but they all collapse into the same runtime owner instead of forking execution logic per surface.',
  },
  {
    title: 'Engine core',
    packageName: 'internal/engine',
    files: 'engine.go, session.go, loop.go, state.go',
    body: 'The engine creates sessions, sessions own the durable work state, and the loop owns turn execution until a real stop reason exists.',
  },
  {
    title: 'Prompt system',
    packageName: 'internal/prompt',
    files: 'builder.go, assembler.go, stages.go',
    body: 'Stable and per-turn prompt sections are assembled with a clear cache boundary, stage overlays, and runtime context injection.',
  },
  {
    title: 'Tool runtime',
    packageName: 'internal/execution, internal/tools',
    files: 'orchestrator.go, registry.go, surface_builder.go',
    body: 'Tool resolution, validation, batching, hooks, execution, and serialization are all in the same turn path.',
  },
  {
    title: 'Governance',
    packageName: 'internal/permissions',
    files: 'integration.go, engine.go, denialTracking.go',
    body: 'Permission modes, safe-path matching, approval prompts, and denial degradation are runtime behavior, not UI cosmetics.',
  },
  {
    title: 'Recovery and state',
    packageName: 'internal/runtime, internal/db',
    files: 'memory/engine.go, state/store.go, session_store.go',
    body: 'Compaction, checkpoints, canonical transcript persistence, and restoration live under the same operational root.',
  },
  {
    title: 'Provider layer',
    packageName: 'internal/providers',
    files: 'client.go, retry.go, circuit_breaker.go',
    body: 'Streaming, retry, fallback models, fallback providers, and circuit-breaking are first-class runtime behavior.',
  },
  {
    title: 'Memory and reusable context',
    packageName: 'internal/memory, pkg/runtimepath',
    files: 'manager.go, runtimepath.go',
    body: 'Project memory, user memory, caches, skills, and reusable assets attach to the runtime root instead of floating outside it.',
  },
]

export default function MonoRunArchitecture() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link to={base} className={articleStyles.breadLink}>Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link to={`${base}/concepts`} className={articleStyles.breadLink}>Concepts</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Mono-Run Architecture</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Mono-Run Architecture</h1>
        <p className={articleStyles.sub}>
          Mono-run is the architectural choice that makes Seshat feel like a real runtime instead of a loose collection of
          wrappers. One process owns the session, prompt assembly, provider call, tool execution, permissions, compaction,
          persistence, and recovery. The system is modular internally, but the execution contract is unified.
        </p>
      </header>

      <section className={articleStyles.section}>
        <div className={articleStyles.callout}>
          <span className={articleStyles.calloutTitle}>Short version</span>
          <p className={articleStyles.calloutText}>
            Mono-run does not mean one giant package. It means one runtime boundary. The same executable owns the
            conversation state, the model call, the tool surface, the permission rules, and the local persistence tree,
            instead of delegating those responsibilities to external orchestrators.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>What mono-run really means in Seshat</h2>
        <p className={articleStyles.p}>
          In Seshat, the execution path is intentionally narrow. The entry surface may change, but the runtime core does
          not. A CLI command, a gRPC call, or a higher-level product like <span className={articleStyles.inlineCode}>seshat-ai</span> all converge on the same
          core layers: <span className={articleStyles.inlineCode}>sdk.Client</span>, <span className={articleStyles.inlineCode}>Engine</span>, <span className={articleStyles.inlineCode}>Session</span>, and <span className={articleStyles.inlineCode}>Loop</span>.
        </p>
        <p className={articleStyles.p}>
          That matters because the hard parts of agent execution are not split across unrelated services. Prompt assembly,
          provider routing, permissions, tool execution, transcript compaction, and session persistence live inside the
          same runtime boundary. The result is less orchestration drift, fewer duplicated contracts, and much stronger
          recovery semantics.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Runtime map</h2>
        <RuntimeMapDiagram />
        <p className={articleStyles.p}>
          The outer surfaces are replaceable. The inner execution path is not. That is the core mono-run invariant: every serious
          interaction with the runtime collapses into the same session engine rather than creating parallel orchestration systems
          for each interface.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>1. Wiring happens once, near the edge</h2>
        <p className={articleStyles.p}>
          The most explicit wiring path lives in <span className={articleStyles.inlineCode}>pkg/sdk/client.go</span>. The SDK constructs the provider
          client, execution orchestrator, compaction engine, prompt assembler, permission engine, tool registry, session store,
          browser manager, and memory service, then injects them into <span className={articleStyles.inlineCode}>engine.NewEngine()</span>.
        </p>
        <ul className={articleStyles.list}>
          <li>The runtime is composed from subsystems, not hardcoded as one monolith.</li>
          <li>Once composed, the runtime behaves as one execution owner.</li>
          <li>Every outer surface inherits the same contracts when it goes through the SDK or engine.</li>
        </ul>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>2. The session is the owner of work</h2>
        <p className={articleStyles.p}>
          Mono-run in Seshat is session-centric. <span className={articleStyles.inlineCode}>Engine.NewSessionFromState()</span> creates the live tool surface for that
          session, loads memory, restores metadata, and constructs a <span className={articleStyles.inlineCode}>SessionState</span> object that survives across turns.
          The session is not a thin wrapper around a provider API. It owns canonical messages, permission context,
          discovered deferred tools, token counters, compaction metadata, and turn advancement.
        </p>
        <p className={articleStyles.p}>
          This is one of the most important design decisions in the codebase. The fundamental unit is not a raw request or
          a transient workflow node. It is a durable session that can resume, recover, and keep responsibility for the
          evolving transcript.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>3. Query loop state machine</h2>
        <QueryLoopDiagram />
        <p className={articleStyles.p}>
          The real runtime heart is <span className={articleStyles.inlineCode}>internal/engine/loop.go</span>. A turn is not a single model request. It
          is a bounded execution cycle where the runtime may compact context, call the provider, parse tool uses, execute
          tools, refresh the prompt, recover from retryable failures, and continue until it reaches a legitimate terminal
          state.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>4. Prompt assembly pipeline</h2>
        <PromptAssemblyDiagram />
        <p className={articleStyles.p}>
          The prompt path is one of the places where mono-run becomes operationally useful. The builder and assembler do not
          produce a random string on the side. They produce the provider-facing system prompt from the exact same session,
          mode, tool surface, and runtime state that the loop will execute against.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>5. Tool execution pipeline</h2>
        <ExecutionPipeline />
        <p className={articleStyles.p}>
          The orchestrator in <span className={articleStyles.inlineCode}>internal/execution/orchestrator.go</span> is where tool usage stops being
          decorative and becomes runtime behavior. It partitions concurrent and serial work, validates inputs, runs hooks,
          applies permissions, executes tools, formats results, and pushes those results back into the same conversation.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>6. Permissions are inside the execution path, not outside it</h2>
        <PermissionPipelineDiagram />
        <p className={articleStyles.p}>
          Permissions in Seshat are not a UI-only feature layered on top of agent output. The runtime enforces them in the
          same path that executes tools. The orchestrator runs safety checks and permission resolution before a tool call,
          while the permission integrator manages session approvals, prompt-based confirmation, dont-ask mode, auto mode,
          and persisted per-session allowances.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>7. Provider routing and recovery</h2>
        <ProviderRoutingDiagram />
        <p className={articleStyles.p}>
          The runtime can recover at several levels without breaking session ownership. A timeout, rate limit, or overload
          error does not automatically terminate the session. The loop can retry, continue with recovery context, or move
          to fallback models and fallback providers while preserving the same turn.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>8. State, recovery, and artifacts live under one local root</h2>
        <RuntimeRootDiagram />
        <p className={articleStyles.p}>
          The runtime root gives the architecture a physical center of gravity. Sessions, checkpoints, artifacts, logs,
          plans, skills, caches, vector data, and temporary task state all resolve under one local tree via
          <span className={articleStyles.inlineCode}>SESHAT_RUNTIME_ROOT</span>.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>9. Mono-run is modular, not monolithic</h2>
        <p className={articleStyles.p}>
          Internally, the runtime is deliberately split into subsystems: <span className={articleStyles.inlineCode}>engine</span>, <span className={articleStyles.inlineCode}>execution</span>,
          <span className={articleStyles.inlineCode}>prompt</span>, <span className={articleStyles.inlineCode}>providers</span>, <span className={articleStyles.inlineCode}>permissions</span>, <span className={articleStyles.inlineCode}>runtime</span>, <span className={articleStyles.inlineCode}>tools</span>,
          <span className={articleStyles.inlineCode}>web</span>, <span className={articleStyles.inlineCode}>memory</span>, and more. Mono-run does not deny modularity. It constrains how those modules
          cooperate at runtime.
        </p>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Inside the boundary</span>
            <p className={articleStyles.cardBody}>
              Clear packages, explicit wiring, replaceable subsystems, and a stable engine/session/loop core.
            </p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>At the boundary</span>
            <p className={articleStyles.cardBody}>
              One runtime owns the turn lifecycle, rather than outsourcing each concern to a different service.
            </p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>10. Subsystem reference map</h2>
        <div className={styles.referenceGrid}>
          {capabilityCards.map((item) => (
            <div key={item.title} className={styles.referenceCard}>
              <span className={styles.referencePackage}>{item.packageName}</span>
              <strong className={styles.referenceTitle}>{item.title}</strong>
              <span className={styles.referenceFiles}>{item.files}</span>
              <p className={styles.referenceBody}>{item.body}</p>
            </div>
          ))}
        </div>
      </section>


      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Why this architecture matters</h2>
        <p className={articleStyles.p}>
          The advantage of mono-run is not aesthetic purity. It is operational coherence. The provider request, the prompt
          cache boundary, the permission mode, the tool map, the transcript, the checkpoint, and the artifact paths all
          belong to one runtime owner. That makes the system easier to reason about, easier to recover, and much harder to
          split into contradictory states.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Next concept</h2>
        <p className={articleStyles.p}>
          Once mono-run is clear, the next important layer is understanding how memory, retrieval, and compaction preserve
          long-running work without letting the transcript collapse under its own weight.
        </p>
        <div className={articleStyles.actionRow}>
          <Link to={`${base}/concepts/what-is-seshat`} className={articleStyles.secondaryLink}>What is Seshat?</Link>
          <Link to={`${base}/guides/cli`} className={articleStyles.secondaryLink}>CLI guide</Link>
          <Link to={`${base}/concepts/memory-rag`} className={articleStyles.primaryLink}>Memory and RAG</Link>
        </div>
      </section>
    </div>
  )
}
