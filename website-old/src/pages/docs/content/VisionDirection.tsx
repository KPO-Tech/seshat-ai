import { Link, useLocation } from 'react-router-dom'
import DocOnPageNav from './DocOnPageNav'
import articleStyles from './DocArticle.module.css'
import styles from './LearnArticle.module.css'
import { LearnNodeCard } from './LearnShared'

const ON_PAGE = [
  { id: 'overview', label: 'Overview' },
  { id: 'layers', label: 'Three Layers' },
  { id: 'directions', label: 'Long-Term Directions' },
  { id: 'discipline', label: 'What Is Real Today' },
  { id: 'community', label: 'Open Foundation' },
]

export default function VisionDirection() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/learn">Learn</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Vision & Direction</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Vision & Direction</h1>
        <p className={articleStyles.sub}>
          Seshat keeps a broad open-source vision on purpose. The discipline is not to remove that ambition, but to place it on the right surface: a narrow product wedge on the homepage, a more serious deployment story for organizations, and a wider thesis in the docs for builders and contributors.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.main}>
          <section className={styles.anchorSection} id="overview">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Overview</h2>
              <p className={styles.sectionLead}>
                Seshat is not trying to be just another chat interface or a thin wrapper over one model vendor. The project is trying to build a governed runtime and platform foundation for agentic work that can stay open, self-hostable, extensible, and useful across many serious domains over time.
              </p>
              <p className={articleStyles.p}>
                That broad direction matters for the community because it explains why the project cares about self-hosting, provider portability, MCP, skills, permissions, session ownership, and eventually more structured team coordination. A contributor needs the wider map, not only the current feature list.
              </p>
              <p className={articleStyles.p}>
                For the current product boundary, continue with{' '}
                <Link className={articleStyles.link} to="/docs/concepts/what-is-seshat" state={{ from: location.pathname }}>
                  What is Seshat?
                </Link>
                . For the architectural bets behind that direction, continue with{' '}
                <Link className={articleStyles.link} to="/docs/learn/technical-hypotheses" state={{ from: location.pathname }}>
                  Technical Hypotheses
                </Link>
                .
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="layers">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Three Layers Of The Vision</h2>
              <div className={styles.dualGrid}>
                <LearnNodeCard
                  eyebrow="Layer 1"
                  icon="cpu"
                  tone="runtime"
                  title="A governed agent runtime"
                  body="A real execution layer with sessions, tools, permissions, memory, recovery, multi-provider routing, and deployment-friendly behavior."
                />
                <LearnNodeCard
                  eyebrow="Layer 2"
                  icon="server"
                  tone="host"
                  title="A platform for real organizations"
                  body="Users, workspaces, auditability, knowledge, APIs, deployment boundaries, and operational control around the runtime."
                />
                <LearnNodeCard
                  eyebrow="Layer 3"
                  icon="book"
                  tone="system"
                  title="An open foundation for builders"
                  body="An ecosystem where contributors can extend behavior through skills, MCP servers, SDK integrations, domain-specific workflows, and future specialized surfaces."
                />
              </div>
              <p className={articleStyles.p}>
                The public messaging should not flatten these layers into one vague promise. Each surface should emphasize the layer that matters most to its audience.
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="directions">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Long-Term Directions</h2>
              <ul className={articleStyles.list}>
                <li>Organized agentic work: agents that do not only act, but coordinate through explicit roles, reports, handoffs, and mission memory.</li>
                <li>Progressive automation: not magic autonomy everywhere, but serious automation wherever work becomes observable, structured, delegable, and governable.</li>
                <li>Open extensibility: providers, tools, skills, MCP, APIs, and deployment shapes should remain portable instead of locking users into one stack.</li>
                <li>Learning and transmission: the same foundation should eventually support explanation, guided learning, and adaptive educational flows without inventing a separate execution philosophy.</li>
              </ul>
              <p className={articleStyles.p}>
                This is the large vision that belongs in the docs and in open-source communication. It gives contributors a reason to build on top of Seshat beyond today's narrow runtime wedge.
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="discipline">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>What Is Real Today And Why That Matters</h2>
              <p className={styles.sectionLead}>
                A broad vision is healthy only if the project stays honest about what exists now. Seshat today is strongest as a governed, self-hosted, multi-provider runtime and platform base, not yet as a fully mature team-operating environment across every domain.
              </p>
              <div className={styles.dualGrid}>
                <LearnNodeCard
                  eyebrow="What exists now"
                  icon="check"
                  tone="host"
                  title="A narrow but credible wedge"
                  body="Runtime execution, permissions, tool use, persistence, multi-provider support, workspaces, APIs, and the first serious deployment story."
                />
                <LearnNodeCard
                  eyebrow="What stays aspirational"
                  icon="route"
                  tone="risk"
                  title="A larger ecosystem direction"
                  body="Durable team operations, broad domain surfaces, deep automation layers, and richer specialized products built above the same core."
                />
              </div>
              <p className={articleStyles.p}>
                This is why the homepage must stay narrower than the vision. The docs can carry the larger map without making the product sound scattered or inflated.
              </p>
            </div>
          </section>

          <section className={styles.anchorSection} id="community">
            <div className={articleStyles.section}>
              <h2 className={articleStyles.h2}>Why The Open Foundation Matters</h2>
              <p className={styles.sectionLead}>
                The community case for Seshat is not just that the code is public. The deeper claim is that agent infrastructure should remain inspectable, governable, affordable to run, and adaptable by the people who understand real workflows best.
              </p>
              <ul className={articleStyles.list}>
                <li>Developers can push the runtime, APIs, SDKs, and deployment story forward.</li>
                <li>Operators can harden permissions, observability, and governance paths.</li>
                <li>Domain experts can encode knowledge through skills, retrieval, and integration patterns.</li>
                <li>Future partners can build product surfaces and specialized workflows without starting from a closed black box.</li>
              </ul>
              <p className={articleStyles.p}>
                That is the point of keeping the broad vision alive in the documentation: it tells builders what kind of ecosystem Seshat is trying to become, even while the product messaging stays disciplined elsewhere.
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
