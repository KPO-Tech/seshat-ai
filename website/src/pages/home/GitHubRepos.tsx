import React from 'react'
import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './GitHubRepos.module.css'

const GH_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
)

export default function GitHubRepos() {
  const { ref, inView } = useInView(0.15)
  const { t } = useTranslation()
  const { repos: r } = t

  return (
    <section className={styles.section}>
      <div className="container" ref={ref as React.RefObject<HTMLDivElement>}>
        <p className="section-label">{r.label}</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>{r.title}</h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>{r.sub}</p>

        <div className={styles.grid}>
          {/* seshat engine */}
          <div className={`${styles.card} ${styles.cardEngine} reveal stagger-2 ${inView ? 'visible' : ''}`}>
            <div className={styles.cardHeader}>
              <div className={styles.repoIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </div>
              <div>
                <div className={styles.repoName}>{r.engine.name}</div>
                <span className={`${styles.licenseBadge} ${styles.licenseApache}`}>{r.engine.license}</span>
              </div>
            </div>

            <p className={styles.repoDesc}>{r.engine.desc}</p>

            <div className={styles.repoStats}>
              <div className={styles.stat}>
                <span className={styles.statVal}>207K+</span>
                <span className={styles.statLabel}>lines of Go</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statVal}>1,355</span>
                <span className={styles.statLabel}>files</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statVal}>60+</span>
                <span className={styles.statLabel}>tools</span>
              </div>
            </div>

            <div className={styles.repoLinks}>
              <a href="https://github.com/EngineerProjects/seshat" target="_blank" rel="noreferrer" className={`${styles.repoLink} ${styles.repoLinkPrimary}`}>
                {GH_SVG}
                View on GitHub
              </a>
              <a href="https://github.com/EngineerProjects/seshat/issues" target="_blank" rel="noreferrer" className={styles.repoLink}>
                {r.engine.links.issues}
              </a>
              <a href="https://github.com/EngineerProjects/seshat/discussions" target="_blank" rel="noreferrer" className={styles.repoLink}>
                {r.engine.links.discussions}
              </a>
            </div>
          </div>

          {/* seshat-ai platform */}
          <div className={`${styles.card} ${styles.cardPlatform} reveal stagger-3 ${inView ? 'visible' : ''}`}>
            <div className={styles.cardHeader}>
              <div className={`${styles.repoIcon} ${styles.repoIconPlatform}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <div>
                <div className={styles.repoName}>{r.platform.name}</div>
                <span className={`${styles.licenseBadge} ${styles.licenseAgpl}`}>{r.platform.license}</span>
              </div>
            </div>

            <p className={styles.repoDesc}>{r.platform.desc}</p>

            <div className={styles.repoStats}>
              <div className={styles.stat}>
                <span className={`${styles.statVal} ${styles.statValPlatform}`}>Go + React</span>
                <span className={styles.statLabel}>full stack</span>
              </div>
              <div className={styles.stat}>
                <span className={`${styles.statVal} ${styles.statValPlatform}`}>17</span>
                <span className={styles.statLabel}>domain services</span>
              </div>
              <div className={styles.stat}>
                <span className={`${styles.statVal} ${styles.statValPlatform}`}>REST+SSE</span>
                <span className={styles.statLabel}>API</span>
              </div>
            </div>

            <div className={styles.repoLinks}>
              <a href="https://github.com/EngineerProjects/seshat-ai" target="_blank" rel="noreferrer" className={`${styles.repoLink} ${styles.repoLinkPrimary} ${styles.repoLinkPrimaryPlatform}`}>
                {GH_SVG}
                View on GitHub
              </a>
              <a href="https://github.com/EngineerProjects/seshat-ai/issues" target="_blank" rel="noreferrer" className={styles.repoLink}>
                {r.platform.links.issues}
              </a>
              <a href="https://github.com/EngineerProjects/seshat-ai/discussions" target="_blank" rel="noreferrer" className={styles.repoLink}>
                {r.platform.links.discussions}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
