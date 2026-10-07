import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import { usePageMeta } from '../../hooks/usePageMeta'
import styles from './OpenSource.module.css'

type Project = {
  name: string
  tagline: string
  desc: string
  license: string
  lang: string
  github: string
  docs?: string
  status: 'stable' | 'beta' | 'wip'
  stats: Array<{ value: string; label: string }>
}

type Content = {
  meta: { title: string; description: string }
  badge: string
  title: string
  sub: string
  runtimeLabel: string
  ecosystemLabel: string
  ecosystemTitle: string
  ecosystemSub: string
  communityLabel: string
  communityTitle: string
  communityItems: Array<{ title: string; desc: string; href: string; cta: string }>
  projects: Project[]
  derived: Project[]
  statusLabels: Record<string, string>
}

const GITHUB = 'https://github.com/KPO-Tech/seshat'

const EN: Content = {
  meta: {
    title: 'Open Source | Seshat',
    description: 'Seshat is open source. The Go agent runtime is free to use, fork, and build on under Apache 2.0. Explore the projects, contribute, and join the community.',
  },
  badge: 'Open Source · Apache 2.0 · Written in Go',
  title: 'Open source at the core.',
  sub: 'The runtime is free to use, fork, and extend. Everything here is built in public and designed to be owned by whoever deploys it.',
  runtimeLabel: 'The runtime',
  ecosystemLabel: 'Derived work',
  ecosystemTitle: 'Projects built on seshat.',
  ecosystemSub: 'Open-source tools and integrations that extend the runtime for specific use cases. More coming as the ecosystem grows.',
  communityLabel: 'Community',
  communityTitle: 'Built in public.',
  communityItems: [
    {
      title: 'GitHub Discussions',
      desc: 'Ask questions, propose ideas, share what you are building. The main place for open conversation around the project.',
      href: `${GITHUB}/discussions`,
      cta: 'Join the discussion',
    },
    {
      title: 'Issues',
      desc: 'Bug reports, missing features, unexpected behavior. If something does not work, a clear issue is the fastest path forward.',
      href: `${GITHUB}/issues`,
      cta: 'Open an issue',
    },
    {
      title: 'Contribution guide',
      desc: 'How the project is organized, where to start, what is in scope, and how to get a PR merged.',
      href: '/docs/contribution',
      cta: 'Read the guide',
    },
  ],
  projects: [
    {
      name: 'seshat',
      tagline: 'The agent execution runtime.',
      desc: 'A single Go binary with everything needed to run governed AI agent teams: 15+ LLM providers, 60+ built-in tools, multi-agent coordination, persistent memory, RAG, MCP client, gRPC API, and an embeddable SDK.',
      license: 'Apache 2.0',
      lang: 'Go',
      github: GITHUB,
      docs: '/docs',
      status: 'stable',
      stats: [
        { value: '15+', label: 'LLM providers' },
        { value: '60+', label: 'Built-in tools' },
        { value: '1 binary', label: 'No dependencies' },
        { value: 'gRPC + REST', label: 'API surface' },
      ],
    },
  ],
  derived: [],
  statusLabels: { stable: 'Stable', beta: 'Beta', wip: 'In progress' },
}

const FR: Content = {
  meta: {
    title: 'Open Source | Seshat',
    description: 'Seshat est open source. Le runtime Go d\'agents est libre d\'utilisation, de fork et d\'extension sous Apache 2.0. Explorez les projets, contribuez et rejoignez la communaute.',
  },
  badge: 'Open Source · Apache 2.0 · Ecrit en Go',
  title: 'Open source au coeur.',
  sub: 'Le runtime est libre d\'utilisation, de fork et d\'extension. Tout est construit en public et concu pour etre possede par celui qui le deploie.',
  runtimeLabel: 'Le runtime',
  ecosystemLabel: 'Travaux derives',
  ecosystemTitle: 'Projets construits sur seshat.',
  ecosystemSub: 'Outils et integrations open-source qui etendent le runtime pour des usages specifiques. D\'autres arrivent au fur et a mesure que l\'ecosysteme grandit.',
  communityLabel: 'Communaute',
  communityTitle: 'Construit en public.',
  communityItems: [
    {
      title: 'GitHub Discussions',
      desc: 'Posez des questions, proposez des idees, partagez ce que vous construisez. L\'endroit principal pour les echanges ouverts autour du projet.',
      href: `${GITHUB}/discussions`,
      cta: 'Rejoindre la discussion',
    },
    {
      title: 'Issues',
      desc: 'Rapports de bugs, fonctionnalites manquantes, comportements inattendus. Si quelque chose ne fonctionne pas, une issue claire est le chemin le plus rapide.',
      href: `${GITHUB}/issues`,
      cta: 'Ouvrir une issue',
    },
    {
      title: 'Guide de contribution',
      desc: 'Comment le projet est organise, par ou commencer, ce qui est dans le scope, et comment faire merger une PR.',
      href: '/docs/contribution',
      cta: 'Lire le guide',
    },
  ],
  projects: [
    {
      name: 'seshat',
      tagline: 'Le runtime d\'execution agentique.',
      desc: 'Un seul binaire Go avec tout le necessaire pour faire tourner des equipes d\'agents IA gouvernees : 15+ providers LLM, 60+ outils integres, coordination multi-agents, memoire persistante, RAG, client MCP, API gRPC et SDK embarquable.',
      license: 'Apache 2.0',
      lang: 'Go',
      github: GITHUB,
      docs: '/docs',
      status: 'stable',
      stats: [
        { value: '15+', label: 'Providers LLM' },
        { value: '60+', label: 'Outils integres' },
        { value: '1 binaire', label: 'Sans dependances' },
        { value: 'gRPC + REST', label: 'Surface API' },
      ],
    },
  ],
  derived: [],
  statusLabels: { stable: 'Stable', beta: 'Beta', wip: 'En cours' },
}

/* ─── Runtime graph animation ──────────────────────────── */
const GRAPH_NODES = [
  { id: 'llm',    label: '15+ LLM',  x: 200, y: 52  },
  { id: 'tools',  label: '60+ Tools', x: 322, y: 121 },
  { id: 'memory', label: 'Memory',   x: 322, y: 259 },
  { id: 'grpc',   label: 'gRPC',     x: 200, y: 328 },
  { id: 'mcp',    label: 'MCP',      x: 78,  y: 259 },
  { id: 'sdk',    label: 'SDK',      x: 78,  y: 121 },
]
const CX = 200
const CY = 190

function RuntimeGraph() {
  return (
    <svg
      viewBox="0 0 400 380"
      className={styles.graph}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f7931a" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#e8401e" stopOpacity="0.08" />
        </radialGradient>
        <radialGradient id="centerFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f7931a" />
          <stop offset="100%" stopColor="#e8401e" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="dotGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Outer glow ring around center */}
      <circle cx={CX} cy={CY} r="52" fill="url(#centerGrad)" className={styles.graphGlow} />

      {/* Connection lines — dashed, animated scroll */}
      {GRAPH_NODES.map((node) => (
        <line
          key={`line-${node.id}`}
          x1={CX} y1={CY}
          x2={node.x} y2={node.y}
          className={styles.graphLine}
        />
      ))}

      {/* Traveling dots — outward from center */}
      {GRAPH_NODES.map((node, i) => (
        <circle key={`dot-out-${node.id}`} r="3.5" filter="url(#dotGlow)" className={styles.graphDot}>
          <animateMotion
            dur="2.4s"
            repeatCount="indefinite"
            begin={`${i * 0.4}s`}
            path={`M${CX},${CY} L${node.x},${node.y}`}
          />
          <animate
            attributeName="opacity"
            values="0;0;1;1;0.2;0"
            keyTimes="0;0.05;0.15;0.75;0.9;1"
            dur="2.4s"
            repeatCount="indefinite"
            begin={`${i * 0.4}s`}
          />
        </circle>
      ))}

      {/* Traveling dots — inward toward center (return path) */}
      {GRAPH_NODES.map((node, i) => (
        <circle key={`dot-in-${node.id}`} r="2.5" filter="url(#dotGlow)" className={styles.graphDotReturn}>
          <animateMotion
            dur="2.4s"
            repeatCount="indefinite"
            begin={`${i * 0.4 + 1.2}s`}
            path={`M${node.x},${node.y} L${CX},${CY}`}
          />
          <animate
            attributeName="opacity"
            values="0;0;0.7;0.7;0;0"
            keyTimes="0;0.05;0.15;0.75;0.9;1"
            dur="2.4s"
            repeatCount="indefinite"
            begin={`${i * 0.4 + 1.2}s`}
          />
        </circle>
      ))}

      {/* Outer nodes */}
      {GRAPH_NODES.map((node) => (
        <g key={`node-${node.id}`}>
          <circle cx={node.x} cy={node.y} r="26" className={styles.graphNode} />
          <text
            x={node.x}
            y={node.y}
            className={styles.graphNodeLabel}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {node.label}
          </text>
        </g>
      ))}

      {/* Center node */}
      <circle cx={CX} cy={CY} r="38" fill="url(#centerFill)" className={styles.graphCenter} />
      <text
        x={CX} y={CY - 7}
        className={styles.graphCenterLabel}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        seshat
      </text>
      <text
        x={CX} y={CY + 9}
        className={styles.graphCenterSub}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        runtime
      </text>
    </svg>
  )
}

/* ─── Project card ─────────────────────────────────────── */
function ProjectCard({ project, statusLabels }: { project: Project; statusLabels: Record<string, string> }) {
  return (
    <motion.div
      className={styles.projectCard}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      {/* card top row */}
      <div className={styles.projectTop}>
        <div className={styles.projectMeta}>
          <h3 className={styles.projectName}>{project.name}</h3>
          <div className={styles.projectBadges}>
            <span className={styles.badge2}>{project.license}</span>
            <span className={styles.badge2}>{project.lang}</span>
            <span className={`${styles.badge2} ${styles[`status_${project.status}`]}`}>
              {statusLabels[project.status]}
            </span>
          </div>
        </div>
        <a href={project.github} target="_blank" rel="noreferrer" className={styles.ghLink} aria-label="GitHub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.749 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
        </a>
      </div>

      {/* 2-column body */}
      <div className={styles.projectBody}>
        <div className={styles.projectLeft}>
          <p className={styles.projectTagline}>{project.tagline}</p>
          <p className={styles.projectDesc}>{project.desc}</p>
          <div className={styles.projectLinks}>
            <a href={project.github} target="_blank" rel="noreferrer" className={styles.projectCta}>
              View on GitHub
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </a>
            {project.docs && (
              <Link to={project.docs} className={styles.projectDocsLink}>
                Read the docs →
              </Link>
            )}
          </div>
        </div>

        <div className={styles.projectRight}>
          <div className={styles.projectStats}>
            {project.stats.map((stat) => (
              <div key={stat.label} className={styles.projectStat}>
                <span className={styles.statValue}>{stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Derived project card (compact) ──────────────────── */
function DerivedCard({ project, statusLabels, i }: { project: Project; statusLabels: Record<string, string>; i: number }) {
  return (
    <motion.a
      href={project.github}
      target="_blank"
      rel="noreferrer"
      className={styles.derivedCard}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: i * 0.08, duration: 0.45 }}
    >
      <div className={styles.derivedTop}>
        <span className={styles.derivedName}>{project.name}</span>
        <span className={`${styles.badge2} ${styles[`status_${project.status}`]}`}>
          {statusLabels[project.status]}
        </span>
      </div>
      <p className={styles.derivedDesc}>{project.tagline}</p>
      <div className={styles.derivedMeta}>
        <span className={styles.badge2}>{project.license}</span>
        <span className={styles.badge2}>{project.lang}</span>
      </div>
    </motion.a>
  )
}

/* ─── Main page ─────────────────────────────────────────── */
export default function OpenSourcePage() {
  const { lang, linkTo } = useTranslation()
  const content = lang === 'fr' ? FR : EN
  usePageMeta(content.meta.title, content.meta.description)

  return (
    <>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroGrid}>
            <motion.div
              className={styles.heroContent}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <span className={styles.heroBadge}>{content.badge}</span>
              <h1 className={styles.heroTitle}>{content.title}</h1>
              <p className={styles.heroSub}>{content.sub}</p>
              <div className={styles.heroCtas}>
                <a href={GITHUB} target="_blank" rel="noreferrer" className={styles.btnPrimary}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.749 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                  GitHub
                </a>
                <Link to={linkTo('/docs')} className={styles.btnSecondary}>
                  Documentation →
                </Link>
                <a href={`${GITHUB}/discussions`} target="_blank" rel="noreferrer" className={styles.btnGhost}>
                  Discussions
                </a>
              </div>
            </motion.div>

            <motion.div
              className={styles.heroVisual}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              <RuntimeGraph />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Runtime ── */}
      <section className="section">
        <div className="container">
          <p className="section-label">{content.runtimeLabel}</p>
          {content.projects.map((project) => (
            <ProjectCard key={project.name} project={project} statusLabels={content.statusLabels} />
          ))}
        </div>
      </section>

      {/* ── Derived projects ── */}
      <section className="section">
        <div className="container">
          <p className="section-label">{content.ecosystemLabel}</p>
          <h2 className={styles.sectionTitle}>{content.ecosystemTitle}</h2>
          <p className={styles.sectionSub}>{content.ecosystemSub}</p>

          {content.derived.length > 0 ? (
            <div className={styles.derivedGrid}>
              {content.derived.map((project, i) => (
                <DerivedCard key={project.name} project={project} statusLabels={content.statusLabels} i={i} />
              ))}
            </div>
          ) : (
            <div className={styles.derivedEmpty}>
              <span className={styles.derivedEmptyDot} />
              <p className={styles.derivedEmptyText}>
                {lang === 'fr'
                  ? 'D\'autres projets arrivent. Suivez le repo pour rester informé.'
                  : 'More projects coming. Watch the repo to stay updated.'}
              </p>
              <a href={`${GITHUB}/discussions`} target="_blank" rel="noreferrer" className={styles.derivedEmptyLink}>
                {lang === 'fr' ? 'Proposer un projet →' : 'Propose a project →'}
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ── Community ── */}
      <section className={styles.communitySection}>
        <div className="container">
          <p className="section-label">{content.communityLabel}</p>
          <h2 className={styles.sectionTitle}>{content.communityTitle}</h2>
          <div className={styles.communityGrid}>
            {content.communityItems.map((item, i) => {
              const isExternal = item.href.startsWith('http')
              return (
                <motion.div
                  key={item.title}
                  className={styles.communityCard}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12, duration: 0.48 }}
                >
                  <h3 className={styles.communityCardTitle}>{item.title}</h3>
                  <p className={styles.communityCardDesc}>{item.desc}</p>
                  {isExternal ? (
                    <a href={item.href} target="_blank" rel="noreferrer" className={styles.communityCardCta}>
                      {item.cta}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                    </a>
                  ) : (
                    <Link to={linkTo(item.href)} className={styles.communityCardCta}>
                      {item.cta}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                    </Link>
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
