import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import articleStyles from './DocArticle.module.css'
import styles from './ToolsProviders.module.css'

type Tone = 'tool' | 'runtime' | 'capability'
type IconName = 'wrench' | 'stack' | 'plug' | 'search' | 'shield' | 'flow' | 'spark' | 'server'

type ToolStateRow = {
  flag: string
  meaning: string
  whereItComesFrom: string
  effect: string
}

type ToolRow = {
  name: string
  category: string
  enabled: boolean
  readOnly: boolean
  requiresPermission: boolean
}

type ToolFamily = {
  title: string
  body: string
  rows: ToolRow[]
}

const TOOL_INVENTORY = `client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey:         os.Getenv("ANTHROPIC_API_KEY"),
    PermissionMode: sdk.PermissionModeOnRequest,
})
if err != nil {
    log.Fatal(err)
}
defer client.Close()

fmt.Println(client.ToolNames())

surface, err := client.BuildToolSurface(ctx)
if err != nil {
    log.Fatal(err)
}
for _, tool := range surface.Tools {
    fmt.Println(tool.Name)
}`

const TASK_SPECIFIC_SESSION = `session, err := client.CreateSession(ctx)
if err != nil {
    log.Fatal(err)
}
defer session.Close()

session.SetPermissionMode(sdk.PermissionModeOnRequest)

for _, blocked := range []string{"bash", "write_file", "edit_file", "apply_patch"} {
    _ = session.UnregisterTool(blocked)
}

fmt.Println(session.GetToolNames())

resp, err := session.SubmitMessage(ctx, "Audit the repository and report findings only.")
if err != nil {
    log.Fatal(err)
}

fmt.Println(resp.StopReason)`

const PRE_TOOL_HOOKS = `client, err := sdk.NewClient(&sdk.ClientConfig{
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
})`

const MCP_WIRING = `servers := []sdk.MCPServerConfig{
    {
        Name:      "github",
        Transport: sdk.MCPTransportStdio,
        Command:   "npx",
        Args:      []string{"-y", "@modelcontextprotocol/server-github"},
    },
}

client, err := sdk.NewClient(&sdk.ClientConfig{
    Model: sdk.ModelIdentifier{
        Provider: sdk.APIProviderAnthropic,
        Model:    "claude-sonnet-4-20250514",
    },
    APIKey:     os.Getenv("ANTHROPIC_API_KEY"),
    MCPServers: servers,
})
if err != nil {
    log.Fatal(err)
}
defer client.Close()

if err := client.ReloadMCPServers(ctx, servers); err != nil {
    log.Fatal(err)
}`

const HOST_PATTERN = `type WorkerProfile struct {
    Name           string
    PermissionMode sdk.PermissionMode
    RemoveTools    []string
}

func NewWorkerSession(ctx context.Context, client *sdk.Client, profile WorkerProfile) (*sdk.Session, error) {
    session, err := client.CreateSession(ctx)
    if err != nil {
        return nil, err
    }

    session.SetPermissionMode(profile.PermissionMode)
    for _, toolName := range profile.RemoveTools {
        _ = session.UnregisterTool(toolName)
    }

    return session, nil
}

reviewSession, err := NewWorkerSession(ctx, client, WorkerProfile{
    Name:           "review",
    PermissionMode: sdk.PermissionModeOnRequest,
    RemoveTools:    []string{"bash", "write_file", "edit_file", "apply_patch"},
})`

const TOOL_BOUNDARY = `// Public SDK surface today:
// - client.ToolNames()
// - client.BuildToolSurface(ctx)
// - client.RegisterTool(...)
// - session.RegisterTool(...)
// - session.UnregisterTool(...)
// - client.ReloadMCPServers(...)
// - ClientConfig.PreToolHooks
//
// Practical guidance:
// Start with built-in tools + MCP + session shaping first.
// Custom tools are possible, but their implementation still follows the
// underlying runtime tool contract rather than a simplified SDK-only builder.`

const BUILTIN_TOOLS_TSV = `apply_patch	filesystem	true	false	true
ask_user_question	interaction	true	true	false
bash	filesystem	true	false	true
browser_click	browser	true	false	true
browser_close_page	browser	true	false	false
browser_extract	browser	true	true	false
browser_get_network_policy	browser	true	true	false
browser_list_downloads	browser	true	true	false
browser_list_pages	browser	true	true	false
browser_navigate	browser	true	false	true
browser_network_list	browser	true	true	false
browser_open	browser	true	false	true
browser_press	browser	true	false	true
browser_screenshot	browser	true	true	false
browser_scroll	browser	true	true	false
browser_search_content	browser	true	true	false
browser_select_page	browser	true	false	false
browser_set_network_policy	browser	true	false	false
browser_snapshot	browser	true	true	false
browser_type	browser	true	false	true
browser_wait	browser	true	true	false
calculator	math	true	true	false
close_agent	agents	true	false	false
code_complete	code	false	false	false
create_directory	filesystem	true	false	true
create_goal	goal	true	false	false
devto_article	social	true	true	false
devto_feed	social	true	true	false
devto_publish	social	true	false	true
discord_send	notifications	false	false	true
edit_file	filesystem	true	false	true
email_send	notifications	false	false	true
enter_plan_mode	planning	true	true	true
enter_worktree	worktree	true	false	true
exit_plan_mode	mode	true	false	true
exit_worktree	worktree	true	false	true
financial_calc	math	true	true	false
generate_image	creative	false	false	false
get_file_metadata	filesystem	true	true	false
get_goal	goal	true	true	false
git_branch	vcs	false	false	false
git_commit	vcs	false	false	true
git_diff	vcs	false	false	false
git_log	vcs	false	false	false
git_status	vcs	false	false	false
glob	filesystem	true	true	true
grep	filesystem	true	true	true
hn_item	social	true	true	false
hn_search	social	true	true	false
hn_stories	social	true	true	false
job_kill	filesystem	true	false	false
job_output	filesystem	true	false	false
list_agents	agents	true	true	false
list_directory	filesystem	true	true	false
lsp	code_intelligence	true	false	false
mcp	mcp	true	true	true
memory_add_observations	memory	false	false	false
memory_create_entities	memory	false	false	false
memory_open_nodes	memory	false	true	false
memory_search_nodes	memory	false	true	false
monitor	process	true	false	false
notebook_create	notebook	true	false	true
notebook_edit	notebook	true	false	true
notebook_execute	notebook	true	false	true
notebook_kernel	notebook	true	false	true
notebook_read	notebook	true	true	false
notebook_run	notebook	true	false	true
notebook_write	notebook	true	false	true
rag_ingest	rag	false	false	true
rag_search	rag	false	true	false
read_document_url	filesystem	true	true	true
read_file	filesystem	true	true	true
remove_file	filesystem	true	false	true
request_permissions	permissions	true	false	true
send_agent_message	agents	true	false	false
seshat_list_skills		true	true	false
seshat_read_skill		true	true	false
seshat_validate_skill		true	true	false
skill		true	false	false
slack_send	notifications	false	false	true
speech_to_text	audio	false	false	false
statistics	math	true	true	false
submit_plan	mode	false	false	false
task_create	task	true	false	false
task_get	task	true	false	false
task_list	task	true	false	false
task_stop	task	true	false	false
task_update	task	true	false	false
telegram_send	notifications	false	false	true
text_to_speech	audio	false	false	false
tool_search	meta	false	true	false
unit_convert	math	true	true	false
update_goal	goal	true	false	false
wait_agent	agents	true	true	false
web_fetch	web	true	true	false
web_search	web	true	true	true
whatsapp_send	social	false	false	true
write_file	filesystem	true	false	true
write_stdin	filesystem	true	false	false`

const EXTRA_AGENT_TOOLS_TSV = `agent	agent	true	false	true
resume_agent	agents	true	false	false
spawn_agent	agents	true	false	false`

const TOOL_STATE_ROWS: ToolStateRow[] = [
  {
    flag: 'enabled',
    meaning: 'The tool is active in the registry and can participate in the runtime surface.',
    whereItComesFrom: 'tool.IsEnabled()',
    effect: 'The tool may appear in the model-visible surface once the other filters pass.',
  },
  {
    flag: 'disabled',
    meaning: 'The tool is registered conceptually but intentionally not active yet.',
    whereItComesFrom: 'tool.IsEnabled() == false',
    effect: 'The tool is skipped before prompt exposure and execution.',
  },
  {
    flag: 'read-only',
    meaning: 'The tool does not modify state for that specific invocation path.',
    whereItComesFrom: 'Definition.IsReadOnly plus IsReadOnly(input)',
    effect: 'Surface builders and plan mode can treat it differently from mutating tools.',
  },
  {
    flag: 'requires_permission',
    meaning: 'The tool enters the permission pipeline before execution.',
    whereItComesFrom: 'Definition.RequiresPermission',
    effect: 'The user or policy layer may allow, deny, or rewrite access before the call runs.',
  },
  {
    flag: 'deferred',
    meaning: 'The tool should stay out of the initial surface and be discovered later.',
    whereItComesFrom: 'Definition.ShouldDefer or Definition.IsMCP',
    effect: 'When tool search surface mode is enabled, deferred tools stay out of the initial surface and are discovered through tool_search.',
  },
  {
    flag: 'always-load',
    meaning: 'The tool should never be hidden by deferred loading.',
    whereItComesFrom: 'Definition.AlwaysLoad',
    effect: 'The tool remains visible even when deferred loading is active. tool_search is the canonical example.',
  },
  {
    flag: 'surface profile',
    meaning: 'The tool may be limited to mono_run or another specific runtime surface.',
    whereItComesFrom: 'Definition.Metadata.surface_profiles',
    effect: 'A tool can exist in the registry but still be hidden from a given session profile.',
  },
]

function parseToolRows(tsv: string): ToolRow[] {
  return tsv
    .trim()
    .split('\n')
    .map(line => {
      const [name, category = '', enabled = 'false', readOnly = 'false', requiresPermission = 'false'] = line.split('\t')
      return {
        name,
        category,
        enabled: enabled === 'true',
        readOnly: readOnly === 'true',
        requiresPermission: requiresPermission === 'true',
      }
    })
}

const BUILTIN_TOOL_ROWS = parseToolRows(BUILTIN_TOOLS_TSV)
const EXTRA_AGENT_ROWS = parseToolRows(EXTRA_AGENT_TOOLS_TSV)
const ALL_TOOL_ROWS = [...BUILTIN_TOOL_ROWS, ...EXTRA_AGENT_ROWS]

const BUILTIN_TOOL_COUNT = BUILTIN_TOOL_ROWS.length
const ENABLED_BUILTIN_COUNT = BUILTIN_TOOL_ROWS.filter(row => row.enabled).length
const EXTRA_AGENT_COUNT = EXTRA_AGENT_ROWS.length
const REGISTERED_TOOL_COUNT = ALL_TOOL_ROWS.length

const extraAgentNames = new Set(EXTRA_AGENT_ROWS.map(row => row.name))

function toolFamilyFor(row: ToolRow) {
  if (row.category === 'filesystem' || row.category === 'process') return 'files-process'
  if (row.category === 'browser' || row.category === 'web') return 'web-browser'
  if (row.category === 'notebook' || row.category === 'code' || row.category === 'code_intelligence') return 'code-notebooks'
  if (row.category === 'interaction' || row.category === 'planning' || row.category === 'mode' || row.category === 'task' || row.category === 'goal' || row.category === 'permissions' || row.category === 'meta') return 'planning-control'
  if (row.category === 'memory' || row.category === 'rag') return 'memory-rag'
  if (row.category === 'mcp' || row.category === 'worktree' || row.name === 'skill' || row.name.startsWith('seshat_')) return 'extensions'
  if (row.category === 'agents' || row.category === 'agent') return 'agents'
  if (row.category === 'audio' || row.category === 'creative') return 'media'
  if (row.category === 'math') return 'math'
  if (row.category === 'vcs' || row.category === 'social' || row.category === 'notifications') return 'integrations'
  return 'misc'
}

const TOOL_FAMILIES: ToolFamily[] = [
  {
    title: 'Filesystem & Process Surface',
    body: 'This is the local execution layer: file reads and writes, patching, shell execution, background jobs, directory traversal, and long-running process monitoring.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'files-process').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'Web & Browser Surface',
    body: 'Seshat separates URL fetching from full browser control. Web fetch/search cover discovery and extraction, while browser_* tools expose a stateful browser session with page, network, and interaction primitives.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'web-browser').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'Code, Notebooks & IDE Hooks',
    body: 'These tools cover code completion, LSP-assisted inspection, and full notebook lifecycle operations from creation to execution and kernel control.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'code-notebooks').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'Planning, Tasks & Runtime Control',
    body: 'These tools control how the agent works: ask-user pauses, plan mode transitions, task objects, goal tracking, permission requests, and the meta discovery surface.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'planning-control').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'Memory & Retrieval',
    body: 'Long-term memory and retrieval are explicit tools, not hidden side effects. The runtime can write to knowledge-graph memory or query indexed corpora through the RAG surface.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'memory-rag').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'Skills, MCP & Worktree Extensions',
    body: 'This family covers runtime extensibility: generic MCP access, installed Seshat skills, the skill execution tool, and isolated worktree helpers.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'extensions').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'Agents & Delegation',
    body: 'Agent control is split between builtin coordination tools and engine-wired delegation tools that are only registered once the live engine instance exists.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'agents').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'Media & Multimodal Capabilities',
    body: 'These tools are capability-provider driven. They are usually disabled until the matching image or audio backend is configured.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'media').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'Math & Analysis Helpers',
    body: 'Fast deterministic helpers for calculation, units, statistics, and financial analysis. These tools stay cheap, local, and read-only.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'math').sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    title: 'VCS, Social & Notification Integrations',
    body: 'This family mixes community data tools, outbound messaging tools, and VCS helpers. Several entries are present in the surface design but remain disabled until implementation or credentials are ready.',
    rows: ALL_TOOL_ROWS.filter(row => toolFamilyFor(row) === 'integrations').sort((a, b) => a.name.localeCompare(b.name)),
  },
]

function toolNote(row: ToolRow) {
  if (extraAgentNames.has(row.name)) {
    return 'Registered later in sdk.NewClient because it needs the live engine instance.'
  }
  if (row.name === 'mcp') {
    return 'Gateway tool for configured MCP servers. Separate MCP-loaded tools can also appear as runtime-discovered surface entries.'
  }
  if (row.name === 'skill') {
    return 'Executes a resolved skill directly inside the main conversation loop.'
  }
  if (row.name.startsWith('seshat_')) {
    return 'Skill package introspection helpers used to list, read, or validate installed Seshat skills.'
  }
  if (row.name === 'tool_search') {
    return 'Special discovery helper. It is marked AlwaysLoad in the registry even though runtime enablement is optimistic.'
  }
  if (row.name === 'code_complete') {
    return 'Fill-in-the-middle style code completion surface; disabled until a completer backend is configured.'
  }
  if (row.name === 'generate_image') {
    return 'Enabled only when an image-generation provider is configured.'
  }
  if (row.name === 'text_to_speech' || row.name === 'speech_to_text') {
    return 'Enabled only when the corresponding audio provider is configured.'
  }
  if (row.name.startsWith('git_') && !row.enabled) {
    return 'Present in the runtime inventory, but currently disabled in the builtin surface.'
  }
  if ((row.category === 'notifications' || row.name.endsWith('_send')) && !row.enabled) {
    return 'Compiled into the surface design, but disabled until credentials and/or implementation are ready.'
  }
  if (row.name === 'web_search') {
    return 'Uses the configured web-search provider and goes through the permission pipeline.'
  }
  if (row.name === 'web_fetch') {
    return 'Targeted extraction once the runtime already knows the page to inspect.'
  }
  if (row.name.startsWith('memory_')) {
    return 'Backed by the LongTermMemory service rather than by raw prompt stuffing.'
  }
  if (row.name.startsWith('rag_')) {
    return 'Backed by the configured RAG service and corpus index.'
  }
  if (row.name === 'bash') {
    return 'Shell execution surface with permission gating and mono-run focus.'
  }
  if (row.name === 'monitor') {
    return 'Session-level process monitoring for background execution.'
  }
  if (row.name === 'agent') {
    return 'High-level sub-agent delegation surface with agent-type selection and bounded tasks.'
  }
  return ''
}

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'wrench':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a4 4 0 0 0-5.5 5.5L4 17l3 3 5.2-5.2a4 4 0 0 0 5.5-5.5l-2.2 2.2-3.1-3.2 2.3-2z" />
        </svg>
      )
    case 'stack':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
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
    case 'search':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      )
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v5c0 4.7-2.8 7.9-7 10-4.2-2.1-7-5.3-7-10V6l7-3z" />
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
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
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
  }
}

function toneClassName(tone: Tone) {
  switch (tone) {
    case 'capability':
      return styles.toneCapability
    case 'runtime':
      return styles.toneRuntime
    default:
      return styles.toneTool
  }
}

function IconBadge({ icon, tone }: { icon: IconName; tone: Tone }) {
  return (
    <span className={`${styles.iconBadge} ${toneClassName(tone)}`}>
      <IconGlyph name={icon} />
    </span>
  )
}

function LayerCard({
  tone,
  icon,
  eyebrow,
  title,
  body,
  meta,
}: {
  tone: Tone
  icon: IconName
  eyebrow: string
  title: string
  body: string
  meta: string
}) {
  return (
    <div className={styles.layerCard}>
      <div className={styles.layerTop}>
        <IconBadge icon={icon} tone={tone} />
        <span className={styles.eyebrow}>{eyebrow}</span>
      </div>
      <strong className={styles.cardTitle}>{title}</strong>
      <p className={styles.cardBody}>{body}</p>
      <span className={styles.metaChip}>{meta}</span>
    </div>
  )
}

function ToolsSurfaceDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.layerGrid}>
        <LayerCard
          tone="tool"
          icon="wrench"
          eyebrow="Runtime Inventory"
          title="Built-in Registry"
          body="Filesystem, shell, browser, planning, memory, notebook, agent, and multimedia tools are registered locally in one canonical inventory."
          meta="Primary tool catalog"
        />
        <LayerCard
          tone="capability"
          icon="plug"
          eyebrow="Extensions"
          title="MCP + Deferred Tools"
          body="External tools can be injected through MCP and lower-priority tools can stay deferred until the runtime explicitly discovers them."
          meta="Expandable action layer"
        />
        <LayerCard
          tone="runtime"
          icon="shield"
          eyebrow="Governance"
          title="Permission Gate"
          body="Permission mode, read-only metadata, destructive checks, shell hooks, and surface profiles decide what the session may actually execute."
          meta="Host-controlled execution"
        />
        <LayerCard
          tone="runtime"
          icon="flow"
          eyebrow="Session API"
          title="Visible Tool Surface"
          body="The host can inspect the surface, unregister tools for one session, and let the model work only with the final filtered set."
          meta="Per-session shaping"
        />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.layerTop}>
          <IconBadge icon="stack" tone="runtime" />
          <span className={styles.eyebrow}>Go Host Contract</span>
        </div>
        <strong className={styles.cardTitle}>Create once, inspect once, shape per session</strong>
        <p className={styles.cardBody}>
          The clean host pattern is straightforward: create the client, inspect the inventory, define workflow-specific session policies, attach governance, and then let the runtime execute one governed loop.
        </p>
      </div>

      <div className={styles.branchRow}>
        <div className={styles.branchCard}>
          <div className={styles.layerTop}>
            <IconBadge icon="search" tone="tool" />
            <span className={styles.eyebrow}>Discovery Path</span>
          </div>
          <strong className={styles.cardTitle}>Deferred tools keep prompts smaller</strong>
          <p className={styles.cardBody}>Deferred tools stay out of the initial surface and are discovered only when the runtime needs them.</p>
        </div>
        <div className={styles.branchCard}>
          <div className={styles.layerTop}>
            <IconBadge icon="spark" tone="capability" />
            <span className={styles.eyebrow}>Hot Reload</span>
          </div>
          <strong className={styles.cardTitle}>MCP servers can be reloaded</strong>
          <p className={styles.cardBody}>The host can refresh external MCP integrations without rebuilding the whole client surface from scratch.</p>
        </div>
      </div>
    </div>
  )
}

function HostFlowDiagram() {
  return (
    <div className={styles.flowBoard}>
      <div className={styles.flowRow}>
        <div className={styles.flowCard}>
          <IconBadge icon="stack" tone="runtime" />
          <strong className={styles.cardTitle}>1. Create the client</strong>
          <p className={styles.cardBody}>Pick the model, permission mode, and optional MCP servers for the host app.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="server" tone="runtime" />
          <strong className={styles.cardTitle}>2. Inspect the inventory</strong>
          <p className={styles.cardBody}>Use ToolNames() and BuildToolSurface() to see what the runtime is about to expose.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="shield" tone="runtime" />
          <strong className={styles.cardTitle}>3. Trim the session</strong>
          <p className={styles.cardBody}>Remove risky tools or change permission mode for one workflow before sending the turn.</p>
        </div>
      </div>

      <div className={styles.flowRow}>
        <div className={styles.flowCard}>
          <IconBadge icon="flow" tone="runtime" />
          <strong className={styles.cardTitle}>4. Stream and observe</strong>
          <p className={styles.cardBody}>Use runtime events and chunk callbacks to keep your UI or backend worker observable.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="plug" tone="capability" />
          <strong className={styles.cardTitle}>5. Extend with MCP</strong>
          <p className={styles.cardBody}>Bring in external tools and refresh them later without tearing down the whole process.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="wrench" tone="tool" />
          <strong className={styles.cardTitle}>6. Execute one governed loop</strong>
          <p className={styles.cardBody}>The runtime still owns prompt, tool calls, permissions, memory, and session persistence coherently.</p>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ children, tone }: { children: string; tone: 'enabled' | 'disabled' | 'readonly' | 'mutable' | 'permission' | 'free' }) {
  const className = {
    enabled: styles.pillEnabled,
    disabled: styles.pillDisabled,
    readonly: styles.pillReadOnly,
    mutable: styles.pillMutable,
    permission: styles.pillPermission,
    free: styles.pillFree,
  }[tone]

  return <span className={`${styles.pill} ${className}`}>{children}</span>
}

function ToolStateTable() {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.inventoryTable}>
        <thead>
          <tr>
            <th>Runtime flag</th>
            <th>Meaning</th>
            <th>Comes from</th>
            <th>Effect on the surface</th>
          </tr>
        </thead>
        <tbody>
          {TOOL_STATE_ROWS.map(row => (
            <tr key={row.flag}>
              <td className={styles.codeCell}>{row.flag}</td>
              <td>{row.meaning}</td>
              <td className={styles.codeCell}>{row.whereItComesFrom}</td>
              <td className={styles.noteCell}>{row.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ToolFamilyTable({ family }: { family: ToolFamily }) {
  return (
    <div className={styles.familySection}>
      <div className={styles.familyHeader}>
        <h3 className={articleStyles.h3}>{family.title}</h3>
        <p className={articleStyles.p}>{family.body}</p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.inventoryTable}>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Category</th>
              <th>State</th>
              <th>Read-only</th>
              <th>Permission</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {family.rows.map(row => {
              const note = toolNote(row)
              return (
                <tr key={row.name}>
                  <td className={styles.codeCell}>{row.name}</td>
                  <td>{row.category || 'runtime-specific'}</td>
                  <td>
                    <StatusPill tone={row.enabled ? 'enabled' : 'disabled'}>
                      {row.enabled ? 'enabled' : 'disabled'}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={row.readOnly ? 'readonly' : 'mutable'}>
                      {row.readOnly ? 'yes' : 'no'}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={row.requiresPermission ? 'permission' : 'free'}>
                      {row.requiresPermission ? 'required' : 'not required'}
                    </StatusPill>
                  </td>
                  <td className={styles.noteCell}>{note || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ToolsProviders() {
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
        <span className={articleStyles.breadCurrent}>Tools &amp; Surface</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Tools &amp; Surface</h1>
        <p className={articleStyles.sub}>
          This page is the practical Go SDK tutorial for the runtime-owned action layer. It shows how to inspect the built-in tool inventory, shape a workflow-specific session surface, attach governance, add MCP tools, and understand what is and is not a clean public customization path today.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>What This Page Covers</h2>
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Boundary</div>
          <p className={articleStyles.calloutText}>
            This page is about the action layer: built-in tools, session shaping, permission-sensitive execution, and MCP extensions. Provider setup, OAuth, capability-provider auth, and Codex login flows belong in Providers &amp; Auth.
          </p>
        </div>
        <p className={articleStyles.p}>
          If you need provider setup, continue with{' '}
          <Link className={articleStyles.link} to="/docs/sdk/providers" state={{ from: location.pathname }}>
            Providers &amp; Auth
          </Link>
          . If you want the architectural why behind the separation, continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/tools" state={{ from: location.pathname }}>
            Tools &amp; Providers
          </Link>
          .
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Integration Patterns</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Read-only analysis worker</div>
            <p className={articleStyles.cardBody}>Keep the built-in inventory, then remove file mutation and shell tools for audit, review, or architecture analysis workflows.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Coding worker</div>
            <p className={articleStyles.cardBody}>Keep edit and shell tools enabled, but add permission mode and pre-tool governance so mutating actions still flow through host policy.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>External-tool worker</div>
            <p className={articleStyles.cardBody}>Attach MCP servers to pull GitHub, issue tracker, CRM, or domain-specific tools into the same runtime loop.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Task-shaped session</div>
            <p className={articleStyles.cardBody}>Use one shared client and create multiple session profiles by changing permission mode and unregistering tools per workflow.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>The Host Workflow</h2>
        <p className={articleStyles.p}>
          For Go hosts, the clean path is simple: create one client, inspect what exists, apply workflow-specific trimming per session, then extend or govern the surface where needed. You do not need to fight the runtime to keep the host in control.
        </p>
        <ToolsSurfaceDiagram />
        <HostFlowDiagram />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Step 1: Inspect The Inventory</h2>
        <p className={articleStyles.p}>
          Start by checking what the runtime already exposes. <span className={articleStyles.inlineCode}>client.ToolNames()</span> returns the registered primary names. <span className={articleStyles.inlineCode}>client.BuildToolSurface(ctx)</span> shows the filtered external surface the runtime would expose after registry-level rules are applied.
        </p>
        <DocCodeBlock code={TOOL_INVENTORY} label="Inspecting tools" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Step 2: Create A Workflow-Specific Session</h2>
        <p className={articleStyles.p}>
          Do not destroy the shared client inventory just because one workflow is stricter than another. The practical pattern is to create the session, set the right permission mode, unregister the tools that do not belong in that workflow, and only then submit the task.
        </p>
        <DocCodeBlock code={TASK_SPECIFIC_SESSION} label="Read-only review session" language="go" />
        <DocCodeBlock code={HOST_PATTERN} label="Reusable host-side session profile" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Step 3: Add Governance For Mutating Tools</h2>
        <p className={articleStyles.p}>
          Shaping the visible surface is only one half of host control. Execution still goes through permission mode and optional pre-tool hooks. That is the clean SDK-level place to block, rewrite, or strictly review high-risk calls like shell execution and file mutation.
        </p>
        <DocCodeBlock code={PRE_TOOL_HOOKS} label="Pre-tool governance" language="go" />
        <ul className={articleStyles.list}>
          <li><span className={articleStyles.inlineCode}>PermissionMode</span> decides the runtime approval posture for the session.</li>
          <li><span className={articleStyles.inlineCode}>PreToolHooks</span> let the host allow, deny, halt, or rewrite tool calls before they execute.</li>
          <li><span className={articleStyles.inlineCode}>session.SetPermissionMode(...)</span> lets one session become stricter or looser than the client default.</li>
        </ul>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Step 4: Extend The Surface With MCP</h2>
        <p className={articleStyles.p}>
          When built-ins are not enough, MCP is the clean extension path. You can register servers when the client starts, and later refresh them with <span className={articleStyles.inlineCode}>client.ReloadMCPServers(ctx, ...)</span> if the external tool surface changes.
        </p>
        <DocCodeBlock code={MCP_WIRING} label="MCP integration" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Custom Tool Boundary Today</h2>
        <p className={articleStyles.p}>
          The public SDK already exposes <span className={articleStyles.inlineCode}>client.RegisterTool(...)</span>, <span className={articleStyles.inlineCode}>client.RegisterTools(...)</span>, and <span className={articleStyles.inlineCode}>session.RegisterTool(...)</span>. But there is an important boundary to understand before you build on that.
        </p>
        <DocCodeBlock code={TOOL_BOUNDARY} label="Current public boundary" language="go" />
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Pragmatic Guidance</div>
          <p className={articleStyles.calloutText}>
            If you are integrating Seshat into a product today, start with built-in tools, session shaping, permission governance, and MCP. Custom tools are possible, but the implementation contract still mirrors the runtime tool interface more closely than a dedicated SDK-first builder API.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Inventory Snapshot</h2>
        <p className={articleStyles.p}>
          These counts come from the current runtime registry: builtin tools first, then the extra agent tools that are only registered once the live engine instance exists.
        </p>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>{REGISTERED_TOOL_COUNT}</span>
            <span className={styles.summaryLabel}>Known tool entries</span>
            <p className={styles.summaryText}>Builtin registry entries plus engine-wired agent tools.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>{BUILTIN_TOOL_COUNT}</span>
            <span className={styles.summaryLabel}>Builtin registry tools</span>
            <p className={styles.summaryText}>The initial runtime inventory before later engine-specific additions.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>{ENABLED_BUILTIN_COUNT}</span>
            <span className={styles.summaryLabel}>Builtin tools enabled</span>
            <p className={styles.summaryText}>Disabled entries are usually waiting for credentials, capability config, or fuller implementation.</p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>{EXTRA_AGENT_COUNT}</span>
            <span className={styles.summaryLabel}>Engine-wired agent tools</span>
            <p className={styles.summaryText}>Registered later because they depend on the live engine instance, not only on the builtin registry.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Tool State Semantics</h2>
        <p className={articleStyles.p}>
          The raw inventory only becomes useful once you understand how the runtime filters it. SurfaceBuilder asks the registry for a candidate surface, then applies permission checks, category filters, read-only or destructive filters, deferred-loading rules, and surface-profile visibility.
        </p>
        <ToolStateTable />
        <p className={articleStyles.p}>
          One important detail is deferred loading. When tool search mode is active, deferred tools stay out of the initial model-visible surface and must be discovered through <span className={articleStyles.inlineCode}>tool_search</span>. If a tool is marked <span className={articleStyles.inlineCode}>AlwaysLoad</span>, that rule wins and the tool stays visible.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Tool Families And Exact Runtime Flags</h2>
        <p className={articleStyles.p}>
          The tables below reflect the current runtime metadata for each tool: whether it is enabled, whether it is read-only, and whether it enters the permission pipeline. This is the useful developer view because it follows the actual registry state, not a simplified marketing list.
        </p>
        {TOOL_FAMILIES.map(family => (
          <ToolFamilyTable key={family.title} family={family} />
        ))}
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          Continue with{' '}
          <Link className={articleStyles.link} to="/docs/sdk/providers" state={{ from: location.pathname }}>
            Providers &amp; Auth
          </Link>
          {' '}for provider setup, OAuth, and Codex. For the extensibility side, continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/skills-mcp" state={{ from: location.pathname }}>
            Skills and MCP
          </Link>
          .
        </p>
      </section>
    </article>
  )
}
