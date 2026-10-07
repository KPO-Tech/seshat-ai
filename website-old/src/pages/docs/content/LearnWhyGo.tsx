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

type FitRow = {
  requirement: string
  goFit: string
  effectOnRuntime: string
}

type TradeoffRow = {
  area: string
  whyGoHelps: string
  honestCost: string
}

const ON_PAGE: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'workload', label: 'Runtime Workload' },
  { id: 'benefits', label: 'Why Go Fits' },
  { id: 'tradeoffs', label: 'Tradeoffs' },
  { id: 'edges', label: 'Polyglot Edges' },
]

const FIT_ROWS: FitRow[] = [
  {
    requirement: 'Many concurrent activities',
    goFit: 'Goroutines and channels make high-concurrency I/O a language-native pattern rather than a heavy framework concern.',
    effectOnRuntime: 'Streaming, tool execution, browser work, MCP connections, background tasks, and event pipelines can coexist inside one runtime without contorting the host architecture.',
  },
  {
    requirement: 'Fast deployable infrastructure',
    goFit: 'The standard toolchain builds native executables directly with simple build and install commands.',
    effectOnRuntime: 'CLI, gRPC, API, and embedded workers are easier to ship, self-host, and standardize operationally.',
  },
  {
    requirement: 'Long-lived systems code',
    goFit: 'Go was designed with maintainability, compilation speed, readability, and concurrency in mind for server programs.',
    effectOnRuntime: 'The runtime can stay understandable even as provider routing, tool surfaces, persistence, and permissions grow.',
  },
  {
    requirement: 'Strong standard library',
    goFit: 'Networking, HTTP, JSON, context propagation, concurrency primitives, and profiling are built into the ecosystem baseline.',
    effectOnRuntime: 'More of the infrastructure stays inside the core language and fewer critical foundations depend on deep framework stacks.',
  },
  {
    requirement: 'Cross-surface consistency',
    goFit: 'One compiled runtime can back CLI, SDK, gRPC, desktop backend, and service processes without language splits inside the core.',
    effectOnRuntime: 'The same execution semantics can travel across surfaces instead of drifting between implementations.',
  },
]

const TRADEOFF_ROWS: TradeoffRow[] = [
  {
    area: 'Model experimentation',
    whyGoHelps: 'Go is excellent once behavior needs to become infrastructure.',
    honestCost: 'Python still has the richer ecosystem for rapid ML research, notebook exploration, and many model-adjacent libraries.',
  },
  {
    area: 'Desktop and frontend UX',
    whyGoHelps: 'A light Go core is a strong backend or local engine.',
    honestCost: 'You still want React, Electron, Tauri, or another UI stack at the edge rather than forcing the runtime to become the UI language.',
  },
  {
    area: 'Library expectations',
    whyGoHelps: 'A runtime can be consumed via SDK or gRPC rather than rewritten in every host language.',
    honestCost: 'Some developers expect a Python or JS package first. Seshat has to compensate with clearer API boundaries and generated clients.',
  },
  {
    area: 'Talent familiarity',
    whyGoHelps: 'Go keeps the runtime smaller and more operationally coherent.',
    honestCost: 'The average AI engineer still reaches for Python first, so docs and examples have to explain the architectural reason for the choice clearly.',
  },
]

function GoFitDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.topGrid}>
        <LearnNodeCard eyebrow="Reality" icon="network" tone="host" title="Agent runtimes are infrastructure workloads" body="They stream, wait on tools, manage state, persist sessions, emit events, recover from errors, and coordinate many concurrent operations." />
        <LearnNodeCard eyebrow="Language fit" icon="cpu" tone="runtime" title="Go was designed around concurrency and maintainable systems software" body="That makes it a good fit for a runtime boundary that must stay deployable, understandable, and production-friendly over time." />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <span className={styles.eyebrow}>Decision Principle</span>
        </div>
        <strong className={styles.nodeTitle}>Choose the language for the core system you are building, not for the loudest trend around AI tooling</strong>
        <p className={styles.nodeBody}>
          Seshat is Go-first at the runtime layer because it behaves more like execution infrastructure than like a research notebook or a thin prompt wrapper.
        </p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.branchGrid}>
        <LearnNodeCard eyebrow="Concurrency" icon="bolt" tone="runtime" title="Cheap parallel work" body="Many sessions, many tool calls, many streams, one coherent runtime process." />
        <LearnNodeCard eyebrow="Deployment" icon="package" tone="host" title="Simple shipping" body="Native binaries, straightforward containerization, fewer environment problems, easier self-hosting." />
        <LearnNodeCard eyebrow="Longevity" icon="code" tone="risk" title="Maintainable core" body="A smaller language surface and stronger operational posture help when the system has to live for years, not demos." />
      </div>
    </div>
  )
}

function FitTable({ rows }: { rows: FitRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Runtime Requirement</th>
          <th>Why Go Fits</th>
          <th>Effect On Seshat</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.requirement}>
            <td className={styles.codeCell}>{row.requirement}</td>
            <td>{row.goFit}</td>
            <td className={styles.noteCell}>{row.effectOnRuntime}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function TradeoffTable({ rows }: { rows: TradeoffRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Area</th>
          <th>Why Go Helps</th>
          <th>Honest Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.area}>
            <td className={styles.codeCell}>{row.area}</td>
            <td>{row.whyGoHelps}</td>
            <td className={styles.noteCell}>{row.honestCost}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function LearnWhyGo() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/learn">Learn</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Why Go for AI Agents?</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Why Go for AI Agents?</h1>
        <p className={articleStyles.sub}>
          Seshat is Go-first because the core problem is not just prompt composition. It is building a deployable, observable, concurrent, long-lived execution system for agents. Go is not chosen as an anti-Python statement. It is chosen because the runtime behaves like infrastructure, and infrastructure has different needs from experimentation.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section className={styles.anchorSection} id="overview">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Overview</h2>
              <p className={styles.sectionLead}>
                The industry often assumes AI systems should be built in Python by default. That is a sensible default for research, evaluation notebooks, and fast model experimentation. It is not automatically the best default for the runtime that has to own sessions, tools, browser control, permissioning, persistence, streaming, and multi-surface deployment.
              </p>
              <div className={articleStyles.callout}>
                <div className={articleStyles.calloutTitle}>Important Framing</div>
                <p className={articleStyles.calloutText}>
                  The argument is not Python versus Go in the abstract. The question is: what language best fits the execution layer you want to standardize, deploy, self-host, and keep coherent across CLI, SDK, gRPC, and product surfaces?
                </p>
              </div>
            </div>
          </section>

          <section className={styles.anchorSection} id="workload">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>What Kind Of Workload An Agent Runtime Actually Is</h2>
              <p className={styles.sectionLead}>
                A serious agent runtime is part application server, part systems process, part orchestrator, part integration layer. It juggles model I/O, streaming, MCP clients, filesystems, shells, background tasks, memory systems, provider failover, and live permission boundaries.
              </p>
              <GoFitDiagram />
            </div>
          </section>

          <section className={styles.anchorSection} id="benefits">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Why Go Fits This Layer Well</h2>
              <p className={styles.sectionLead}>
                Go’s design goals line up unusually well with runtime engineering: concurrency, maintainability, fast compilation, readable systems code, and simple operational packaging. Those traits matter much more once agents become infrastructure instead of demos.
              </p>
              <FitTable rows={FIT_ROWS} />
              <div className={styles.metricGrid}>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Operational shape</div>
                  <div className={styles.metricValue}>One binary</div>
                  <p className={styles.metricText}>Useful when the CLI app, local backend, or self-hosted service should be easy to distribute and upgrade.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Execution shape</div>
                  <div className={styles.metricValue}>Many goroutines</div>
                  <p className={styles.metricText}>Useful when streams, tools, hooks, async tasks, and event queues all need to stay alive concurrently without deep runtime ceremony.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Codebase shape</div>
                  <div className={styles.metricValue}>Small surface</div>
                  <p className={styles.metricText}>Helpful when the project has to remain explainable to contributors while spanning providers, transport layers, memory, and tooling.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>Ecosystem shape</div>
                  <div className={styles.metricValue}>Polyglot edges</div>
                  <p className={styles.metricText}>Go can own the core while gRPC and APIs expose the runtime cleanly to Python, JS, or other host environments.</p>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.anchorSection} id="tradeoffs">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Tradeoffs And Non-Ideological Limits</h2>
              <p className={styles.sectionLead}>
                A Go-first runtime is not a claim that Go wins every layer. It is a scope decision. Seshat accepts the costs that come with that decision and then compensates at the boundaries through SDK and transport design.
              </p>
              <TradeoffTable rows={TRADEOFF_ROWS} />
            </div>
          </section>

          <section className={styles.anchorSection} id="edges">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Why The Edges Stay Polyglot</h2>
              <p className={styles.sectionLead}>
                The strongest version of this architecture is not “everything must be in Go.” It is “the runtime core is in Go, and the edges stay open.” That is why Seshat exposes a Go SDK, gRPC, and product surfaces above the same execution core.
              </p>
              <div className={styles.dualGrid}>
                <LearnNodeCard eyebrow="Core" icon="cpu" tone="runtime" title="Go owns the runtime" body="Sessions, tool execution, permissions, provider routing, compaction, and persistence stay in one language and one operational model." />
                <LearnNodeCard eyebrow="Edges" icon="route" tone="host" title="Other languages consume the runtime" body="Python, JavaScript, automation systems, and product backends should talk to the runtime through SDKs or transport contracts instead of re-implementing it." />
              </div>
              <p className={articleStyles.p}>
                If you want the architectural rationale for that boundary, continue with{' '}
                <Link className={articleStyles.link} to="/docs/sdk/grpc-api" state={{ from: location.pathname }}>
                  gRPC API
                </Link>
                {' '}and{' '}
                <Link className={articleStyles.link} to="/docs/learn/agent-runtime" state={{ from: location.pathname }}>
                  What is an Agent Runtime?
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
