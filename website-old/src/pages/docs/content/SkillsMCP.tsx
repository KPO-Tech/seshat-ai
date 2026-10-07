import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import articleStyles from './DocArticle.module.css'
import styles from './SkillsMCP.module.css'

type Tone = 'skill' | 'mcp' | 'runtime'
type IconName =
  | 'spark'
  | 'book'
  | 'folder'
  | 'brain'
  | 'network'
  | 'plug'
  | 'server'
  | 'tools'
  | 'cpu'
  | 'search'
  | 'layers'

const SKILL_EXAMPLE = `---
name: "summarise-pr"
description: "Summarise a pull request for the team."
when_to_use: "When the user asks for a PR summary or reviewer briefing."
allowed-tools:
  - bash
  - read
triggers:
  - summarise this pull request
  - review this pr
preamble-tier: standard
requires:
  - type: node
    check: "node --version"
    install-cmd: "cd \${SESHAT_SKILL_DIR}/scripts && npm install"
---

Read the diff, inspect changed files, and write a concise reviewer briefing.`

const MCP_JSON = `{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "\${GITHUB_TOKEN}"
      }
    },
    "docs": {
      "type": "sse",
      "url": "https://example.com/mcp"
    }
  }
}`

const SDK_MCP = `client, err := sdk.NewClient(&sdk.ClientConfig{
    MCPServers: []sdk.MCPServerConfig{
        {
            Name:      "github",
            Transport: sdk.MCPTransportStdio,
            Command:   "npx",
            Args:      []string{"-y", "@modelcontextprotocol/server-github"},
        },
    },
})`

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </svg>
      )
    case 'book':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5z" />
          <path d="M8 7h8M8 11h8" />
        </svg>
      )
    case 'folder':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h6l2 2h10v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5V7z" />
        </svg>
      )
    case 'brain':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 4a3 3 0 0 0-3 3v1a2.5 2.5 0 0 0-2 2.4A2.6 2.6 0 0 0 5.7 13 3.5 3.5 0 0 0 9 18h1V4H9z" />
          <path d="M15 4a3 3 0 0 1 3 3v1a2.5 2.5 0 0 1 2 2.4A2.6 2.6 0 0 1 18.3 13 3.5 3.5 0 0 1 15 18h-1V4h1z" />
          <path d="M10 9H8M16 9h-2M10 13H7.5M16.5 13H14" />
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
    case 'plug':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 7V3M15 7V3" />
          <path d="M8 7h8v3a4 4 0 0 1-8 0V7z" />
          <path d="M12 14v7" />
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
    case 'tools':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 7l3-3 3 3-3 3" />
          <path d="M4 20l9-9" />
          <path d="M12 4l8 8" />
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
    case 'search':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
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
    case 'mcp':
      return styles.toneMcp
    case 'runtime':
      return styles.toneRuntime
    default:
      return styles.toneSkill
  }
}

function IconBadge({ icon, tone }: { icon: IconName; tone: Tone }) {
  return (
    <span className={`${styles.iconBadge} ${toneClassName(tone)}`}>
      <IconGlyph name={icon} />
    </span>
  )
}

function ExtensionMapDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.sideGrid}>
        <div className={styles.sideCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="book" tone="skill" />
            <span className={styles.eyebrow}>Behavior Layer</span>
          </div>
          <strong className={styles.cardTitle}>Skills</strong>
          <p className={styles.cardBody}>Reusable prompt-time task definitions. They shape what the agent should do, when to do it, what context to inject, and which dependencies or hooks to consider.</p>
        </div>

        <div className={styles.sideCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="plug" tone="mcp" />
            <span className={styles.eyebrow}>Capability Layer</span>
          </div>
          <strong className={styles.cardTitle}>MCP</strong>
          <p className={styles.cardBody}>Protocol-level integration with external servers. MCP extends what the runtime can actually call by importing remote tools, resources, and prompts.</p>
        </div>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <IconBadge icon="cpu" tone="runtime" />
          <span className={styles.eyebrow}>One Runtime</span>
        </div>
        <strong className={styles.cardTitle}>Session + Prompt + Tool Registry</strong>
        <p className={styles.cardBody}>Skills plug into prompt-time behavior and invocation flow. MCP plugs into the tool registry and external execution surface. Both end up inside the same session contract.</p>
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.bottomCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="spark" tone="skill" />
            <span className={styles.eyebrow}>What Changes</span>
          </div>
          <strong className={styles.cardTitle}>Skills change agent behavior</strong>
          <p className={styles.cardBody}>Frontmatter, triggers, hooks, and prompt bodies tell the runtime how to frame and route work.</p>
        </div>
        <div className={styles.bottomCard}>
          <div className={styles.cardTop}>
            <IconBadge icon="tools" tone="mcp" />
            <span className={styles.eyebrow}>What Expands</span>
          </div>
          <strong className={styles.cardTitle}>MCP expands agent reach</strong>
          <p className={styles.cardBody}>New external tools and resources become callable without rewriting the core runtime.</p>
        </div>
      </div>
    </div>
  )
}

function SkillResolutionDiagram() {
  const layers = [
    ['Project', '{project}/.claude/skills', 'Highest priority for repo-specific behavior.'],
    ['Managed', '<runtime-root>/skills/managed', 'Admin or policy-owned skills.'],
    ['User', '<runtime-root>/skills/users/<user-id>', 'Personal skills for one user.'],
    ['Builtin / Legacy', '<runtime-root>/skills/builtin and .seshat/commands', 'Compatibility and built-in local sources.'],
    ['Skill Repos', '<runtime-root>/skills/repos', 'Cloned collections where each SKILL.md becomes a namespaced skill.'],
    ['Bundled', 'bundled registry', 'Lowest priority fallback.'],
  ]

  return (
    <div className={styles.stackBoard}>
      {layers.map(([title, path, body], index) => (
        <div key={title} className={styles.stackRow}>
          <div className={styles.stackIndex}>{index + 1}</div>
          <div className={styles.stackCard}>
            <strong className={styles.cardTitle}>{title}</strong>
            <span className={styles.pathChip}>{path}</span>
            <p className={styles.cardBody}>{body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function MCPFlowDiagram() {
  return (
    <div className={styles.flowBoard}>
      <div className={`${styles.flowRow} ${styles.flowRowWide}`}>
        <div className={styles.flowCard}>
          <IconBadge icon="folder" tone="mcp" />
          <strong className={styles.cardTitle}>1. Load config</strong>
          <p className={styles.cardBody}>The runtime reads `mcp.json` and `.mcp.json`, expands env vars, validates server definitions, and applies scope rules.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="network" tone="mcp" />
          <strong className={styles.cardTitle}>2. Connect transport</strong>
          <p className={styles.cardBody}>A client starts via stdio, HTTP, SSE, or WebSocket depending on the server config.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="server" tone="mcp" />
          <strong className={styles.cardTitle}>3. Initialize + discover</strong>
          <p className={styles.cardBody}>The initialize handshake completes, then Seshat lists the server's tools, resources, and prompts.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="layers" tone="runtime" />
          <strong className={styles.cardTitle}>4. Wrap into registry</strong>
          <p className={styles.cardBody}>External capabilities are wrapped as native runtime tools, plus generic `mcp_list_resources` and `mcp_read_resource` helpers.</p>
        </div>
        <div className={styles.flowConnector}><span /></div>
        <div className={styles.flowCard}>
          <IconBadge icon="search" tone="runtime" />
          <strong className={styles.cardTitle}>5. Discover and call</strong>
          <p className={styles.cardBody}>The session sees a flat tool surface. Deferred discovery through `tool_search` can still surface MCP tools when needed.</p>
        </div>
      </div>
    </div>
  )
}

export default function SkillsMCP() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link to={base} className={articleStyles.breadLink}>Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link to={`${base}/concepts`} className={articleStyles.breadLink}>Concepts</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Skills and MCP</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Skills and MCP</h1>
        <p className={articleStyles.sub}>
          Skills and MCP are two different extension systems in Seshat. Skills are reusable instruction packages that shape agent behavior inside the runtime. MCP is the protocol bridge that imports external tools, resources, and prompts into the runtime. They often work together, but they do not solve the same problem.
        </p>
      </header>

      <section className={articleStyles.section}>
        <div className={articleStyles.callout}>
          <span className={articleStyles.calloutTitle}>Short version</span>
          <p className={articleStyles.calloutText}>
            If you want the agent to behave differently, reach for a skill. If you want the agent to reach new systems or capabilities, reach for MCP. Skills are prompt-time behavior modules. MCP is runtime-time capability import.
          </p>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Two extension planes, one runtime</h2>
        <ExtensionMapDiagram />
        <p className={articleStyles.p}>
          This distinction keeps the architecture clean. You do not need to fork the runtime to teach it a reusable workflow, and you do not need to rewrite the prompt system to connect a database, GitHub, or any other MCP-compatible surface. The runtime owns both extension planes, but it owns them differently.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>1. Skills are reusable behavior modules</h2>
        <p className={articleStyles.p}>
          A skill is a Markdown file with YAML frontmatter. The frontmatter defines how the skill should be treated by the runtime, and the Markdown body becomes the injected instruction payload. In practice, a skill is a reusable task recipe that can carry triggers, allowed tools, execution context, dependency checks, shell hooks, and prompt scaffolding.
        </p>
        <DocCodeBlock code={SKILL_EXAMPLE} label="Skill File" language="text" />
        <ul className={articleStyles.list}>
          <li><span className={articleStyles.inlineCode}>triggers</span> enable natural-language auto-activation without a slash command.</li>
          <li><span className={articleStyles.inlineCode}>preamble-tier</span> controls how much runtime context is injected ahead of the prompt body.</li>
          <li><span className={articleStyles.inlineCode}>requires</span> generates a pre-flight dependency check section so the agent asks before installing anything missing.</li>
          <li><span className={articleStyles.inlineCode}>context</span> lets the skill stay inline or fork into an isolated execution context.</li>
        </ul>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>2. Skill loading is layered and deterministic</h2>
        <SkillResolutionDiagram />
        <p className={articleStyles.p}>
          The loader walks multiple sources and then deduplicates by skill name, so the first matching skill wins. That gives Seshat a stable override model: repo-owned behavior can beat user defaults, while bundled fallback skills stay at the bottom. It also means the same runtime can support personal skills, team skills, admin-managed skills, and cloned skill collections without inventing a second plugin system.
        </p>
        <p className={articleStyles.p}>
          Another important detail is that cloned skill repositories are treated as collections. Each directory containing a <span className={articleStyles.inlineCode}>SKILL.md</span> becomes one namespaced skill, and <span className={articleStyles.inlineCode}>{'${SESHAT_SKILL_DIR}'}</span> resolves to the collection root so the prompt can refer to repo-relative data or scripts.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>3. The skill tool is itself a runtime surface</h2>
        <p className={articleStyles.p}>
          Seshat does not hardcode a fixed list of skill commands into the model prompt. The <span className={articleStyles.inlineCode}>skill</span> tool rebuilds its own definition dynamically from the currently visible skills, marks itself as deferred, and tells the model to invoke it whenever a matching slash command or task-specific skill exists.
        </p>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Deferred by design</span>
            <p className={articleStyles.cardBody}>The runtime can keep the core prompt stable while still letting `tool_search` or the system reminder surface skill capabilities only when needed.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Trigger-aware</span>
            <p className={articleStyles.cardBody}>The loader can match a user request against trigger phrases before the user ever types a slash command explicitly.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Path-aware</span>
            <p className={articleStyles.cardBody}>Skills can be filtered by active file context when path restrictions are present.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Composable</span>
            <p className={articleStyles.cardBody}>Hooks and shell lifecycle blocks make skills act more like reusable workflows than static text macros.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>4. MCP is how external capabilities become native runtime tools</h2>
        <p className={articleStyles.p}>
          The MCP side is much more transport- and protocol-oriented. The runtime reads config, connects to external servers, completes the MCP initialize handshake, discovers the remote surface, and then wraps it into Seshat's own tool registry.
        </p>
        <DocCodeBlock code={MCP_JSON} label="mcp.json" language="text" />
        <MCPFlowDiagram />
        <p className={articleStyles.p}>
          The wrapper does more than import tools. It also wraps resources and prompts, and it always adds generic resource helpers such as <span className={articleStyles.inlineCode}>mcp_list_resources</span> and <span className={articleStyles.inlineCode}>mcp_read_resource</span>. By default, exposed MCP tool names are prefixed like <span className={articleStyles.inlineCode}>mcp__github__search_issues</span>, although aliases are also generated for easier lookup.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>5. MCP configuration is layered too</h2>
        <p className={articleStyles.p}>
          MCP server definitions are loaded from runtime-root config as well as project-local config. In the current loader, enterprise config acts like an override path, while user and project-local definitions are merged when enterprise mode is not present. Environment variables inside config entries are expanded before connection.
        </p>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Global</span>
            <p className={articleStyles.cardBody}><span className={articleStyles.inlineCode}>{'<runtime-root>/mcp.json'}</span> is the default user-level config.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Project / local</span>
            <p className={articleStyles.cardBody}><span className={articleStyles.inlineCode}>.mcp.json</span> in the working tree can define repo-specific servers.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Transports</span>
            <p className={articleStyles.cardBody}>The client currently supports stdio, HTTP, SSE, and WebSocket-backed remote servers.</p>
          </div>
          <div className={articleStyles.card}>
            <span className={articleStyles.cardTitle}>Lifecycle</span>
            <p className={articleStyles.cardBody}>Clients are started, initialized, tracked, and can be hot-reloaded by the SDK without recreating the whole runtime.</p>
          </div>
        </div>
        <DocCodeBlock code={SDK_MCP} label="Go SDK" language="go" />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>6. Skills and MCP can reinforce each other</h2>
        <p className={articleStyles.p}>
          A strong pattern is to use a skill to define a repeatable workflow and an MCP server to provide the external systems that workflow needs. For example, a PR review skill can encode the review method while GitHub or Jira MCP servers provide the live project data.
        </p>
        <ul className={articleStyles.list}>
          <li>Skills encode reusable operating procedure.</li>
          <li>MCP servers expose external reality: repos, tickets, databases, browsers, internal tools.</li>
          <li>The prompt already instructs the runtime to prefer MCP tools over built-ins when both cover the same operation and the MCP tool is the better fit.</li>
        </ul>
        <p className={articleStyles.p}>
          There is even an MCP-to-skill bridge in the codebase that can expose connected MCP tools as skill-like invocations, but the main architectural path is still direct tool wrapping into the runtime registry.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Why this matters for the larger vision</h2>
        <p className={articleStyles.p}>
          This is one of the places where Seshat starts to look less like a single assistant and more like an extensible agent runtime. Skills let communities and teams package operating knowledge. MCP lets domain systems plug in without waiting for the core runtime to reimplement them one by one. Together, they create the extension surface that a broader agent platform actually needs.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Next step</h2>
        <p className={articleStyles.p}>
          Once the extension surface is clear, the next practical layer is how people actually use it day to day in the CLI app: sessions, settings, MCP management, and runtime workflows.
        </p>
        <div className={articleStyles.actionRow}>
          <Link to={`${base}/concepts/memory-rag`} className={articleStyles.secondaryLink}>Memory and RAG</Link>
          <Link to={`${base}/contribution`} className={articleStyles.secondaryLink}>Contribution</Link>
          <Link to={`${base}/guides/cli`} className={articleStyles.primaryLink}>CLI guide</Link>
        </div>
      </section>
    </div>
  )
}
