import { Link, useLocation } from 'react-router-dom'
import DocOnPageNav from './DocOnPageNav'
import DocTable from './DocTable'
import articleStyles from './DocArticle.module.css'
import styles from './LearnArticle.module.css'
import { LearnNodeCard } from './LearnShared'

type NavItem = {
  id: string
  label: string
}

type FailureRow = {
  split: string
  whatBreaks: string
  whyMonoRunHelps: string
}

const ON_PAGE: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'meaning', label: 'What Mono-Run Means' },
  { id: 'benefits', label: 'Why It Helps' },
  { id: 'failure-modes', label: 'Failure Modes' },
  { id: 'expansion', label: 'How It Expands' },
]

const FAILURE_ROWS: FailureRow[] = [
  {
    split: 'Prompt system separate from execution loop',
    whatBreaks: 'Prompts drift away from the real tool surface, session state, and runtime mode decisions.',
    whyMonoRunHelps: 'Prompt assembly happens close to the session that will actually execute, so tools, memory, permissions, and stage overlays stay aligned.',
  },
  {
    split: 'Tool daemon separate from runtime semantics',
    whatBreaks: 'Tool execution may become detached from session-level permissions, eventing, and recovery logic.',
    whyMonoRunHelps: 'The runtime can treat tools as first-class parts of the same execution contract rather than as blind remote side effects.',
  },
  {
    split: 'Provider routing as host-side glue',
    whatBreaks: 'Fallbacks, retries, streaming, and provider normalization differ by surface and become impossible to reason about globally.',
    whyMonoRunHelps: 'One provider layer serves CLI, SDK, gRPC, and platform surfaces consistently.',
  },
  {
    split: 'Memory bolted on after the fact',
    whatBreaks: 'Retrieval and compaction become optional decorations instead of execution-time behavior with clear boundaries.',
    whyMonoRunHelps: 'Memory, retrieval, prompt shaping, and compaction remain part of the same turn lifecycle.',
  },
  {
    split: 'Surface-specific event systems',
    whatBreaks: 'Desktop, CLI, API, and SDK each invent incompatible progress and trace semantics.',
    whyMonoRunHelps: 'A shared runtime event stream can feed every surface from one source of truth.',
  },
]

function MonoRunBoard() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.topGrid}>
        <LearnNodeCard eyebrow="Entry surfaces" icon="server" tone="host" title="CLI, SDK, gRPC, desktop backend, API" body="Different ways to reach the system, but not different implementations of the core agent behavior." />
        <LearnNodeCard eyebrow="Single owner" icon="cpu" tone="runtime" title="One runtime boundary" body="The same session model, tool layer, provider routing, memory rules, permission logic, and eventing surface serve all of them." />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <span className={styles.eyebrow}>Mono-Run Principle</span>
        </div>
        <strong className={styles.nodeTitle}>One runtime owns the whole turn lifecycle</strong>
        <p className={styles.nodeBody}>
          Session creation, prompt assembly, model calls, tool execution, permission checks, memory injection, compaction, and event emission remain inside one coherent execution owner instead of being scattered across thin wrappers.
        </p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.branchGrid}>
        <LearnNodeCard eyebrow="Subsystem" icon="tools" tone="runtime" title="Tools and permissions stay close" body="Action surfaces remain governed by the same session and mode semantics that requested them." />
        <LearnNodeCard eyebrow="Subsystem" icon="database" tone="runtime" title="Memory and persistence stay close" body="What gets stored, retrieved, compacted, or resumed stays tied to the same session lifecycle." />
        <LearnNodeCard eyebrow="Subsystem" icon="network" tone="risk" title="Providers and events stay close" body="Fallbacks, streaming, runtime events, and observability remain uniform across surfaces." />
      </div>
    </div>
  )
}

function FailureTable({ rows }: { rows: FailureRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Split Too Early</th>
          <th>What Tends To Break</th>
          <th>Why Mono-Run Helps</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.split}>
            <td className={styles.codeCell}>{row.split}</td>
            <td>{row.whatBreaks}</td>
            <td className={styles.noteCell}>{row.whyMonoRunHelps}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function LearnMonoRunExplained() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/learn">Learn</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Mono-Run Explained</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Mono-Run Explained</h1>
        <p className={articleStyles.sub}>
          Mono-run means the runtime owns the whole agent turn lifecycle inside one coherent execution model. It is not merely a single binary story. It is an architectural rule: do not split sessions, prompts, tools, permissions, providers, memory, and runtime events into separate competing owners before you absolutely have to.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section className={styles.anchorSection} id="overview">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Overview</h2>
              <p className={styles.sectionLead}>
                The term mono-run can sound like branding if it is not explained precisely. In Seshat it means something concrete: one runtime boundary should own the live work of the agent turn end to end. Different surfaces can call into that runtime, but they should not each reinterpret what a session, tool, permission, provider fallback, or memory boundary means.
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="meaning">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>What Mono-Run Actually Means</h2>
              <p className={styles.sectionLead}>
                Mono-run does not mean that everything forever lives in one file, one package, or one process topology. It means there is one authoritative execution model. Internal packages can still be modular. External surfaces can still be multiple. What should not multiply is the meaning of the runtime contract.
              </p>
              <MonoRunBoard />
            </div>
          </section>

          <section className={styles.anchorSection} id="benefits">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Why This Helps In Practice</h2>
              <div className={styles.metricGrid}>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Consistency</div>
                  <div className={styles.metricValue}>One session model</div>
                  <p className={styles.metricText}>Resume, compaction, metadata, eventing, and permission semantics stay stable across entry surfaces.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Safety</div>
                  <div className={styles.metricValue}>One action boundary</div>
                  <p className={styles.metricText}>Tools do not escape the same permission engine and hook system that govern the loop.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Portability</div>
                  <div className={styles.metricValue}>One provider layer</div>
                  <p className={styles.metricText}>Fallback routing, streaming, auth handoff, and normalized outputs do not splinter by host application.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Extensibility</div>
                  <div className={styles.metricValue}>One plugin posture</div>
                  <p className={styles.metricText}>Skills, MCP, custom tools, and future multi-agent layers attach to the same core instead of targeting many incompatible wrappers.</p>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.anchorSection} id="failure-modes">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>What Breaks When You Split Too Early</h2>
              <p className={styles.sectionLead}>
                Many agent systems become hard to trust because the ownership model is blurry. The host owns some memory semantics, the framework owns some orchestration semantics, tools live elsewhere, and provider behavior differs by surface. Mono-run is a way to resist that fragmentation.
              </p>
              <FailureTable rows={FAILURE_ROWS} />
            </div>
          </section>

          <section className={styles.anchorSection} id="expansion">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>How Mono-Run Expands Without Collapsing</h2>
              <p className={styles.sectionLead}>
                Mono-run is not anti-platform. It is what makes platform growth sane. Seshat can still expose a CLI app, a Go SDK, gRPC, a multi-user backend, and a desktop environment because those surfaces all sit above the same runtime contract instead of replacing it.
              </p>
              <div className={styles.flowRow}>
                <LearnNodeCard eyebrow="Today" icon="server" tone="host" title="One runtime, many surfaces" body="CLI, SDK, gRPC, and platform all consume the same engine rather than forking it." />
                <div className={styles.flowConnector}><span /></div>
                <LearnNodeCard eyebrow="Next" icon="users" tone="risk" title="Durable teams and automation" body="Higher layers like multi-agent teams, schedules, and workspaces can emerge above the runtime once the core stays stable enough." />
                <div className={styles.flowConnector}><span /></div>
                <LearnNodeCard eyebrow="Rule" icon="check" tone="runtime" title="Split at the edges, not in the heart" body="Use gRPC, APIs, and product layers to widen access. Do not duplicate the execution semantics at every edge." />
              </div>
              <p className={articleStyles.p}>
                For the architectural map, continue with{' '}
                <Link className={articleStyles.link} to="/docs/concepts/mono-run" state={{ from: location.pathname }}>
                  Mono-Run Architecture
                </Link>
                . For the engineering rationale behind the language choice, continue with{' '}
                <Link className={articleStyles.link} to="/docs/learn/why-go" state={{ from: location.pathname }}>
                  Why Go for AI Agents?
                </Link>
                .
              </p>
            </div>
          </section>
        </div>

        <aside className={styles.aside}>
          <DocOnPageNav items={ON_PAGE} />
        </aside>
      </div>
    </article>
  )
}
