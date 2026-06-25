import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import styles from './DocArticle.module.css'

const CORE_COMMANDS = `seshat chat
seshat run "Summarise this repo and suggest the next useful change"
seshat config --print
seshat sessions list
seshat setup --check`

const SESSION_COMMANDS = `seshat chat --continue
seshat chat --resume <session-id>
seshat sessions list
seshat sessions info <session-id>
seshat sessions prune --older-than 30`

const PATHS = `~/.config/seshat-cli/
~/.config/seshat-cli/seshat.json
<project>/.seshat/
<project>/.seshat/seshat.json`

const MCP_EXAMPLE = `{
  "mcp": {
    "docs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  },
  "options": {
    "skills_paths": ["~/.config/seshat-cli/skills", "./skills"],
    "disabled_skills": ["legacy-skill"]
  }
}`

export default function CLIUsage() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        <span className={styles.breadSep}>/</span>
        <Link to={`${base}/guides`} className={styles.breadLink}>Guides</Link>
        <span className={styles.breadSep}>/</span>
        <span className={styles.breadCurrent}>CLI Usage</span>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>CLI Usage</h1>
        <p className={styles.sub}>
          Seshat CLI app is the fastest way to use the agent runtime today. It is built for developers, vibecoders,
          open-source contributors, and technical users who want an AI coding agent in the terminal, whether they are
          pushing Seshat forward, working inside their own repository, or running local models and cheaper LLM providers
          without losing the serious tooling surface.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.callout}>
          <span className={styles.calloutTitle}>Why this CLI exists</span>
          <p className={styles.calloutText}>
            The CLI is both a real product and a proving ground. It lets us validate agent workflows, tool UX,
            provider setup, MCP integration, skills, permissions, and session design before features become part of the
            official desktop experience. It is the shortest feedback loop between the runtime engine and real users.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Who the CLI is for</h2>
        <p className={styles.p}>
          This CLI app is not a toy shell wrapper around a prompt. It is a terminal-first agent workspace for people who want a coding assistant,
          an autonomous coding tool, a repo-aware AI terminal, or a practical way to work with LLMs through a TUI instead of a browser chat.
          If you care about speed, scripting, keyboard flow, local inference, lower model cost, or testing agentic features before they land
          elsewhere, this is the right surface.
        </p>
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Developers</span>
            <p className={styles.cardBody}>Use Seshat in real codebases, inspect files, run commands, switch models, and pressure-test the runtime against production-like work.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Vibecoders</span>
            <p className={styles.cardBody}>Stay in flow with a terminal agent that can reason over a repo, apply structure, and work with cheaper providers instead of premium-only defaults.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Open-source contributors</span>
            <p className={styles.cardBody}>Use the same CLI surface we use internally to discover rough edges, test features early, and help shape what becomes stable in the engine and desktop app.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Local-first users</span>
            <p className={styles.cardBody}>Run Ollama or other compatible providers, plug in lower-cost APIs, and keep a strong tool surface even when optimizing for price or privacy.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.callout}>
          <span className={styles.calloutTitle}>One runtime, two working modes</span>
          <p className={styles.calloutText}>
            Use <span className={styles.inlineCode}>seshat chat</span> when you want the full TUI and a long-running agent session.
            Use <span className={styles.inlineCode}>seshat run</span> when you want one prompt, one answer, and no interactive shell.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>The commands that matter first</h2>
        <p className={styles.p}>
          You do not need the entire command surface on day one. These are the commands that define the real CLI workflow
          right now: starting a chat, running a one-shot task, checking config, managing sessions, and validating optional tooling.
        </p>
        <DocCodeBlock code={CORE_COMMANDS} label="CLI" />
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Chat</span>
            <p className={styles.cardBody}><span className={styles.inlineCode}>seshat chat</span> opens the interactive TUI and is the default entry point for most users.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Run</span>
            <p className={styles.cardBody}><span className={styles.inlineCode}>seshat run</span> is the fast path for scripting, tests, and quick repo-level prompts.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Config</span>
            <p className={styles.cardBody}><span className={styles.inlineCode}>seshat config</span> selects providers, models, credentials, and search-provider keys.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Sessions</span>
            <p className={styles.cardBody}><span className={styles.inlineCode}>seshat sessions</span> lists, resumes, deletes, and prunes saved conversations.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Start with the interactive TUI</h2>
        <p className={styles.p}>
          The CLI app opens directly into the terminal UI, where Seshat streams answers, runs tools, keeps session history,
          and exposes the settings hub without leaving the session. This is where the runtime is easiest to understand,
          because prompts, tool calls, attachments, approvals, thinking traces, and session state all stay visible.
        </p>
        <div className={styles.screenshotGrid}>
          <figure className={styles.screenshotCard}>
            <img src="/cli/home.png" alt="Seshat CLI home screen" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>The home screen is the clean starting point before the first active session.</figcaption>
          </figure>
          <figure className={styles.screenshotCard}>
            <img src="/cli/working1.png" alt="Seshat CLI running inside an active session" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>Once a session is live, the CLI becomes the operator console for prompts, tools, attachments, and approvals.</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Settings, providers, and models</h2>
        <p className={styles.p}>
          The TUI already exposes the most important configuration flows. <span className={styles.inlineCode}>ctrl+p</span> opens Settings,
          <span className={styles.inlineCode}>ctrl+,</span> jumps to providers, and <span className={styles.inlineCode}>ctrl+l</span>
          opens the model picker. That makes the CLI app usable for simple users, repo-first vibecoders, and developers without forcing
          everyone through raw JSON on the first day. It also makes it practical to move between premium APIs, OpenAI-compatible endpoints,
          self-hosted services, and local models as your constraints change.
        </p>
        <div className={styles.screenshotGrid}>
          <figure className={styles.screenshotCard}>
            <img src="/cli/settings_overview.png" alt="Seshat settings overview" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>Settings already centralize commands, providers, models, tools, MCP, and skills.</figcaption>
          </figure>
          <figure className={styles.screenshotCard}>
            <img src="/cli/model_selection.png" alt="Seshat model picker" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>Large-task and small-task models can be switched directly from the CLI.</figcaption>
          </figure>
          <figure className={styles.screenshotCard}>
            <img src="/cli/providers_overview.png" alt="Seshat provider categories" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>Providers are split by capability, including LLM, image, speech, and web search.</figcaption>
          </figure>
          <figure className={styles.screenshotCard}>
            <img src="/cli/provider_llm_zai_config.png" alt="Seshat LLM provider configuration" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>Provider setup can be driven from the TUI instead of forcing manual config edits up front.</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Day-one keybindings</h2>
        <p className={styles.p}>
          These shortcuts are the practical minimum worth memorizing. They cover navigation, settings, sessions, and the compose box features
          you will use constantly in a real project.
        </p>
        <ul className={styles.list}>
          <li><span><span className={styles.inlineCode}>ctrl+p</span> opens the Settings hub, including Tools, MCP, and Skills.</span></li>
          <li><span><span className={styles.inlineCode}>ctrl+,</span> jumps straight into provider management.</span></li>
          <li><span><span className={styles.inlineCode}>ctrl+l</span> opens the model picker. Some terminals also support <span className={styles.inlineCode}>ctrl+m</span>.</span></li>
          <li><span><span className={styles.inlineCode}>ctrl+s</span> opens the session switcher, where sessions can also be renamed or deleted.</span></li>
          <li><span><span className={styles.inlineCode}>ctrl+n</span> starts a new session without leaving the TUI.</span></li>
          <li><span><span className={styles.inlineCode}>ctrl+g</span> opens the extended help surface.</span></li>
          <li><span>Inside the composer, use <span className={styles.inlineCode}>@</span> to mention files, <span className={styles.inlineCode}>\</span> to open commands, <span className={styles.inlineCode}>ctrl+o</span> for the editor, and <span className={styles.inlineCode}>ctrl+f</span> to add an image or attachment.</span></li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Sessions are a first-class workflow</h2>
        <p className={styles.p}>
          Seshat does not treat a chat as disposable terminal output. Sessions are stored, can be resumed from the CLI,
          and have their own artifact directories for screenshots, downloads, plans, pasted content, and generated files.
          That matters for long-running agent work, iterative coding sessions, and open-source feedback loops.
        </p>
        <DocCodeBlock code={SESSION_COMMANDS} label="Session Commands" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Where config and runtime files live</h2>
        <p className={styles.p}>
          There are two layers to keep in mind. The CLI keeps global runtime state under its own runtime root, and each project keeps local state
          in a dedicated data directory. By default, the CLI runtime root is <span className={styles.inlineCode}>~/.config/seshat-cli</span>,
          and the project data directory is <span className={styles.inlineCode}>.seshat</span> at the repository root or current working directory.
        </p>
        <DocCodeBlock code={PATHS} label="Paths" />
        <ul className={styles.list}>
          <li><span><span className={styles.inlineCode}>SESHAT_RUNTIME_ROOT</span> overrides the global runtime root when you need a custom location.</span></li>
          <li><span>The global config file is <span className={styles.inlineCode}>seshat.json</span> under the runtime root.</span></li>
          <li><span>The workspace config file is <span className={styles.inlineCode}>.seshat/seshat.json</span> unless <span className={styles.inlineCode}>options.data_directory</span> points elsewhere.</span></li>
          <li><span>Session artifacts, logs, pasted files, plans, and tool downloads are stored under the runtime root on a per-session basis.</span></li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>MCP, web search, and skills</h2>
        <p className={styles.p}>
          The CLI is already opinionated here. Settings exposes an MCP view for server status and reconnect or disable actions,
          a Skills view for discovered skills, and provider sub-pages for web-search configuration. Under the hood, these map to the
          <span className={styles.inlineCode}>mcp</span>, <span className={styles.inlineCode}>options.skills_paths</span>, and
          <span className={styles.inlineCode}>options.disabled_skills</span> fields in config. This is where the runtime starts to feel like an
          extensible agent platform rather than a simple terminal chatbot.
        </p>
        <div className={styles.screenshotGrid}>
          <figure className={styles.screenshotCard}>
            <img src="/cli/web_search_provider_config.png" alt="Seshat web search provider configuration" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>Web search providers can be configured from the same provider system as the main LLM setup.</figcaption>
          </figure>
          <figure className={styles.screenshotCard}>
            <img src="/cli/commands_pannel.png" alt="Seshat commands panel" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>The command surface becomes more valuable once custom commands and MCP prompts are added.</figcaption>
          </figure>
        </div>
        <DocCodeBlock code={MCP_EXAMPLE} label="Config Shape" language="text" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>A surface that evolves with the runtime</h2>
        <p className={styles.p}>
          The CLI app is intentionally close to the engine. As the agent runtime grows, the CLI will keep exposing new tools,
          new workflows, better provider routing, richer MCP support, stronger skill discovery, and more stable automation paths.
          Its direction will not come only from internal roadmap decisions. It will also move with the open-source community,
          because this is the place where advanced users can test features early and make the product sharper before those capabilities
          are frozen into more official surfaces.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>What to read next</h2>
        <p className={styles.p}>
          This page gives the operating map of the CLI. Next, we can split it into focused guides for provider setup,
          local models, cheap model stacks, MCP servers, skills, and configuration files once the rest of the docs surface is ready.
        </p>
        <div className={styles.actionRow}>
          <Link to={`${base}/getting-started/configuration`} className={styles.secondaryLink}>Configuration</Link>
          <Link to={`${base}/getting-started/first-agent`} className={styles.primaryLink}>First Agent</Link>
        </div>
      </section>
    </div>
  )
}
