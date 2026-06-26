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

type HypothesisRow = {
  hypothesis: string
  implication: string
  validation: string
  failureMode: string
}

const ON_PAGE: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'map', label: 'Hypothesis Map' },
  { id: 'table', label: 'Detailed Table' },
  { id: 'signals', label: 'Validation Signals' },
  { id: 'revision', label: 'When To Revise' },
]

const HYPOTHESIS_ROWS: HypothesisRow[] = [
  {
    hypothesis: 'Chat is not enough; AI needs an execution layer.',
    implication: 'The core must own sessions, tools, persistence, permissions, and recovery instead of stopping at prompt-response UX.',
    validation: 'Users consistently choose the runtime for real work that continues over time rather than using it only as a chat shell.',
    failureMode: 'If most value comes from simple chat surfaces and not governed execution, the runtime thesis is overstated.',
  },
  {
    hypothesis: 'The next value jump is organized work, not only stronger solo agents.',
    implication: 'The architecture must leave room for missions, roles, explicit coordination, and durable multi-agent collaboration.',
    validation: 'Sub-agent flows, mailbox teams, and structured mission work produce better real outcomes than isolated agent sessions alone.',
    failureMode: 'If teams mostly want one excellent agent and coordination remains marginal, the organization thesis weakens.',
  },
  {
    hypothesis: 'Human work patterns are the right inspiration for agent coordination.',
    implication: 'Mailboxes, task boards, reports, blockers, and roles matter more than opaque graph magic or hidden global state.',
    validation: 'Explicit coordination surfaces make agent behavior more governable, inspectable, and usable in real organizations.',
    failureMode: 'If invisible orchestration consistently outperforms explicit coordination in practice, this design direction needs revision.',
  },
  {
    hypothesis: 'The fundamental unit is the complete agent, not the disposable sub-agent.',
    implication: 'Identity, history, permissions, memory, and responsibility belong to full sessions first; sub-agents stay an internal execution primitive.',
    validation: 'Persistent agents with roles and histories prove more useful for serious missions than purely ephemeral worker patterns.',
    failureMode: 'If teams overwhelmingly prefer stateless specialist workers and durable identity adds little value, the model is too heavy.',
  },
  {
    hypothesis: 'Shared memory should stay explicit, minimal, and structured.',
    implication: 'Mission memory, reports, and durable decisions should be visible artifacts, not one giant hidden context pool.',
    validation: 'Teams can understand why an agent acted, what it knew, and which decisions were shared across the mission.',
    failureMode: 'If explicit memory boundaries become too costly and hidden shared state is what actually works, the model may be too strict.',
  },
  {
    hypothesis: 'Digital work can be progressively automated when it becomes observable, structured, delegable, and governed.',
    implication: 'The runtime and platform should support automation, scheduled execution, auditable actions, and domain-specific operational surfaces.',
    validation: 'Organizations successfully automate real workflows through Seshat with human supervision and measurable utility.',
    failureMode: 'If most target workflows remain too ambiguous or too governance-heavy to automate reliably, the automation thesis must narrow.',
  },
  {
    hypothesis: 'Education belongs inside the same agentic foundation.',
    implication: 'The system should be able to carry teaching, explanation, exercises, progress continuity, and source-grounded guidance without a separate execution philosophy.',
    validation: 'Learning-oriented agents can reuse the same runtime and still provide credible teaching and progression support.',
    failureMode: 'If education requires a fundamentally different core model, then it should remain an adjacent product rather than a native surface.',
  },
  {
    hypothesis: 'An open, self-hostable, multi-provider foundation is strategically better than a closed single-vendor stack.',
    implication: 'Provider portability, MCP, skills, SDKs, and community extension paths are architectural commitments, not marketing extras.',
    validation: 'Developers, operators, and domain experts extend the system because the foundation is open enough to be worth building on.',
    failureMode: 'If the ecosystem never materializes and users mainly want one tightly coupled vendor stack, openness alone is not enough differentiation.',
  },
]

function HypothesisMap() {
  return (
    <div className={styles.board}>
      <div className={styles.boardGlow} />

      <div className={styles.topGrid}>
        <LearnNodeCard eyebrow="Execution thesis" icon="cpu" tone="runtime" title="AI needs a runtime, not only a chat surface" body="The work system matters: sessions, tools, permissions, memory, recovery, and provider control." />
        <LearnNodeCard eyebrow="Organization thesis" icon="users" tone="risk" title="The hard problem is organized work" body="Missions, roles, explicit coordination, and durable collaboration become the next layer of value." />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hubCard}>
        <div className={styles.cardTop}>
          <span className={styles.eyebrow}>Center Of Gravity</span>
        </div>
        <strong className={styles.nodeTitle}>Seshat is a set of testable bets, not only a feature list</strong>
        <p className={styles.nodeBody}>
          The project makes claims about how agent systems should be built, governed, extended, and eventually turned into environments for work, automation, and learning. Making those bets explicit is healthier than hiding them behind generic product language.
        </p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.branchGrid}>
        <LearnNodeCard eyebrow="Agent model" icon="branch" tone="host" title="Complete agents over disposable workers" body="Sub-agents matter, but they are not the core organizational unit." />
        <LearnNodeCard eyebrow="Memory model" icon="database" tone="runtime" title="Structured shared memory" body="Explicit mission memory should beat opaque pooled context for serious coordination." />
        <LearnNodeCard eyebrow="Ecosystem model" icon="book" tone="risk" title="Open foundation" body="Community, multi-provider portability, skills, MCP, and self-hosting are part of the architectural thesis." />
      </div>
    </div>
  )
}

function HypothesisTable({ rows }: { rows: HypothesisRow[] }) {
  return (
    <DocTable variant="balanced">
      <thead>
        <tr>
          <th>Hypothesis</th>
          <th>Architectural Implication</th>
          <th>What Would Validate It</th>
          <th>What Would Weaken It</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.hypothesis}>
            <td className={styles.codeCell}>{row.hypothesis}</td>
            <td>{row.implication}</td>
            <td className={styles.noteCell}>{row.validation}</td>
            <td className={styles.noteCell}>{row.failureMode}</td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  )
}

export default function LearnTechnicalHypotheses() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/learn">Learn</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Technical Hypotheses</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Technical Hypotheses</h1>
        <p className={articleStyles.sub}>
          Seshat is built on a set of explicit technical and product hypotheses about what agent systems need in order to become useful work systems. These hypotheses shape the runtime architecture, the platform layering, the team model, the safety posture, and even the open-source strategy. They should be made visible, because visible bets can be tested.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section className={styles.anchorSection} id="overview">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Overview</h2>
              <p className={styles.sectionLead}>
                A mature architecture is not only a pile of features. It is a coherent answer to a set of beliefs about the world. If those beliefs stay hidden, contributors do not know what the project is optimizing for. If they are explicit, the community can help validate, challenge, refine, or replace them.
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="map">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Hypothesis Map</h2>
              <p className={styles.sectionLead}>
                These hypotheses fall into four broad families: execution, organization, memory and governance, and ecosystem direction. Together they explain why Seshat looks the way it does today and why the roadmap stages are ordered the way they are.
              </p>
              <HypothesisMap />
            </div>
          </section>

          <section className={styles.anchorSection} id="table">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Detailed Table</h2>
              <p className={styles.sectionLead}>
                The table below treats each thesis as something that must eventually earn its place through real usage, not only through architectural elegance.
              </p>
              <HypothesisTable rows={HYPOTHESIS_ROWS} />
            </div>
          </section>

          <section className={styles.anchorSection} id="signals">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>What Good Validation Looks Like</h2>
              <div className={styles.dualGrid}>
                <LearnNodeCard eyebrow="Runtime evidence" icon="check" tone="runtime" title="Daily serious use" body="Developers, operators, and products rely on the runtime because the execution contract is more trustworthy than stitching their own stack together." />
                <LearnNodeCard eyebrow="Team evidence" icon="mail" tone="risk" title="Explicit coordination beats hidden magic" body="Durable teams, reports, mission memory, and mailbox coordination prove easier to govern and observe than opaque multi-agent abstractions." />
                <LearnNodeCard eyebrow="Automation evidence" icon="clock" tone="host" title="Real workflows become governable" body="Organizations use Seshat to automate repeatable digital work while keeping approval, traceability, and boundary control." />
                <LearnNodeCard eyebrow="Community evidence" icon="book" tone="system" title="The ecosystem builds on the core" body="Skills, MCP integrations, SDK usage, and domain-specific experiments grow because the foundation is open enough and stable enough to deserve extension." />
              </div>
            </div>
          </section>

          <section className={styles.anchorSection} id="revision">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>When The Project Should Revise Its Bets</h2>
              <p className={styles.sectionLead}>
                Explicit hypotheses are useful only if they can be challenged. If the market, users, or architecture consistently show that a thesis is wrong, the project should update the model rather than defend it as ideology.
              </p>
              <ul className={articleStyles.list}>
                <li>If most users only want a strong solo agent, Level 3 should stay narrow and pragmatic rather than becoming a forced grand theory.</li>
                <li>If explicit shared memory boundaries prove too rigid, the team runtime should evolve them instead of treating them as doctrine.</li>
                <li>If open extensibility fails to create a real ecosystem, the product still needs to justify the added complexity with direct user value.</li>
                <li>If certain verticals like education need genuinely different execution models, they should branch at the product layer without corrupting the runtime core.</li>
              </ul>
              <p className={articleStyles.p}>
                For the wider product narrative behind these hypotheses, continue with{' '}
                <Link className={articleStyles.link} to="/docs/concepts/what-is-seshat" state={{ from: location.pathname }}>
                  What is Seshat?
                </Link>
                . For the execution-side argument, continue with{' '}
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
