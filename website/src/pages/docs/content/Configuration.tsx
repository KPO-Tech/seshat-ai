import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import styles from './DocArticle.module.css'

const CLOUD_CMD = 'export ANTHROPIC_API_KEY=sk-ant-...\nseshat config --provider anthropic --api-key "$ANTHROPIC_API_KEY"\nseshat config --model anthropic:claude-sonnet-4-20250514'
const PRINT_CMD = 'seshat config --print'
const OLLAMA_CMD = 'ollama serve\nseshat config --provider ollama\nseshat config --model ollama:llama3.1'
const SETUP_CMD = 'seshat setup --check\nseshat setup'

export default function Configuration() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        <span className={styles.breadSep}>/</span>
        <Link to={`${base}/getting-started`} className={styles.breadLink}>Getting Started</Link>
        <span className={styles.breadSep}>/</span>
        <span className={styles.breadCurrent}>Configuration</span>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>Configuration</h1>
        <p className={styles.sub}>
          Configure the runtime just enough to start working. This page covers the practical minimum for cloud providers,
          local Ollama usage, and the optional setup commands developers usually need next.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.callout}>
          <span className={styles.calloutTitle}>Keep the first setup small</span>
          <p className={styles.calloutText}>
            You do not need to configure every provider or every tool on day one. One working provider,
            one working model, and a successful <span className={styles.inlineCode}>seshat chat</span> session is enough to begin.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Cloud provider setup</h2>
        <p className={styles.p}>
          The most direct setup is to export an API key and tell Seshat which provider and model to use.
          Replace the provider or model with whatever is valid for your environment.
        </p>
        <DocCodeBlock code={CLOUD_CMD} label="Terminal" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Inspect the active configuration</h2>
        <p className={styles.p}>
          Before debugging anything, print the current config. This is the fastest way to confirm provider, model,
          and stored settings.
        </p>
        <DocCodeBlock code={PRINT_CMD} label="Terminal" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Local-first setup with Ollama</h2>
        <p className={styles.p}>
          If you want a local model, start Ollama first and then point Seshat to an Ollama model name.
          The exact model is up to you.
        </p>
        <DocCodeBlock code={OLLAMA_CMD} label="Local Runtime" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Optional document tooling</h2>
        <p className={styles.p}>
          Some document workflows rely on additional Python-backed tooling such as Docling. You do not need this for a simple first chat,
          but developers often want to verify it early.
        </p>
        <DocCodeBlock code={SETUP_CMD} label="Terminal" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Configuration patterns by profile</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.cardTitle}>User</span>
            <p className={styles.cardBody}>One cloud provider and one known-good model are enough. Optimize for simplicity, not completeness.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Vibecoder</span>
            <p className={styles.cardBody}>Pick the model you actually want to use in projects, then validate it inside a real repo with the CLI.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Developer</span>
            <p className={styles.cardBody}>Check provider, model, and optional tooling now so SDK and automation work later without hidden environment issues.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Platform operator</span>
            <p className={styles.cardBody}>If you need per-user credentials, workspaces, or organization policies, that belongs to the SeshatOS platform layer.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Next step</h2>
        <p className={styles.p}>Once configuration is stable, move to the first real workflow instead of adding more setup for its own sake.</p>
        <div className={styles.actionRow}>
          <Link to={`${base}/getting-started/quick-start`} className={styles.secondaryLink}>Back to Quick Start</Link>
          <Link to={`${base}/getting-started/first-agent`} className={styles.primaryLink}>First Agent</Link>
        </div>
      </section>
    </div>
  )
}
