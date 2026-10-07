import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './ServicesHero.module.css'

type LineType = 'cmd' | 'ok' | 'info' | 'warn' | 'meta'
interface TermLine { type: LineType; text: string; delay: number }

type HeroContent = {
  badge: string
  title: string
  highlight: string
  sub: string
  getInTouch: string
  aboutProject: string
  stats: Array<{ value: string; label: string }>
  scenarios: TermLine[][]
}

const EN: HeroContent = {
  badge: 'services · AI teams · pilot-first delivery',
  title: 'One workflow first.',
  highlight: 'Then the right AI team around it.',
  sub: 'Documents, internal knowledge, finance checks, or repetitive back-office operations: the point is not generic automation. The point is to build one serious operational team around one real bottleneck.',
  getInTouch: 'Discuss your workflow',
  aboutProject: 'See the delivery process',
  stats: [
    { value: '3', label: 'core service wedges' },
    { value: 'pilot-first', label: 'delivery model' },
    { value: 'governed', label: 'execution style' },
  ],
  scenarios: [
    [
      { type: 'cmd', text: '> finance-team run "Close Q2 cash reconciliation"', delay: 0 },
      { type: 'info', text: '● Connecting bank exports, ERP, and accounting rules...', delay: 600 },
      { type: 'ok', text: '✓ 847 transactions matched', delay: 1100 },
      { type: 'ok', text: '✓ VAT summary generated for review', delay: 1550 },
      { type: 'warn', text: '⚠ 1 anomaly requires operator confirmation', delay: 2050 },
      { type: 'ok', text: '✓ Draft report prepared for finance manager', delay: 2550 },
      { type: 'meta', text: '⏱ 43s · review-ready instead of half a day', delay: 3100 },
    ],
    [
      { type: 'cmd', text: '> knowledge-team run "Answer new supplier policy questions"', delay: 0 },
      { type: 'info', text: '● Searching policies, PDFs, and internal procedures...', delay: 600 },
      { type: 'ok', text: '✓ 6 relevant source documents retrieved', delay: 1100 },
      { type: 'ok', text: '✓ Answer grounded with citations', delay: 1550 },
      { type: 'ok', text: '✓ Access boundaries respected per workspace', delay: 2050 },
      { type: 'meta', text: '⏱ 18s · support team gets a source-backed answer', delay: 2550 },
    ],
    [
      { type: 'cmd', text: '> document-team run "Validate KYC file #2847"', delay: 0 },
      { type: 'info', text: '● Running OCR, extraction, and compliance checks...', delay: 600 },
      { type: 'ok', text: '✓ Identity document valid until 2029', delay: 1100 },
      { type: 'ok', text: '✓ Address proof under 3 months', delay: 1550 },
      { type: 'warn', text: '⚠ Registry extract older than threshold', delay: 2050 },
      { type: 'ok', text: '✓ Follow-up email prepared for operator review', delay: 2550 },
      { type: 'meta', text: '⏱ 12s · file qualified before human approval', delay: 3050 },
    ],
  ],
}

const FR: HeroContent = {
  badge: 'services · equipes IA · delivery pilote',
  title: 'Un workflow d abord.',
  highlight: 'Puis la bonne equipe IA autour.',
  sub: 'Documents, connaissance interne, controles finance ou operations back-office repetitives : l enjeu n est pas une automatisation generique. L enjeu est de construire une vraie equipe operationnelle autour d un vrai goulet d etranglement.',
  getInTouch: 'Parler de votre workflow',
  aboutProject: 'Voir le process de delivery',
  stats: [
    { value: '3', label: 'wedges de services' },
    { value: 'pilote', label: 'mode d engagement' },
    { value: 'gouverne', label: 'style d execution' },
  ],
  scenarios: [
    [
      { type: 'cmd', text: '> equipe-finance run "Cloture rapprochement tresorerie T2"', delay: 0 },
      { type: 'info', text: '● Connexion exports bancaires, ERP et regles comptables...', delay: 600 },
      { type: 'ok', text: '✓ 847 transactions rapprochees', delay: 1100 },
      { type: 'ok', text: '✓ Synthese TVA preparee pour revue', delay: 1550 },
      { type: 'warn', text: '⚠ 1 anomalie demande confirmation operateur', delay: 2050 },
      { type: 'ok', text: '✓ Brouillon de rapport prepare pour le responsable finance', delay: 2550 },
      { type: 'meta', text: '⏱ 43s · pret pour revue au lieu d une demi-journee', delay: 3100 },
    ],
    [
      { type: 'cmd', text: '> equipe-connaissance run "Repondre aux questions politique fournisseurs"', delay: 0 },
      { type: 'info', text: '● Recherche policies, PDF et procedures internes...', delay: 600 },
      { type: 'ok', text: '✓ 6 documents sources recuperes', delay: 1100 },
      { type: 'ok', text: '✓ Reponse fondee avec citations', delay: 1550 },
      { type: 'ok', text: '✓ Frontieres d acces respectees par workspace', delay: 2050 },
      { type: 'meta', text: '⏱ 18s · l equipe support obtient une reponse sourcee', delay: 2550 },
    ],
    [
      { type: 'cmd', text: '> equipe-documents run "Valider dossier KYC #2847"', delay: 0 },
      { type: 'info', text: '● OCR, extraction et controles conformite en cours...', delay: 600 },
      { type: 'ok', text: '✓ Piece identite valide jusqu en 2029', delay: 1100 },
      { type: 'ok', text: '✓ Justificatif de domicile < 3 mois', delay: 1550 },
      { type: 'warn', text: '⚠ Extrait registre trop ancien pour validation finale', delay: 2050 },
      { type: 'ok', text: '✓ Email de relance prepare pour revue operateur', delay: 2550 },
      { type: 'meta', text: '⏱ 12s · dossier qualifie avant validation humaine', delay: 3050 },
    ],
  ],
}

export default function ServicesHero() {
  const [visible, setVisible] = useState(false)
  const [scenario, setScenario] = useState(0)
  const [shownLines, setShownLines] = useState<TermLine[]>([])
  const [running, setRunning] = useState(false)
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  const { lang, linkTo } = useTranslation()
  const content = lang === 'fr' ? FR : EN

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    timerRefs.current.forEach(clearTimeout)
    timerRefs.current = []
    setShownLines([])
    setRunning(true)

    const lines = content.scenarios[scenario]
    lines.forEach((line, index) => {
      const id = setTimeout(() => {
        setShownLines(prev => [...prev, line])
        if (index === lines.length - 1) {
          const loopId = setTimeout(() => {
            setScenario(current => (current + 1) % content.scenarios.length)
          }, 3200)
          timerRefs.current.push(loopId)
        }
      }, line.delay)
      timerRefs.current.push(id)
    })

    return () => timerRefs.current.forEach(clearTimeout)
  }, [content.scenarios, scenario])

  return (
    <section className={styles.hero}>
      <div className={styles.grid}>
        <div className={`${styles.content} reveal ${visible ? 'visible' : ''}`}>
          <span className={styles.badge}>{content.badge}</span>
          <h1 className={styles.title}>
            {content.title} <span className="gradient-text">{content.highlight}</span>
          </h1>
          <p className={styles.sub}>{content.sub}</p>
          <div className={styles.ctas}>
            <a className={styles.btnPrimary} href="mailto:oastephaneamiche@gmail.com">
              {content.getInTouch}
            </a>
            <Link className={styles.btnSecondary} to={linkTo('/services')} onClick={() => {
              document.getElementById('process-section')?.scrollIntoView({ behavior: 'smooth' })
            }}>
              {content.aboutProject}
            </Link>
          </div>
          <div className={styles.stats}>
            {content.stats.map((item) => (
              <div key={item.label} className={styles.stat}>
                <span className={styles.statValue}>{item.value}</span>
                <span className={styles.statLabel}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${styles.terminal} reveal stagger-2 ${visible ? 'visible' : ''}`}>
          <div className={styles.termHeader}>
            <span className={styles.termDot} style={{ background: '#ef4444' }} />
            <span className={styles.termDot} style={{ background: '#f59e0b' }} />
            <span className={styles.termDot} style={{ background: '#10b981' }} />
            <span className={styles.termTitle}>seshat · AI team runtime</span>
            <div className={styles.scenarioPills}>
              {content.scenarios.map((_, index) => (
                <button
                  key={index}
                  className={`${styles.scenarioPill} ${index === scenario ? styles.scenarioPillActive : ''}`}
                  onClick={() => setScenario(index)}
                  aria-label={`Scenario ${index + 1}`}
                />
              ))}
            </div>
          </div>
          <div className={styles.termBody}>
            {shownLines.map((line, index) => (
              <div key={index} className={`${styles.termLine} ${styles[`line_${line.type}`]}`}>
                {line.text}
              </div>
            ))}
            {running && shownLines.length < content.scenarios[scenario].length && (
              <span className={styles.cursor} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
