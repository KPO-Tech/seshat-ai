import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './ServicesHero.module.css'

type LineType = 'cmd' | 'ok' | 'info' | 'warn' | 'meta'
interface TermLine { type: LineType; text: string; delay: number }

const SCENARIOS: TermLine[][] = [
  [
    { type: 'cmd',  text: '> seshat run --agent comptable "Analyse bilan Q2 2026"', delay: 0 },
    { type: 'info', text: '● Connexion API Qonto...', delay: 600 },
    { type: 'ok',   text: '✓ 847 transactions chargées', delay: 1100 },
    { type: 'ok',   text: '✓ Rapprochement bancaire : 99.2%', delay: 1550 },
    { type: 'ok',   text: '✓ TVA calculée : 18 420 €', delay: 1950 },
    { type: 'warn', text: '⚠ Anomalie · écriture 2026-06-12 (doublon probable)', delay: 2400 },
    { type: 'ok',   text: '✓ Rapport PDF → bilan_Q2_2026.pdf', delay: 2900 },
    { type: 'meta', text: '⏱ 43s · 4h de travail économisées', delay: 3350 },
  ],
  [
    { type: 'cmd',  text: '> seshat run --agent bi "Rapport hebdo direction"', delay: 0 },
    { type: 'info', text: '● Connexion ERP + CRM + data warehouse...', delay: 600 },
    { type: 'ok',   text: '✓ CA semaine : 284 500 € (+12% vs S-1)', delay: 1100 },
    { type: 'ok',   text: '✓ 1 423 commandes · panier moyen : 199 €', delay: 1550 },
    { type: 'warn', text: '⚠ Taux de retour e-commerce : +8% (seuil critique)', delay: 2050 },
    { type: 'ok',   text: '✓ Rapport PDF → direction_S25.pdf', delay: 2550 },
    { type: 'ok',   text: '✓ Slack #direction · message envoyé', delay: 2950 },
    { type: 'meta', text: '⏱ 28s · rapport prêt avant la réunion', delay: 3350 },
  ],
  [
    { type: 'cmd',  text: '> seshat run --agent kyc "Valider dossier #KYC-2847"', delay: 0 },
    { type: 'info', text: '● Analyse documents via Docling OCR...', delay: 600 },
    { type: 'ok',   text: '✓ Pièce identité : valide · expire 2029', delay: 1100 },
    { type: 'ok',   text: '✓ Justificatif domicile : < 3 mois ✓', delay: 1550 },
    { type: 'warn', text: '⚠ Kbis : date de dépôt > 6 mois · relance client', delay: 2100 },
    { type: 'ok',   text: '✓ Score de conformité : 87% (2 points bloquants)', delay: 2600 },
    { type: 'ok',   text: '✓ Email de relance envoyé · dossier en attente', delay: 3050 },
    { type: 'meta', text: '⏱ 12s · traitement complet du dossier', delay: 3350 },
  ],
]

export default function ServicesHero() {
  const [visible, setVisible] = useState(false)
  const [scenario, setScenario] = useState(0)
  const [shownLines, setShownLines] = useState<TermLine[]>([])
  const [running, setRunning] = useState(false)
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  const { t, linkTo } = useTranslation()
  const h = t.servicesHero

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    timerRefs.current.forEach(clearTimeout)
    timerRefs.current = []
    setShownLines([])
    setRunning(true)

    const lines = SCENARIOS[scenario]
    lines.forEach((line, i) => {
      const id = setTimeout(() => {
        setShownLines(prev => [...prev, line])
        if (i === lines.length - 1) {
          const loopId = setTimeout(() => {
            setScenario(s => (s + 1) % SCENARIOS.length)
          }, 3200)
          timerRefs.current.push(loopId)
        }
      }, line.delay)
      timerRefs.current.push(id)
    })

    return () => timerRefs.current.forEach(clearTimeout)
  }, [scenario])

  return (
    <section className={styles.hero}>
      <div className={styles.grid}>
        <div className={`${styles.content} reveal ${visible ? 'visible' : ''}`}>
          <span className={styles.badge}>{h.badge}</span>
          <h1 className={styles.title}>
            {h.title1}<br />
            <span className="gradient-text-indigo">{h.titleHighlight}</span>
          </h1>
          <p className={styles.sub}>{h.sub}</p>
          <div className={styles.ctas}>
            <a className={styles.btnPrimary} href="mailto:oastephaneamiche@gmail.com">
              {h.getInTouch}
            </a>
            <Link className={styles.btnSecondary} to={linkTo('/services')} onClick={() => {
              document.getElementById('process-section')?.scrollIntoView({ behavior: 'smooth' })
            }}>
              {h.aboutProject}
            </Link>
          </div>
          <div className={styles.stats}>
            {h.stats.map(s => (
              <div key={s.label} className={styles.stat}>
                <span className={styles.statValue}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${styles.terminal} reveal stagger-2 ${visible ? 'visible' : ''}`}>
          <div className={styles.termHeader}>
            <span className={styles.termDot} style={{ background: '#ef4444' }} />
            <span className={styles.termDot} style={{ background: '#f59e0b' }} />
            <span className={styles.termDot} style={{ background: '#10b981' }} />
            <span className={styles.termTitle}>seshat · agent runtime</span>
            <div className={styles.scenarioPills}>
              {SCENARIOS.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.scenarioPill} ${i === scenario ? styles.scenarioPillActive : ''}`}
                  onClick={() => setScenario(i)}
                  aria-label={`Scenario ${i + 1}`}
                />
              ))}
            </div>
          </div>
          <div className={styles.termBody}>
            {shownLines.map((line, i) => (
              <div key={i} className={`${styles.termLine} ${styles[`line_${line.type}`]}`}>
                {line.text}
              </div>
            ))}
            {running && shownLines.length < SCENARIOS[scenario].length && (
              <span className={styles.cursor} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
