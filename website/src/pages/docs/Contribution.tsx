import { Link, useLocation } from 'react-router-dom'
import { useDocsMeta } from './useDocsMeta'
import styles from './Contribution.module.css'

type ContributionTrack = {
  title: string
  body: string
}

type RepoCard = {
  name: string
  label: string
  href: string
  issues: string
  discussions?: string
  body: string
  areas: string[]
}

const REPOS: RepoCard[] = [
  {
    name: 'seshat',
    label: 'Runtime Repository',
    href: 'https://github.com/EngineerProjects/seshat',
    issues: 'https://github.com/EngineerProjects/seshat/issues',
    discussions: 'https://github.com/EngineerProjects/seshat/discussions',
    body: 'This is the open-source Go runtime and CLI app foundation: agent loop, tool execution, permissions, sessions, MCP, skills, memory, RAG, providers, SDK primitives, and the core execution model.',
    areas: [
      'CLI app UX, terminal workflows, sessions, and command surfaces',
      'Runtime engine, tools, permissions, agent execution, and orchestration',
      'MCP, skills, memory, retrieval, provider routing, and local model support',
      'Go SDK, gRPC surface, client APIs, and future language bindings',
    ],
  },
  {
    name: 'seshat-ai',
    label: 'Platform Repository',
    href: 'https://github.com/EngineerProjects/seshat-ai',
    issues: 'https://github.com/EngineerProjects/seshat-ai/issues',
    body: 'This is the product and platform layer built on top of the runtime: desktop app, multi-user backend, REST API, workspaces, auth, scheduler, governance, knowledge, and product-facing experiences.',
    areas: [
      'Desktop app, frontend UX, settings flows, and workspace experience',
      'REST API, backend services, multi-user auth, organizations, quotas, and governance',
      'Knowledge base, scheduling, audit, admin, integrations, and product operations',
      'Docs, onboarding, product narrative, deployment workflows, and contributor experience',
    ],
  },
]

const TRACKS: ContributionTrack[] = [
  {
    title: 'Build the best open-source CLI app for agentic work',
    body: 'The CLI app is where developers and vibecoders can use Seshat today, test features early, and push the runtime in real projects instead of shallow demos.',
  },
  {
    title: 'Turn the runtime into organized work, not just better prompting',
    body: 'The point is not another wrapper around a model. The point is a real execution environment with tools, permissions, sessions, MCP, skills, memory, mission continuity, and eventually structured multi-agent coordination.',
  },
  {
    title: 'Create the platform layer for serious teams and specialized domains',
    body: 'The long-term platform is meant to host real work: enterprise automation, research, data science, knowledge systems, education, media generation, design, communication, and any domain experts can help shape.',
  },
]

const DOMAINS: ContributionTrack[] = [
  {
    title: 'Software and product development',
    body: 'Coding, code review, testing, planning, architecture exploration, documentation, and real repo workflows are already core ground for the runtime and CLI app.',
  },
  {
    title: 'Research, knowledge, and NotebookLM-like workflows',
    body: 'Retrieval, synthesis, long-form analysis, knowledge bases, document workflows, study assistants, and deep research surfaces belong naturally inside the same platform core.',
  },
  {
    title: 'Enterprise operations and automation',
    body: 'Organizations need governance, audit, roles, quotas, workspaces, scheduling, SLAs, and integrations. That is why the platform layer matters as much as the raw engine.',
  },
  {
    title: 'Creative production, design, and 3D',
    body: 'Text, image, audio, video, branding, visual design, 3D generation, and creative pipelines can become specialized surfaces powered by the same underlying agent system.',
  },
  {
    title: 'Communication and external channels',
    body: 'Email, social platforms, community workflows, publishing, outreach, support, and voice interaction should eventually connect to the same operational environment instead of living in isolated tools.',
  },
  {
    title: 'Education, finance, legal, and domain-specific expertise',
    body: 'The platform should not be defined only by a central roadmap. Teachers, analysts, accountants, lawyers, operators, researchers, and domain experts can help define what useful agent systems really look like in their field.',
  },
]

const NEEDS: ContributionTrack[] = [
  {
    title: 'Runtime and CLI app contributors',
    body: 'Improve the engine, terminal workflows, performance, providers, local model support, MCP, skills, and agent execution quality.',
  },
  {
    title: 'Desktop and product contributors',
    body: 'Help turn the platform into the main entry point for agentic work with stronger UX, workspace design, domain surfaces, and better product coherence.',
  },
  {
    title: 'SDK contributors',
    body: 'We want Seshat to reach beyond Go. Python SDK, JS or TS SDK, examples, bindings, API ergonomics, and client libraries are high-value ecosystem work.',
  },
  {
    title: 'Docs, examples, and education contributors',
    body: 'A strong open-source project needs better guides, examples, tutorials, architecture explanations, and onboarding paths for technical and non-technical users.',
  },
  {
    title: 'Domain experts',
    body: 'If you understand a specific field well enough to know what an agent system should actually do there, your contribution is strategic, not peripheral.',
  },
  {
    title: 'Design and communication contributors',
    body: 'Naming, information architecture, docs UX, product positioning, onboarding, interface quality, and community communication all shape adoption.',
  },
]

const STEPS = [
  'Choose whether you want to work on the runtime, the CLI app, or the platform layer.',
  'Open the matching repository and scan the code, docs, issues, and open discussions.',
  'Start with something concrete: docs, examples, tests, CLI polish, provider support, bug reports, or UI refinement are all valid contributions.',
  'If you want to influence the long-term direction, bring SDK ideas, domain-specific integrations, MCP workflows, or specialized product surfaces.',
]

export default function Contribution() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'
  useDocsMeta(
    'Contribute to Seshat | Seshat Docs',
    'How to contribute to Seshat across the Go runtime, CLI app, seshat-ai platform, future SDKs, documentation, and domain-specific agent workflows.',
  )

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        <span className={styles.breadSep}>/</span>
        <span className={styles.breadCurrent}>Contribution</span>
      </div>

      <header className={styles.header}>
        <div className={styles.eyebrow}>Open Source</div>
        <h1 className={styles.title}>Contribute to Seshat</h1>
        <p className={styles.sub}>
          Seshat is not just a project to consume. It is an open runtime, a CLI app, and a growing desktop platform that we want to build with the
          community. This page explains the vision, how the ecosystem is split, and where contributors can help whether they care about the Go engine,
          the CLI app, the future Python SDK, the desktop experience, or specialized domain workflows.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.heroCard}>
          <div className={styles.heroCopy}>
            <span className={styles.heroLabel}>The vision</span>
            <h2 className={styles.heroTitle}>Build the infrastructure layer for intellectual and operational work</h2>
            <p className={styles.heroText}>
              The long-term vision for Seshat is not a slightly better assistant and not another orchestration framework. It is an environment where
              AI agents can pursue missions over time, where multiple agent teams can coordinate, where work is observable and governable, and where the
              same core can support everything from coding and research to automation, education, media production, design, 3D, knowledge work, voice,
              and external communication. The runtime executes. The platform organizes. The community helps define what this becomes in practice.
            </p>
          </div>
          <div className={styles.heroActions}>
            <a href="https://github.com/EngineerProjects/seshat" className={styles.primaryLink} target="_blank" rel="noreferrer">Open `seshat`</a>
            <a href="https://github.com/EngineerProjects/seshat-ai" className={styles.secondaryLink} target="_blank" rel="noreferrer">Open `seshat-ai`</a>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.callout}>
          <span className={styles.calloutTitle}>Desktop platform direction</span>
          <p className={styles.calloutText}>
            The desktop is not meant to be a thin shell around chat. The ambition is to make it the main entry point into an OS for agentic services:
            a unified environment where specialized surfaces for development, enterprise operations, automation, education, research, design, communication,
            finance, knowledge work, media, and even 3D generation can live on top of the same runtime foundation.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Why this matters</h2>
        <div className={styles.grid}>
          {TRACKS.map(track => (
            <div key={track.title} className={styles.card}>
              <span className={styles.cardTitle}>{track.title}</span>
              <p className={styles.cardBody}>{track.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>What the platform could unify</h2>
        <p className={styles.sectionIntro}>
          One of the strongest ideas behind Seshat is unification. Today these activities are fragmented across many products, contexts, and memory silos.
          The platform aims to let them converge in one coherent environment instead of scattering work across disconnected tools.
        </p>
        <div className={styles.grid}>
          {DOMAINS.map(domain => (
            <div key={domain.title} className={styles.card}>
              <span className={styles.cardTitle}>{domain.title}</span>
              <p className={styles.cardBody}>{domain.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Two repositories, one ecosystem</h2>
        <p className={styles.sectionIntro}>
          The work is intentionally split so contributors can go exactly where they are most useful. One repository advances the runtime and CLI app.
          The other turns that runtime into the broader desktop and API platform.
        </p>
        <div className={styles.repoGrid}>
          {REPOS.map(repo => (
            <article key={repo.name} className={styles.repoCard}>
              <div className={styles.repoHeader}>
                <div>
                  <span className={styles.repoLabel}>{repo.label}</span>
                  <h3 className={styles.repoName}>{repo.name}</h3>
                </div>
                <a href={repo.href} className={styles.repoLink} target="_blank" rel="noreferrer">GitHub</a>
              </div>
              <p className={styles.repoBody}>{repo.body}</p>
              <ul className={styles.list}>
                {repo.areas.map(area => (
                  <li key={area}><span>{area}</span></li>
                ))}
              </ul>
              <div className={styles.repoActions}>
                <a href={repo.href} className={styles.quickLink} target="_blank" rel="noreferrer">Repository</a>
                <a href={repo.issues} className={styles.quickLink} target="_blank" rel="noreferrer">Issues</a>
                {repo.discussions ? (
                  <a href={repo.discussions} className={styles.quickLink} target="_blank" rel="noreferrer">Discussions</a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>What we want from contributors</h2>
        <p className={styles.sectionIntro}>
          We want more than passive feedback. We want contributors who help define what a strong open-source agent runtime, a serious CLI app,
          and a real platform for agentic services should become over time.
        </p>
        <div className={styles.grid}>
          {NEEDS.map(need => (
            <div key={need.title} className={styles.card}>
              <span className={styles.cardTitle}>{need.title}</span>
              <p className={styles.cardBody}>{need.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.callout}>
          <span className={styles.calloutTitle}>SDK ecosystem</span>
          <p className={styles.calloutText}>
            Today the SDK story starts in Go because the runtime itself is written in Go. That is not the end state. We want a Python SDK,
            a JS or TS SDK, better examples, cleaner client ergonomics, and a broader set of entry points so Seshat can attract contributors from
            multiple ecosystems instead of staying locked inside one language community.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How to get involved</h2>
        <div className={styles.startCard}>
          <ol className={styles.startList}>
            {STEPS.map(step => (
              <li key={step} className={styles.startItem}>{step}</li>
            ))}
          </ol>
          <div className={styles.quickLinks}>
            <a href="https://github.com/EngineerProjects/seshat" className={styles.quickLink} target="_blank" rel="noreferrer">Runtime repo</a>
            <a href="https://github.com/EngineerProjects/seshat/issues" className={styles.quickLink} target="_blank" rel="noreferrer">Runtime issues</a>
            <a href="https://github.com/EngineerProjects/seshat/discussions" className={styles.quickLink} target="_blank" rel="noreferrer">Runtime discussions</a>
            <a href="https://github.com/EngineerProjects/seshat-ai" className={styles.quickLink} target="_blank" rel="noreferrer">Platform repo</a>
            <a href="https://github.com/EngineerProjects/seshat-ai/issues" className={styles.quickLink} target="_blank" rel="noreferrer">Platform issues</a>
            <Link to={`${base}/guides/cli`} className={styles.quickLink}>CLI guide</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
