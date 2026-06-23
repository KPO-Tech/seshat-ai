import { useTranslation } from '../../hooks/useTranslation'
import styles from './Ecosystem.module.css'

export default function Ecosystem() {
  const { t } = useTranslation()
  const { ecosystem: eco } = t

  const CheckIcon = ({ platform }: { platform?: boolean }) => (
    <svg
      className={platform ? `${styles.checkIcon} ${styles.checkIconPlatform}` : styles.checkIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )

  return (
    <section className="section">
      <div className="container">
        <p className="section-label">{eco.label}</p>
        <h2 className={styles.title}>{eco.title}</h2>
        <p className={styles.sub}>{eco.sub}</p>

        <div className={styles.grid}>
          <div className={`${styles.card} ${styles.cardEngine}`}>
            <span className={`${styles.tag} ${styles.tagEngine}`}>{eco.engine.tag}</span>
            <h3 className={styles.cardTitle}>
              <span className="gradient-text">{eco.engine.name}</span>
            </h3>
            <p className={styles.cardDesc}>{eco.engine.desc}</p>
            <ul className={styles.features}>
              {eco.engine.features.map((f) => (
                <li key={f}>
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
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

          <div className={`${styles.card} ${styles.cardPlatform}`}>
            <span className={`${styles.tag} ${styles.tagPlatform}`}>{eco.platform.tag}</span>
            <h3 className={styles.cardTitle}>
              <span className="gradient-text-indigo">{eco.platform.name}</span>
            </h3>
            <p className={styles.cardDesc}>{eco.platform.desc}</p>
            <ul className={styles.features}>
              {eco.platform.features.map((f) => (
                <li key={f}>
                  <CheckIcon platform />
                  <span>{f}</span>
                </li>
              ))}
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
