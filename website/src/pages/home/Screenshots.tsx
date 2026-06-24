import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Screenshots.module.css'

const CLI_SHOTS = [
  { src: '/cli/home.png',            caption: 'Welcome',        detail: 'Up and running in 10 seconds', alt: 'Seshat CLI TUI welcome screen,agentic terminal interface' },
  { src: '/cli/commands_pannel.png', caption: 'Settings panel', detail: 'Every shortcut, one keystroke away (ctrl+p)', alt: 'Seshat CLI command panel,keyboard shortcuts and settings' },
  { src: '/cli/working1.png',        caption: 'Agent at work',  detail: 'Full reasoning trace, thinking blocks and tool calls', alt: 'Seshat AI agent working,reasoning trace and tool calls in terminal' },
  { src: '/cli/working2.png',        caption: 'Streaming',      detail: 'Markdown rendering and tool timings in real time', alt: 'Seshat CLI streaming output,real-time markdown and tool timings' },
  { src: '/cli/model_selction.png',  caption: 'Model picker',   detail: 'Switch across 20+ models in 2 keystrokes', alt: 'Seshat model picker,switching between LLM providers and models' },
  { src: '/cli/provider_config.png', caption: 'Provider config', detail: 'API keys encrypted, scoped per provider', alt: 'Seshat provider configuration,encrypted API keys per LLM provider' },
]

const DESKTOP_SHOTS = [
  { src: '/desktop/home.png',     caption: 'Home',     detail: 'Multi-workspace dashboard with sessions and knowledge base', alt: 'Seshat desktop app home,multi-workspace AI agent dashboard' },
  { src: '/desktop/Agent.png',    caption: 'Agent',    detail: 'Full agent chat with tool call visualization and thinking trace', alt: 'Seshat desktop agent chat,tool call visualization and thinking trace' },
  { src: '/desktop/skills.png',   caption: 'Skills',   detail: 'Visual skills creator to build and manage reusable agent behaviors', alt: 'Seshat skills creator,building reusable AI agent behaviors visually' },
  { src: '/desktop/settings.png', caption: 'Settings', detail: 'Provider config, API keys, MCP servers and workspace settings', alt: 'Seshat desktop settings,MCP servers, API keys and workspace configuration' },
]

type Tab = 'cli' | 'desktop'

export default function Screenshots() {
  const [tab, setTab] = useState<Tab>('desktop')
  const { t } = useTranslation()
  const shots = tab === 'cli' ? CLI_SHOTS : DESKTOP_SHOTS

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <p className="section-label">{t.screenshots.label}</p>
        <h2 className={styles.title}>{t.screenshots.title}</h2>
        <p className={styles.sub}>{t.screenshots.sub}</p>

        <div className={styles.tabs}>
          <button
            className={tab === 'desktop' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab('desktop')}
          >
            {t.screenshots.tabs.desktop}
          </button>
          <button
            className={tab === 'cli' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab('cli')}
          >
            {t.screenshots.tabs.cli}
          </button>
        </div>

        <div className={styles.grid}>
          {shots.map((s) => (
            <div key={s.src} className={styles.card}>
              <div className={styles.frameHeader}>
                <div className={styles.dots}>
                  <div className={`${styles.dot} ${styles.dotRed}`} />
                  <div className={`${styles.dot} ${styles.dotYellow}`} />
                  <div className={`${styles.dot} ${styles.dotGreen}`} />
                </div>
                <span className={styles.frameTitle}>
                  {tab === 'cli'
                    ? `seshat-cli://shell/${s.caption.toLowerCase().replace(/\s+/g, '-')}`
                    : `seshat-desktop://${s.caption.toLowerCase().replace(/\s+/g, '-')}`}
                </span>
              </div>
              <div className={styles.imgWrap}>
                <img src={s.src} alt={s.alt} loading="lazy" />
              </div>
              <div className={styles.caption}>
                <strong>{s.caption}</strong>{' '}{s.detail}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
