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
  { src: '/desktop/home.png',            caption: 'Home',            detail: 'New chat, quick actions, provider and model selector', alt: 'Seshat desktop home,new chat interface with sidebar and quick actions' },
  { src: '/desktop/skills.png',          caption: 'Skills Creator',  detail: 'Author reusable agent skills with live test chat', alt: 'Seshat skills creator,building reusable AI agent behaviors visually' },
  { src: '/desktop/scheduled-tasks.png', caption: 'Scheduled Tasks', detail: 'Recurring agent jobs on cron, with built-in TaskAgent', alt: 'Seshat scheduled tasks,cron-based recurring AI agent jobs with TaskAgent' },
  { src: '/desktop/workspace.png',       caption: 'Workspace',       detail: 'Agents, knowledge bases and document collections', alt: 'Seshat workspace,AI agents and knowledge base document collections' },
  { src: '/desktop/web-search.png',      caption: 'Web Search',      detail: 'Domain catalog and web search provider configuration', alt: 'Seshat web search settings,domain catalog and search provider configuration' },
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
