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

type BoundaryRow = {
  layer: string
  primaryJob: string
  usuallyMissing: string
}

type RuntimeRow = {
  concern: string
  runtimeOwns: string
  whyItMatters: string
}

const ON_PAGE: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'ladder', label: 'System Ladder' },
  { id: 'responsibilities', label: 'Runtime Responsibilities' },
  { id: 'why-it-matters', label: 'Why It Matters' },
  { id: 'seshat-fit', label: 'Where Seshat Fits' },
]

const BOUNDARY_ROWS: BoundaryRow[] = [
  {
    layer: 'Model',
    primaryJob: 'Generate tokens from context and return outputs.',
    usuallyMissing: 'Sessions, tools, permissions, persistence, governance, recovery, product integration.',
  },
  {
    layer: 'Chat interface',
    primaryJob: 'Provide a user-facing conversation surface.',
    usuallyMissing: 'Programmable lifecycle ownership, explicit tool contracts, embedding boundary, deployment control.',
  },
  {
    layer: 'Framework',
    primaryJob: 'Give developers abstractions for composing prompts, tools, graphs, and flows.',
    usuallyMissing: 'A single deployable execution boundary that already owns sessions, permissioning, recovery, routing, and multi-surface behavior.',
  },
  {
    layer: 'Agent runtime',
    primaryJob: 'Own the actual execution of agent sessions over time.',
    usuallyMissing: 'Often still needs a product layer for users, workspaces, billing, audit, or vertical UX.',
  },
  {
    layer: 'Platform / product',
    primaryJob: 'Turn the runtime into a governed environment for real users and organizations.',
    usuallyMissing: 'Should not have to reinvent the agent loop, tool system, or provider routing underneath.',
  },
]

const RUNTIME_ROWS: RuntimeRow[] = [
  {
    concern: 'Session lifecycle',
    runtimeOwns: 'Create, resume, persist, compact, checkpoint, and close sessions.',
    whyItMatters: 'Without this, every host surface rebuilds state handling differently and long-running work becomes brittle.',
  },
  {
    concern: 'Agent loop',
    runtimeOwns: 'Run the model-call → tool-use → result-injection loop, including recovery and continuation.',
    whyItMatters: 'This is the difference between a text wrapper and an execution system that can keep working toward a goal.',
  },
  {
    concern: 'Tool surface',
    runtimeOwns: 'Register tools, expose schemas, call them, collect outputs, and feed those outputs back into the loop.',
    whyItMatters: 'Tool execution is the concrete bridge between language and action.',
  },
  {
    concern: 'Permissions and safety',
    runtimeOwns: 'Decide which actions require approval, which are blocked, and which can proceed automatically.',
    whyItMatters: 'Real agent systems touch files, shells, browsers, and external APIs. Safety cannot stay implicit.',
  },
  {
    concern: 'Provider routing',
    runtimeOwns: 'Select models, fail over across providers, stream outputs, and normalize transport differences.',
    whyItMatters: 'If every host implements provider logic differently, portability and cost control disappear.',
  },
  {
    concern: 'Memory and retrieval',
    runtimeOwns: 'Inject working context, long-term memory, retrieved knowledge, and compacted history at the right moment.',
    whyItMatters: 'Memory is not just storage. It is execution-time context shaping.',
  },
  {
    concern: 'Events and observability',
    runtimeOwns: 'Emit structured runtime events, streaming chunks, tool progress, and lifecycle hooks.',
    whyItMatters: 'Without a standard event surface, UIs, APIs, operators, and traces all fragment.',
  },
]

function RuntimeLadderDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.stackGrid}>
        <LearnNodeCard eyebrow="Layer 1" icon="spark" tone="system" title="Model" body="Token generation, reasoning, and tool-calling intent. Powerful, but not a deployable work system by itself." />
        <LearnNodeCard eyebrow="Layer 2" icon="chat" tone="host" title="Chat UI" body="A conversational surface. Useful for interaction, but usually thin on lifecycle ownership and programmatic control." />
        <LearnNodeCard eyebrow="Layer 3" icon="branch" tone="host" title="Framework" body="Composition primitives for developers: graphs, chains, handoffs, workflows, guards, and integrations." />
        <LearnNodeCard eyebrow="Layer 4" icon="cpu" tone="runtime" title="Agent Runtime" body="The execution boundary that owns sessions, tools, permissions, memory, providers, events, and loop behavior." />
        <LearnNodeCard eyebrow="Layer 5" icon="layers" tone="risk" title="Platform" body="Workspaces, users, governance, audit, quotas, desktop/web/API surfaces, and domain-specific applications." />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <span className={styles.eyebrow}>Core Distinction</span>
        </div>
        <strong className={styles.nodeTitle}>A runtime is the layer that makes agent behavior operationally repeatable</strong>
        <p className={styles.nodeBody}>
          Frameworks help you build agent systems. A runtime owns the live execution contract those systems depend on. Platforms then turn that runtime into a product or operating environment.
        </p>
      </div>
    </div>
  )
}

function BoundaryTable({ rows }: { rows: BoundaryRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Layer</th>
          <th>Primary Job</th>
          <th>What It Usually Does Not Own</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.layer}>
            <td className={styles.codeCell}>{row.layer}</td>
            <td>{row.primaryJob}</td>
            <td className={styles.noteCell}>{row.usuallyMissing}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

function RuntimeTable({ rows }: { rows: RuntimeRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Concern</th>
          <th>What The Runtime Owns</th>
          <th>Why It Matters</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.concern}>
            <td className={styles.codeCell}>{row.concern}</td>
            <td>{row.runtimeOwns}</td>
            <td className={styles.noteCell}>{row.whyItMatters}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function LearnAgentRuntime() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/learn">Learn</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>What is an Agent Runtime?</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>What is an Agent Runtime?</h1>
        <p className={articleStyles.sub}>
          An agent runtime is the execution layer that turns a model plus tools into a repeatable work system. It owns sessions, the loop, permissions, provider routing, memory injection, observability, and the boundaries that let many surfaces use the same agent behavior without each surface re-implementing it differently.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section className={styles.anchorSection} id="overview">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Overview</h2>
              <p className={styles.sectionLead}>
                The phrase agent runtime matters because the industry often mixes together models, chat products, orchestration frameworks, SDKs, and full execution systems as if they were the same thing. They are not. The distinction becomes important the moment you need durability, governance, self-hosting, multi-provider routing, or more than one surface on top of the same agent behavior.
              </p>
              <div className={articleStyles.callout}>
                <div className={articleStyles.calloutTitle}>Practical Test</div>
                <p className={articleStyles.calloutText}>
                  If a system cannot consistently own session state, tool execution, permissions, memory injection, and provider behavior across CLI, SDK, API, or product surfaces, it is probably not the runtime layer yet. It is something above or below it.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.anchorSection} id="ladder">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>The System Ladder</h2>
              <p className={styles.sectionLead}>
                Thinking in layers prevents category mistakes. A model is not a runtime. A framework is not a platform. A platform should not have to rebuild what a runtime already knows how to do.
              </p>
              <RuntimeLadderDiagram />
              <BoundaryTable rows={BOUNDARY_ROWS} />
            </div>
          </section>

          <section className={styles.anchorSection} id="responsibilities">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>What a Real Runtime Actually Owns</h2>
              <p className={styles.sectionLead}>
                The runtime is where agent behavior stops being an application pattern and becomes a stable operational contract. These responsibilities are the ones host surfaces should inherit rather than re-creating themselves.
              </p>
              <RuntimeTable rows={RUNTIME_ROWS} />
            </div>
          </section>

          <section className={styles.anchorSection} id="why-it-matters">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Why The Distinction Matters</h2>
              <div className={styles.metricGrid}>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>For builders</div>
                  <div className={styles.metricValue}>One contract</div>
                  <p className={styles.metricText}>You integrate one execution system instead of stitching different loop, tool, and memory semantics across every product surface.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>For operators</div>
                  <div className={styles.metricValue}>One behavior</div>
                  <p className={styles.metricText}>Permissions, retries, provider fallback, and trace events stay consistent whether the agent is used from CLI, SDK, gRPC, or a desktop product.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>For teams</div>
                  <div className={styles.metricValue}>Less reinvention</div>
                  <p className={styles.metricText}>You spend less time rebuilding plumbing and more time shaping actual domain behavior, workflows, and user experience.</p>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricLabel}>For the ecosystem</div>
                  <div className={styles.metricValue}>Cleaner edges</div>
                  <p className={styles.metricText}>MCP servers, skills, SDKs, and external products can attach to a stable core instead of coupling themselves to ad hoc prompt loops.</p>
                </div>
              </div>
              <p className={articleStyles.p}>
                This is also why Seshat does not describe itself as only a framework. Frameworks remain useful and complementary, but the runtime question is deeper: who owns the live system once the agent is actually working against files, shells, browsers, memory, and external tools?
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="seshat-fit">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Where Seshat Fits</h2>
              <p className={styles.sectionLead}>
                In Seshat, the runtime is <span className={articleStyles.inlineCode}>seshat</span>. The wider product environment is <span className={articleStyles.inlineCode}>seshat-ai</span>. That boundary is intentional. The runtime should stay deployable and embeddable on its own. The platform should then add users, workspaces, governance, knowledge systems, automation, and future domain surfaces without contaminating the core loop.
              </p>
              <div className={styles.flowRow}>
                <LearnNodeCard eyebrow="Execution core" icon="cpu" tone="runtime" title="seshat runtime" body="Sessions, tools, permissions, provider routing, skills, MCP, memory, compaction, streaming, sub-agents, and the Go SDK." />
                <div className={styles.flowConnector}><span /></div>
                <LearnNodeCard eyebrow="Product layer" icon="layers" tone="risk" title="seshat-ai platform" body="Desktop, web and API surfaces, users, organizations, workspaces, quotas, auth, audit, scheduling, RAG corpora, and future multi-app workspace behavior." />
                <div className={styles.flowConnector}><span /></div>
                <LearnNodeCard eyebrow="Outcome" icon="check" tone="host" title="One runtime, many surfaces" body="The same execution semantics can serve developers, operators, enterprises, educators, and future agent teams without rewriting the core each time." />
              </div>
              <p className={articleStyles.p}>
                For the architecture view, continue with{' '}
                <Link className={articleStyles.link} to="/docs/concepts/mono-run" state={{ from: location.pathname }}>
                  Mono-Run Architecture
                </Link>
                . For the vision-level explanation, continue with{' '}
                <Link className={articleStyles.link} to="/docs/concepts/what-is-seshat" state={{ from: location.pathname }}>
                  What is Seshat?
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
