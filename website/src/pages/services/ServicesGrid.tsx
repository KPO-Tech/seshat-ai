import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './ServicesGrid.module.css'

type FlowStep = { label: string; icon: React.ReactElement; checkpoint?: boolean }

type Service = {
  category: 'automation' | 'agents' | 'data'
  num: string
  title: string
  body: string
  tags: string[]
  bullets: string[]
}

type Content = {
  label: string
  title: string
  sub: string
  services: Service[]
  ctaLabel: string
  includedLabel: string
  flipHint: string
  pipelineLabel: string
  customCard: {
    label: string
    title: string
    body: string
    bullets: string[]
    cta: string
  }
  whoLabel: string
  whoTitle: string
  whoFor: Array<{ label: string; desc: string }>
}

/* ─── Icons ────────────────────────────────────────────── */
const I = {
  file:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  code:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  check:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  eye:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  arrow:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  database: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  shield:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  message:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  inbox:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
  layers:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  play:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
}

const FLOWS: Record<string, FlowStep[]> = {
  automation: [
    { label: 'Intake',   icon: I.file },
    { label: 'Extract',  icon: I.code },
    { label: 'Validate', icon: I.check },
    { label: 'Review',   icon: I.eye,   checkpoint: true },
    { label: 'Route',    icon: I.arrow },
  ],
  agents: [
    { label: 'Query',    icon: I.search },
    { label: 'Retrieve', icon: I.database },
    { label: 'Ground',   icon: I.layers },
    { label: 'Verify',   icon: I.shield, checkpoint: true },
    { label: 'Answer',   icon: I.message },
  ],
  data: [
    { label: 'Inbox',    icon: I.inbox },
    { label: 'Classify', icon: I.layers },
    { label: 'Route',    icon: I.arrow },
    { label: 'Approve',  icon: I.check,  checkpoint: true },
    { label: 'Execute',  icon: I.play },
  ],
}

const CAT_ICONS: Record<string, React.ReactElement> = {
  automation: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  agents:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  data:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
}

const CAT_META: Record<string, { cls: string; accent: string; dot: string }> = {
  automation: { cls: styles.catOrange, accent: 'rgba(232, 64, 30, 0.28)',  dot: '#e8401e' },
  agents:     { cls: styles.catPurple, accent: 'rgba(99, 102, 241, 0.28)', dot: '#a78bfa' },
  data:       { cls: styles.catGreen,  accent: 'rgba(16, 185, 129, 0.28)', dot: '#10b981' },
}

/* ─── Content ──────────────────────────────────────────── */
const EN: Content = {
  label: 'Service wedges',
  title: 'Three clear entry points into AI teams',
  sub: 'Each offer solves one serious business problem first, then becomes the base of a broader AI team if the pilot proves its value.',
  ctaLabel: 'Contact us',
  includedLabel: 'What\'s included',
  flipHint: 'See details',
  pipelineLabel: 'Agent pipeline',
  services: [
    {
      category: 'automation',
      num: '01',
      title: 'Intelligent document processing',
      body: 'File-heavy workflows where documents must be extracted, checked, and routed with explicit human checkpoints on sensitive decisions.',
      tags: ['KYC/KYB', 'Claims', 'Contracts', 'Compliance'],
      bullets: [
        'KYC/KYB, claims, contracts, HR files, and compliance',
        'Structured extraction, anomaly flags, and routing logic',
        'Human review before sensitive validation or escalation',
      ],
    },
    {
      category: 'agents',
      num: '02',
      title: 'AI knowledge team',
      body: 'A secure internal assistant connected to procedures, PDFs, and operational documents so teams retrieve grounded answers with visible sources.',
      tags: ['Internal search', 'Support', 'Onboarding', 'RAG'],
      bullets: [
        'Hybrid retrieval over internal documents and knowledge corpora',
        'Source-backed answers with access and workspace boundaries',
        'Useful for support, onboarding, operations, and internal search',
      ],
    },
    {
      category: 'data',
      num: '03',
      title: 'Back-office and finance automation',
      body: 'Repetitive operational flows including email intake, request routing, approvals, and finance checks when the workflow is concrete and auditable.',
      tags: ['Inbox triage', 'Approvals', 'Finance', 'Routing'],
      bullets: [
        'Inbox triage, routing, escalation, and response preparation',
        'Finance and accounting automations when the process is well-scoped',
        'Traceable execution paths for operator-led teams',
      ],
    },
  ],
  customCard: {
    label: 'Other workflow',
    title: 'Yours does not fit any of these? We scope it with you before building anything.',
    body: 'The three offers above are the main entry points. But if your real problem sits in a specific workflow we can analyze it first.',
    bullets: [
      'Workflow framing before any build commitment',
      'Finance, accounting, and administrative flows valid when concrete enough',
      'Only pursued when deployment, review, and ownership are credible',
    ],
    cta: 'Discuss your workflow',
  },
  whoLabel: 'Best fit',
  whoTitle: 'Built for teams with repetitive work and review constraints',
  whoFor: [
    { label: 'Document-heavy teams', desc: 'Operations, compliance, legal, HR, and admin processing recurring files.' },
    { label: 'Knowledge-sensitive orgs', desc: 'Structures needing internal answers without exposing core knowledge to uncontrolled external tools.' },
    { label: 'Back-office and finance', desc: 'Teams with recurring requests, routing loops, operator reviews, and repetitive checks.' },
    { label: 'Confidentiality-sensitive', desc: 'Organizations that care about self-hosting, deployment boundaries, and operational control.' },
  ],
}

const FR: Content = {
  label: 'Wedges de services',
  title: 'Trois points d entree clairs vers des equipes IA',
  sub: 'Chaque offre resout d abord un vrai probleme metier, puis peut devenir la base d une equipe IA plus large si le pilote prouve sa valeur.',
  ctaLabel: 'Nous contacter',
  includedLabel: 'Ce qui est inclus',
  flipHint: 'Voir les details',
  pipelineLabel: 'Pipeline agent',
  services: [
    {
      category: 'automation',
      num: '01',
      title: 'Traitement documentaire intelligent',
      body: 'Workflows a forte charge documentaire ou les fichiers doivent etre extraits, verifies et routes avec checkpoints humains sur les decisions sensibles.',
      tags: ['KYC/KYB', 'Sinistres', 'Contrats', 'Conformite'],
      bullets: [
        'KYC/KYB, sinistres, contrats, dossiers RH et conformite',
        'Extraction structuree, signaux d anomalie et logique de routage',
        'Revue humaine avant validation ou escalade sensible',
      ],
    },
    {
      category: 'agents',
      num: '02',
      title: 'Equipe IA de connaissance interne',
      body: 'Un assistant interne securise relie aux procedures, PDF et documents operationnels pour retrouver des reponses utiles avec sources visibles.',
      tags: ['Recherche interne', 'Support', 'Onboarding', 'RAG'],
      bullets: [
        'Retrieval hybride sur documents internes et corpus de connaissance',
        'Reponses sourcees avec frontieres d acces et de workspace',
        'Utile pour support, onboarding, operations et recherche interne',
      ],
    },
    {
      category: 'data',
      num: '03',
      title: 'Automatisation back-office et finance',
      body: 'Flux operationnels repetitifs : tri email, routage, validations et controles finance, quand le workflow est concret et auditable.',
      tags: ['Tri inbox', 'Validations', 'Finance', 'Routage'],
      bullets: [
        'Tri inbox, routage, escalade et preparation de reponse',
        'Automatisations finance et comptabilite quand le process est bien cadre',
        'Chemins d execution tracables pour les equipes metier',
      ],
    },
  ],
  customCard: {
    label: 'Autre workflow',
    title: 'Pas exactement adapte ? On le cadre avec vous avant tout build.',
    body: 'Les trois offres sont le point d entree principal. Mais si votre vrai probleme est ailleurs, on l analyse d abord.',
    bullets: [
      'Cadrage du workflow avant tout engagement de build',
      'Finance, comptabilite et flux administratifs valides si assez concrets',
      'On avance uniquement si deploiement, revue et ownership sont credibles',
    ],
    cta: 'Discuter de votre workflow',
  },
  whoLabel: 'Bon fit',
  whoTitle: 'Concu pour les equipes avec travail repetitif et contraintes de revue',
  whoFor: [
    { label: 'Equipes documentaires', desc: 'Operations, conformite, juridique, RH et administratif avec fichiers recurrents.' },
    { label: 'Orgs sensibles sur la connaissance', desc: 'Structures qui veulent des reponses internes sans exposer leur savoir aux outils externes non controles.' },
    { label: 'Back-office et finance', desc: 'Equipes avec demandes recurrentes, boucles de routage, revues operateur et controles repetitifs.' },
    { label: 'Environnements confidentiels', desc: 'Organisations qui ont besoin de self-hosting, de frontieres claires et de controle operationnel.' },
  ],
}

const catLabel: Record<string, Record<string, string>> = {
  en: { automation: 'Documents', agents: 'Knowledge', data: 'Operations' },
  fr: { automation: 'Documents', agents: 'Connaissance', data: 'Operations' },
}

/* ─── Compact flow for card front ─────────────────────── */
function CardFlow({ steps }: { steps: FlowStep[] }) {
  return (
    <div className={styles.cardFlow}>
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          <div className={`${styles.cfNode} ${step.checkpoint ? styles.cfCheck : ''}`}>
            <span className={styles.cfIcon}>{step.icon}</span>
            <span className={styles.cfLabel}>{step.label}</span>
          </div>
          {i < steps.length - 1 && <span className={styles.cfArr} aria-hidden>›</span>}
        </React.Fragment>
      ))}
    </div>
  )
}

/* ─── Main component ────────────────────────────────────── */
export default function ServicesGrid() {
  const [flipped, setFlipped] = useState<number | null>(null)
  const { lang } = useTranslation()
  const content = lang === 'fr' ? FR : EN
  const labels = catLabel[lang] ?? catLabel.en

  const handleClick = (i: number) => {
    const isTouch = window.matchMedia('(hover: none)').matches
    if (isTouch) setFlipped(flipped === i ? null : i)
  }

  return (
    <section className="section">
      <div className="container">
        <div className={styles.head}>
          <p className="section-label">{content.label}</p>
          <h2 className={styles.title}>{content.title}</h2>
          <p className={styles.sub}>{content.sub}</p>
        </div>

        <div className={styles.cardGrid}>
          {content.services.map((service, i) => {
            const meta = CAT_META[service.category]
            const isFlipped = flipped === i

            return (
              <motion.div
                key={service.num}
                className={styles.cardWrapper}
                style={{ '--card-accent': meta.accent, '--card-dot': meta.dot } as React.CSSProperties}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.55 }}
                onClick={() => handleClick(i)}
              >
                <div className={`${styles.card} ${isFlipped ? styles.cardFlipped : ''}`}>

                  {/* ── Front ── */}
                  <div className={styles.cardFront}>
                    <div className={styles.faceTop}>
                      <div className={`${styles.catIcon} ${meta.cls}`}>
                        {CAT_ICONS[service.category]}
                      </div>
                      <span className={`${styles.catBadge} ${meta.cls}`}>
                        <span className={styles.badgeDot} />
                        {labels[service.category]}
                      </span>
                    </div>

                    <span className={styles.cardNum}>{service.num}</span>
                    <h3 className={styles.cardTitle}>{service.title}</h3>
                    <p className={styles.cardBody}>{service.body}</p>

                    <div className={styles.cardTags}>
                      {service.tags.map((tag) => (
                        <span key={tag} className={styles.cardTag}>{tag}</span>
                      ))}
                    </div>

                    <div className={styles.cardFlowWrap}>
                      <p className={styles.cardFlowLabel}>{content.pipelineLabel}</p>
                      <CardFlow steps={FLOWS[service.category]} />
                    </div>

                    <div className={styles.flipHint}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                      </svg>
                      <span>{content.flipHint}</span>
                    </div>
                  </div>

                  {/* ── Back ── */}
                  <div className={styles.cardBack}>
                    <div className={styles.backHeader}>
                      <span className={`${styles.catIcon} ${styles.catIconSm} ${meta.cls}`}>
                        {CAT_ICONS[service.category]}
                      </span>
                      <div>
                        <span className={styles.backNum}>{service.num}</span>
                        <h3 className={styles.backTitle}>{service.title}</h3>
                      </div>
                    </div>

                    <div className={styles.backDivider} />

                    <div className={styles.backInner}>
                      <p className={styles.includedLabel}>{content.includedLabel}</p>
                      <ul className={styles.backBullets}>
                        {service.bullets.map((b) => (
                          <li key={b} className={styles.backBullet}>
                            <span className={styles.backDot} />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <a href="mailto:oastephaneamiche@gmail.com" className={styles.backCta}>
                      {content.ctaLabel}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="7" y1="17" x2="17" y2="7"/>
                        <polyline points="7 7 17 7 17 17"/>
                      </svg>
                    </a>
                  </div>

                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Custom card */}
        <motion.div
          className={styles.custom}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className={styles.customLeft}>
            <span className={styles.customPill}>{content.customCard.label}</span>
            <h3 className={styles.customTitle}>{content.customCard.title}</h3>
            <p className={styles.customBody}>{content.customCard.body}</p>
            <ul className={styles.customBullets}>
              {content.customCard.bullets.map((b) => (
                <li key={b} className={styles.customBullet}>
                  <span className={styles.customDot} />
                  {b}
                </li>
              ))}
            </ul>
            <a href="mailto:oastephaneamiche@gmail.com" className={styles.customCta}>
              {content.customCard.cta}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </a>
          </div>
          <div className={styles.customRight}>
            <img src="/img/Business Plan-pana.svg" alt="" aria-hidden="true" className={styles.customImg} />
          </div>
        </motion.div>

        {/* Who section */}
        <div className={styles.who}>
          <p className="section-label" style={{ marginTop: '5rem' }}>{content.whoLabel}</p>
          <h2 className={styles.whoTitle}>{content.whoTitle}</h2>
          <div className={styles.whoGrid}>
            {content.whoFor.map((item, i) => (
              <motion.div
                key={item.label}
                className={styles.whoItem}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.45 }}
              >
                <strong className={styles.whoItemLabel}>{item.label}</strong>
                <span className={styles.whoItemDesc}>{item.desc}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
