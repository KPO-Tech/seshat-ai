import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useTranslation } from '../../hooks/useTranslation'
import ProblemDiagram from './ProblemDiagram'
import styles from './Page.module.css'

type OrgNode = { role: string; title: string }

type Team = {
  tag: string
  title: string
  roles: string[]
}

type HowStep = { num: string; title: string; body: string }

type HomeContent = {
  meta: { title: string; description: string }
  hero: {
    badge: string
    title: string
    highlight: string
    sub: string
    primary: string
    secondary: string
    tertiary: string
    proofs: string[]
    top: OrgNode
    middle: OrgNode[]
    bottom: OrgNode[]
  }
  problem: {
    label: string
    title: string
    sub: string
    points: Array<{ num: string; title: string; body: string }>
  }
  teams: {
    label: string
    title: string
    sub: string
    items: Team[]
  }
  how: {
    label: string
    title: string
    steps: HowStep[]
  }
  cta: {
    label: string
    title: string
    sub: string
    primary: string
    secondary: string
  }
}

const ROLE_ICONS: Record<string, React.ReactElement> = {
  CEO: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="5" rx="1"/>
      <rect x="2" y="15" width="6" height="5" rx="1"/>
      <rect x="16" y="15" width="6" height="5" rx="1"/>
      <path d="M5 15v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/>
      <line x1="12" y1="7" x2="12" y2="11"/>
    </svg>
  ),
  CMO: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ),
  CTO: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  COO: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  Engineer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  Finance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
}

const EN: HomeContent = {
  meta: {
    title: 'Seshat | AI Teams for Documents, Knowledge, and Operations',
    description: 'Seshat helps organizations deploy governed AI teams for document processing, internal knowledge, and back-office workflows, powered by an open Go runtime.',
  },
  hero: {
    badge: 'AI teams · governed workflows · self-hosted option',
    title: 'Deploy AI teams for',
    highlight: 'real operations.',
    sub: 'Seshat helps organizations automate document-heavy, knowledge-heavy, and back-office work with governed AI teams built around one concrete workflow at a time.',
    primary: 'Start a pilot',
    secondary: 'See services',
    tertiary: 'Read the docs',
    proofs: [
      'Document intake, validation, and compliance',
      'Internal knowledge and source-backed assistants',
      'Back-office and finance operations with review control',
    ],
    top: { role: 'CEO', title: 'Workflow owner' },
    middle: [
      { role: 'CMO', title: 'Customer communication' },
      { role: 'CTO', title: 'Systems orchestration' },
      { role: 'COO', title: 'Operations control' },
    ],
    bottom: [
      { role: 'Engineer', title: 'Automation engineer' },
      { role: 'Finance', title: 'Finance & accounting' },
    ],
  },
  problem: {
    label: 'Where the value starts',
    title: 'Most companies do not need another generic assistant.',
    sub: 'They need repetitive work to move faster without losing control, traceability, or human review where it matters.',
    points: [
      {
        num: '01',
        title: 'Too many documents, not enough throughput',
        body: 'Teams lose time reading, extracting, qualifying, and routing the same files again and again.',
      },
      {
        num: '02',
        title: 'Knowledge exists but nobody can use it fast enough',
        body: 'Policies, PDFs, and wikis stay fragmented — answers depend on who already knows where to look.',
      },
      {
        num: '03',
        title: 'Back-office work is repetitive but still sensitive',
        body: 'Email triage, finance checks, and escalations are automatable, but only with clear review boundaries.',
      },
      {
        num: '04',
        title: 'Closed tools create dependency instead of leverage',
        body: 'If the workflow matters, you need deployment control, provider choice, and a system you can govern.',
      },
    ],
  },
  teams: {
    label: 'AI teams',
    title: 'Three teams, three real entry points.',
    sub: 'The right abstraction for a business buyer is a team with a job, a scope, and an output path.',
    items: [
      {
        tag: 'Documents',
        title: 'Intelligent Document Team',
        roles: ['Intake', 'Extraction', 'Validation', 'Human review'],
      },
      {
        tag: 'Knowledge',
        title: 'Internal Knowledge Team',
        roles: ['Search', 'Verification', 'Answering', 'Reporting'],
      },
      {
        tag: 'Operations',
        title: 'Back-Office & Finance Team',
        roles: ['Routing', 'Inbox', 'Finance checks', 'Escalation'],
      },
    ],
  },
  how: {
    label: 'How it works',
    title: 'One workflow. One team. Real results.',
    steps: [
      {
        num: '01',
        title: 'Identify the bottleneck',
        body: 'Pick one concrete operational workflow where your team is losing time, accuracy, or control. That is the starting point.',
      },
      {
        num: '02',
        title: 'Build the AI team',
        body: 'We design agents, tools, review checkpoints, and integrations specifically around that workflow. Nothing generic.',
      },
      {
        num: '03',
        title: 'It runs, you govern',
        body: 'The team executes autonomously. You stay in control of decisions that require human judgment. No black box.',
      },
    ],
  },
  cta: {
    label: 'Pilot-first',
    title: 'Start with one workflow, not a transformation program.',
    sub: 'Describe the first operational workflow you want to improve. If the wedge is real, it becomes a serious pilot and then expands into adjacent teams.',
    primary: 'Describe your workflow',
    secondary: 'See the service page',
  },
}

const FR: HomeContent = {
  meta: {
    title: 'Seshat | Equipes IA pour documents, connaissance et operations',
    description: 'Seshat aide les organisations a deployer des equipes IA gouvernees pour les workflows documentaires, la connaissance interne et le back-office, avec un runtime Go open source en fondation.',
  },
  hero: {
    badge: 'equipes IA · workflows gouvernes · option self-hosted',
    title: 'Deployer des equipes IA pour',
    highlight: 'de vrais workflows.',
    sub: 'Seshat aide les organisations a automatiser le travail documentaire, la connaissance interne et les operations back-office avec des equipes IA construites autour d un workflow concret a la fois.',
    primary: 'Demarrer un pilote',
    secondary: 'Voir les services',
    tertiary: 'Lire la documentation',
    proofs: [
      'Intake documentaire, validation et conformite',
      'Assistants internes relies aux sources et procedures',
      'Operations back-office et finance avec revue humaine',
    ],
    top: { role: 'CEO', title: 'Responsable workflow' },
    middle: [
      { role: 'CMO', title: 'Communication client' },
      { role: 'CTO', title: 'Orchestration systeme' },
      { role: 'COO', title: 'Controle operationnel' },
    ],
    bottom: [
      { role: 'Engineer', title: 'Ingenieur automatisation' },
      { role: 'Finance', title: 'Finance et comptabilite' },
    ],
  },
  problem: {
    label: 'La ou la valeur commence',
    title: 'La plupart des entreprises n ont pas besoin d un assistant generique de plus.',
    sub: 'Elles ont besoin que le travail repetitif aille plus vite sans perdre le controle, la tracabilite ni les revues humaines.',
    points: [
      {
        num: '01',
        title: 'Trop de documents, pas assez de debit',
        body: 'Les equipes perdent du temps a lire, extraire, qualifier et router les memes fichiers encore et encore.',
      },
      {
        num: '02',
        title: 'La connaissance existe mais reste difficile a exploiter',
        body: 'Procedures, PDF et wikis restent eparpilles — les reponses dependent de qui sait deja ou chercher.',
      },
      {
        num: '03',
        title: 'Le back-office est repetitif mais reste sensible',
        body: 'Tri email, controles finance et escalades sont automatisables, mais seulement avec des limites claires.',
      },
      {
        num: '04',
        title: 'Les outils fermes creent de la dependance',
        body: 'Si le workflow compte vraiment, il faut du controle de deploiement, du choix fournisseur et un systeme gouvernable.',
      },
    ],
  },
  teams: {
    label: 'Equipes IA',
    title: 'Trois equipes, trois points d entree reels.',
    sub: 'Pour un acheteur business, la bonne abstraction c est une equipe avec un role, un perimetre et une sortie claire.',
    items: [
      {
        tag: 'Documents',
        title: 'Equipe documentaire intelligente',
        roles: ['Intake', 'Extraction', 'Validation', 'Revue humaine'],
      },
      {
        tag: 'Connaissance',
        title: 'Equipe de connaissance interne',
        roles: ['Recherche', 'Verification', 'Reponse', 'Reporting'],
      },
      {
        tag: 'Operations',
        title: 'Equipe back-office et finance',
        roles: ['Routage', 'Inbox', 'Controles finance', 'Escalade'],
      },
    ],
  },
  how: {
    label: 'Comment ca marche',
    title: 'Un workflow. Une equipe. Des resultats concrets.',
    steps: [
      {
        num: '01',
        title: 'Identifier le goulet',
        body: 'Un workflow operationnel concret ou votre equipe perd du temps, de la qualite ou du controle. C est le point de depart.',
      },
      {
        num: '02',
        title: 'Construire l equipe IA',
        body: 'On concoit les agents, outils, checkpoints de revue et integrations specifiquement autour de ce workflow. Rien de generique.',
      },
      {
        num: '03',
        title: 'Ca tourne, vous gouvernez',
        body: 'L equipe s execute de facon autonome. Vous gardez le controle sur les decisions humaines. Points de revue integres, pas de boite noire.',
      },
    ],
  },
  cta: {
    label: 'Pilote d abord',
    title: 'Commencer par un workflow, pas par un programme de transformation.',
    sub: 'Decris le premier workflow operationnel que tu veux ameliorer. Si la wedge est reelle, elle devient un pilote serieux puis s etend a des equipes adjacentes.',
    primary: 'Decrire votre workflow',
    secondary: 'Voir la page services',
  },
}

function NodeCard({ node, size = 'md' }: { node: OrgNode; size?: 'lg' | 'md' | 'sm' }) {
  const icon = ROLE_ICONS[node.role]
  return (
    <div className={`${styles.orgCard} ${size === 'lg' ? styles.orgCardLg : size === 'sm' ? styles.orgCardSm : ''}`}>
      <div className={styles.orgCardHead}>
        <div className={styles.orgCardLeft}>
          {icon && <span className={styles.orgCardIcon}>{icon}</span>}
          <span className={styles.orgCardRole}>{node.role}</span>
        </div>
        <span className={styles.orgCardDot} />
      </div>
      <span className={styles.orgCardTitle}>{node.title}</span>
    </div>
  )
}

export default function Home() {
  const { lang, linkTo } = useTranslation()
  const content = lang === 'fr' ? FR : EN
  usePageMeta(content.meta.title, content.meta.description)

  return (
    <>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.badge}>{content.hero.badge}</span>
              <h1 className={styles.title}>
                {content.hero.title}{' '}
                <span className="gradient-text">{content.hero.highlight}</span>
              </h1>
              <p className={styles.sub}>{content.hero.sub}</p>

              <div className={styles.actions}>
                <a href="mailto:oastephaneamiche@gmail.com" className={styles.primaryBtn}>
                  {content.hero.primary}
                </a>
                <Link to={linkTo('/services')} className={styles.secondaryBtn}>
                  {content.hero.secondary}
                </Link>
                <Link to={linkTo('/docs')} className={styles.tertiaryBtn}>
                  {content.hero.tertiary}
                </Link>
              </div>

              <ul className={styles.proofList}>
                {content.hero.proofs.map((proof) => (
                  <li key={proof} className={styles.proofItem}>
                    <span className={styles.proofDot} />
                    {proof}
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.orgWrap}>
              <div className={styles.orgLevel1}>
                <NodeCard node={content.hero.top} size="lg" />
              </div>

              <div className={styles.orgStem} />

              <div className={styles.orgLevel2}>
                <div className={styles.orgL2Item}>
                  <NodeCard node={content.hero.middle[0]} />
                </div>

                <div className={`${styles.orgL2Item} ${styles.orgL2Center}`}>
                  <NodeCard node={content.hero.middle[1]} />
                  <div className={styles.orgSubStem} />
                  <div className={styles.orgLevel3}>
                    <div className={styles.orgL3Item}>
                      <NodeCard node={content.hero.bottom[0]} size="sm" />
                    </div>
                    <div className={styles.orgL3Item}>
                      <NodeCard node={content.hero.bottom[1]} size="sm" />
                    </div>
                  </div>
                </div>

                <div className={styles.orgL2Item}>
                  <NodeCard node={content.hero.middle[2]} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="section">
        <div className="container">
          <div className={styles.sectionHead}>
            <p className="section-label">{content.problem.label}</p>
            <h2 className={styles.sectionTitle}>{content.problem.title}</h2>
            <p className={styles.sectionSub}>{content.problem.sub}</p>
          </div>

          <div className={styles.problemSplit}>
            <div className={styles.problemDiagram}>
              <ProblemDiagram />
            </div>
            <div className={styles.problemPoints}>
              {content.problem.points.map((pt, i) => (
                <motion.div
                  key={pt.num}
                  className={styles.problemPoint}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.14, duration: 0.5 }}
                >
                  <span className={styles.pointNum}>{pt.num}</span>
                  <div>
                    <h3 className={styles.pointTitle}>{pt.title}</h3>
                    <p className={styles.pointBody}>{pt.body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Teams ── */}
      <section className="section">
        <div className="container">
          <div className={styles.sectionHead}>
            <p className="section-label">{content.teams.label}</p>
            <h2 className={styles.sectionTitle}>{content.teams.title}</h2>
            <p className={styles.sectionSub}>{content.teams.sub}</p>
          </div>

          <div className={styles.teamGrid}>
            {content.teams.items.map((team, i) => (
              <motion.article
                key={team.title}
                className={styles.teamCard}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
              >
                <span className={styles.teamTag}>{team.tag}</span>
                <h3 className={styles.cardTitle}>{team.title}</h3>
                <div className={styles.teamFlow}>
                  {team.roles.map((role, ri) => (
                    <React.Fragment key={role}>
                      <span className={styles.teamFlowStep}>{role}</span>
                      {ri < team.roles.length - 1 && (
                        <span className={styles.teamFlowArr} aria-hidden>›</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="section">
        <div className="container">
          <div className={styles.sectionHead}>
            <p className="section-label">{content.how.label}</p>
            <h2 className={styles.sectionTitle}>{content.how.title}</h2>
          </div>

          <div className={styles.howGrid}>
            {content.how.steps.map((step, i) => (
              <motion.div
                key={step.num}
                className={styles.howStep}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.18, duration: 0.55 }}
              >
                <span className={styles.howNum}>{step.num}</span>
                <h3 className={styles.howTitle}>{step.title}</h3>
                <p className={styles.howBody}>{step.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.ctaSection}>
        <div className="container">
          <div className={styles.ctaCard}>
            <p className={styles.ctaLabel}>{content.cta.label}</p>
            <h2 className={styles.ctaTitle}>{content.cta.title}</h2>
            <p className={styles.ctaSub}>{content.cta.sub}</p>
            <div className={styles.actions}>
              <a href="mailto:oastephaneamiche@gmail.com" className={styles.primaryBtn}>
                {content.cta.primary}
              </a>
              <Link to={linkTo('/services')} className={styles.secondaryBtn}>
                {content.cta.secondary}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
