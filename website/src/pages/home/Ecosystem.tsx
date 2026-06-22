import styles from './Ecosystem.module.css'

export default function Ecosystem() {
  return (
    <section className="section">
      <div className="container">
        <p className="section-label">The Ecosystem</p>
        <h2 className={styles.title}>Engine + Platform</h2>
        <p className={styles.sub}>
          Seshat is two layers: a headless Go runtime and a full production platform built on top of it.
        </p>

        <div className={styles.grid}>
          {/* Card 1: Engine */}
          <div className={`${styles.card} ${styles.cardEngine}`}>
            <span className={`${styles.tag} ${styles.tagEngine}`}>Engine</span>
            <h3 className={styles.cardTitle}>
              <span className="gradient-text">seshat</span>
            </h3>
            <p className={styles.cardDesc}>
              The Go runtime. Headless, embeddable, production-grade.
              This is the core everything else builds on.
            </p>
            <ul className={styles.features}>
              <li>
                <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>60+ built-in tools (web, files, code, search…)</span>
              </li>
              <li>
                <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>15+ LLM providers (OpenAI, Anthropic, Gemini…)</span>
              </li>
              <li>
                <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>MCP client, gRPC API, persistent sessions</span>
              </li>
              <li>
                <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Sandboxed execution, RAG, skills system</span>
              </li>
              <li>
                <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Installable as CLI or embeddable Go SDK</span>
              </li>
            </ul>
            <a
              className={styles.link}
              href="https://github.com/EngineerProjects/seshat"
              target="_blank"
              rel="noreferrer"
            >
              → github.com/EngineerProjects/seshat
            </a>
          </div>

          {/* Card 2: Platform */}
          <div className={`${styles.card} ${styles.cardPlatform}`}>
            <span className={`${styles.tag} ${styles.tagPlatform}`}>Platform</span>
            <h3 className={styles.cardTitle}>
              <span className="gradient-text-indigo">seshat-ai</span>
            </h3>
            <p className={styles.cardDesc}>
              The full production platform. Desktop app, multi-user backend,
              knowledge base, scheduler. Built on the engine.
            </p>
            <ul className={styles.features}>
              <li>
                <svg className={`${styles.checkIcon} ${styles.checkIconPlatform}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Native desktop app (Electron + React)</span>
              </li>
              <li>
                <svg className={`${styles.checkIcon} ${styles.checkIconPlatform}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Multi-user backend with orgs + workspaces</span>
              </li>
              <li>
                <svg className={`${styles.checkIcon} ${styles.checkIconPlatform}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Knowledge base with hybrid BM25 + vector search</span>
              </li>
              <li>
                <svg className={`${styles.checkIcon} ${styles.checkIconPlatform}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>REST + SSE API (Anthropic-compatible)</span>
              </li>
              <li>
                <svg className={`${styles.checkIcon} ${styles.checkIconPlatform}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Scheduled tasks, plans, MCP server management</span>
              </li>
            </ul>
            <a
              className={styles.link}
              href="https://github.com/EngineerProjects/seshat-ai"
              target="_blank"
              rel="noreferrer"
            >
              → github.com/EngineerProjects/seshat-ai
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
