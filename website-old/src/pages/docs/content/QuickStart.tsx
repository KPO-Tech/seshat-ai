import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import styles from './DocArticle.module.css'

const CONFIG_CMD = 'seshat config --provider anthropic --api-key sk-ant-...\nseshat config --model anthropic:claude-sonnet-4-20250514'
const CHAT_CMD = 'seshat chat'
const RUN_CMD = 'seshat run "Summarise the current directory and suggest the next useful task"'

export default function QuickStart() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        <span className={styles.breadSep}>/</span>
        <Link to={`${base}/getting-started`} className={styles.breadLink}>Getting Started</Link>
        <span className={styles.breadSep}>/</span>
        <span className={styles.breadCurrent}>Quick Start</span>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>Quick Start</h1>
        <p className={styles.sub}>
          This is the fastest path to a real first success with Seshat. It works for terminal-first users,
          vibecoders working inside a repo, and developers who want to validate the runtime before going deeper.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.callout}>
          <span className={styles.calloutTitle}>What you will do in five minutes</span>
          <p className={styles.calloutText}>
            Configure a provider, open the interactive CLI, then run a one-shot prompt. Once those two commands work,
            you have a real baseline and can choose the path that fits your profile.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>1. Configure a provider</h2>
        <p className={styles.p}>
          Use any supported provider. Anthropic is a clean default example here, but the same flow works with OpenAI,
          OpenRouter, Mistral, Google, local Ollama, and others.
        </p>
        <DocCodeBlock code={CONFIG_CMD} label="Terminal" />
        <p className={styles.p}>
          If you want more options, continue with the full <Link to={`${base}/getting-started/configuration`} className={styles.link}>configuration page</Link>.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>2. Start the interactive CLI</h2>
        <p className={styles.p}>
          The main entry point is <span className={styles.inlineCode}>seshat chat</span>. This opens the TUI where you can talk to the agent,
          switch models, inspect sessions, and approve sensitive actions.
        </p>
        <DocCodeBlock code={CHAT_CMD} label="Terminal" />
        <div className={styles.screenshotGrid}>
          <figure className={styles.screenshotCard}>
            <img src="/cli/home.png" alt="Seshat CLI welcome screen" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>The CLI home screen is the fastest route for first-time users.</figcaption>
          </figure>
          <figure className={styles.screenshotCard}>
            <img src="/cli/working1.png" alt="Seshat CLI active agent session" className={styles.screenshotImage} />
            <figcaption className={styles.screenshotCaption}>Once the session starts, you get a long-running agent with tool access and streaming output.</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>3. Run a one-shot prompt</h2>
        <p className={styles.p}>
          If you do not want the full TUI yet, the headless entry point is <span className={styles.inlineCode}>seshat run</span>.
          It is useful for quick experiments, scripts, and validating your setup.
        </p>
        <DocCodeBlock code={RUN_CMD} label="Terminal" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Choose your next path</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.cardTitle}>User</span>
            <p className={styles.cardBody}>Stay in the CLI, learn sessions, permissions, model switching, and how to work with the agent day to day.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Vibecoder</span>
            <p className={styles.cardBody}>Open Seshat inside a real repo and use it to inspect files, propose edits, run commands, and iterate on implementation.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Developer</span>
            <p className={styles.cardBody}>Validate the CLI first, then move to SDK and API documentation once you want to embed Seshat in your own product.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Platform user</span>
            <p className={styles.cardBody}>If you are looking for the multi-user desktop and API layer, you are moving toward SeshatOS rather than the runtime alone.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Next step</h2>
        <p className={styles.p}>After Quick Start, go deeper into provider setup or move directly to your first useful agent workflow.</p>
        <div className={styles.actionRow}>
          <Link to={`${base}/getting-started/configuration`} className={styles.primaryLink}>Configuration</Link>
          <Link to={`${base}/getting-started/first-agent`} className={styles.secondaryLink}>First Agent</Link>
        </div>
      </section>
    </div>
  )
}
