import { Link, useLocation } from 'react-router-dom'
import styles from './DocArticle.module.css'
import RuntimeProgressionDiagram from './RuntimeProgressionDiagram'

export default function WhatIsSeshat() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        <span className={styles.breadSep}>/</span>
        <Link to={`${base}/concepts`} className={styles.breadLink}>Concepts</Link>
        <span className={styles.breadSep}>/</span>
        <span className={styles.breadCurrent}>What is Seshat?</span>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>What is Seshat?</h1>
        <p className={styles.sub}>
          Seshat is an open-source Go agent runtime designed for real agentic work, not just prompt-response chat. It is
          the execution layer behind persistent sessions, tool use, permissions, memory, MCP, skills, provider routing,
          retrieval, and long-running work. On top of that runtime, <span className={styles.inlineCode}>seshat-ai</span> is
          the broader platform direction: desktop app, API layer, workspaces, governance, automation, education, and
          eventually a much wider environment for organized agentic work.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.callout}>
          <span className={styles.calloutTitle}>Short version</span>
          <p className={styles.calloutText}>
            <span className={styles.inlineCode}>seshat</span> is the runtime. <span className={styles.inlineCode}>seshat-ai</span> is the product layer.
            The runtime executes and governs agent sessions. The platform turns that core into a desktop and API environment
            for users, teams, workspaces, knowledge, scheduling, automation, and future domain-specific apps.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>The gap Seshat is trying to close</h2>
        <p className={styles.p}>
          AI tooling usually falls into two weak extremes. On one side, you have chat interfaces: useful for asking,
          explaining, and summarizing, but weak when real work needs continuity, tool use, permissions, persistence, and
          recoverability. On the other side, you have frameworks: powerful for developers, but still something you must
          assemble, host, govern, and adapt yourself.
        </p>
        <p className={styles.p}>
          Seshat exists in the middle as a runtime. The idea is simple: an agent runtime should behave more like
          infrastructure than like a demo. You deploy it, call it from a CLI app, an SDK, gRPC, or a product surface,
          and it handles the hard parts of agent execution consistently.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>The two layers</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.cardTitle}>seshat</span>
            <p className={styles.cardBody}>
              The open-source Go runtime. This is where the execution model lives: sessions, tools, permissions,
              compaction, memory, MCP, skills, retrieval, provider fallback, CLI app, gRPC, and the core agent loop.
            </p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>seshat-ai</span>
            <p className={styles.cardBody}>
              The platform layer built on top of the runtime. This is where desktop UX, multi-user APIs, auth,
              workspaces, knowledge systems, scheduling, governance, and future specialized surfaces can evolve.
            </p>
          </div>
        </div>
        <p className={styles.p}>
          Keeping those layers separate is important. The runtime should stay clean, embeddable, and useful on its own.
          The platform should be free to become a richer environment for organizations and domain-specific workflows
          without polluting the engine with product concerns like billing, user management, or UI-specific logic.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>The real thesis behind the project</h2>
        <p className={styles.p}>
          The deeper thesis is not just that agents need tools. It is that AI should stop being trapped in the chatbot
          format and become a real work system. Real work is not a single answer. It has goals, time, memory,
          permissions, reports, handoffs, revisions, and durable decisions.
        </p>
        <p className={styles.p}>
          Seshat starts from the belief that the next important jump in value is not merely the individual agent. It is
          the organization of work between agents and humans in a coherent environment. That is why the project keeps
          returning to ideas like missions, explicit coordination, memory boundaries, observability, and traceable
          execution instead of treating orchestration as a black box.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Complete agents, not disposable workers</h2>
        <p className={styles.p}>
          One of the most important ideas in the vision is that the core unit is the complete agent session, not the
          disposable sub-agent. A full agent has identity, tools, permissions, history, working memory, and operational
          responsibility. A sub-agent is still useful, but it is only an execution mechanism inside a larger system.
        </p>
        <ul className={styles.list}>
          <li>An agent should be able to persist, resume, and remain accountable for a result.</li>
          <li>Communication between agents should be explicit and inspectable, not hidden inside opaque state.</li>
          <li>Shared memory should stay limited, structured, and intentional rather than becoming a giant mixed context.</li>
          <li>Teams should eventually coordinate around missions, roles, reports, blockers, and decisions.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Automation is part of the destination</h2>
        <p className={styles.p}>
          Seshat is not only about assistance. It is meant to become infrastructure for automating digital work wherever
          that work can be observed, structured, delegated, and governed. That includes software delivery, research,
          reporting, support, operations, communication, knowledge work, marketing, documentation, finance workflows,
          and other professional tasks that can be translated into missions, tools, approvals, and outputs.
        </p>
        <p className={styles.p}>
          The important point is not a vague promise to automate everything magically. The stronger claim is that Seshat
          aims to progressively automate any digital workflow that can be made legible enough for agents to execute safely
          and usefully.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Education is a first-class direction</h2>
        <p className={styles.p}>
          Another important direction is education. The same runtime can support agents that teach, explain, quiz,
          adapt to a learner&apos;s level, and keep continuity over time. In that model, Seshat is not just a tool for
          developers or enterprises. It can also become an environment for learning, training, revision, guided
          exploration, and domain teaching grounded in sources and structured explanations.
        </p>
        <ul className={styles.list}>
          <li>Teaching agents can explain the same concept from multiple angles.</li>
          <li>Learning paths can adapt to the user&apos;s pace, level, and gaps.</li>
          <li>Sources, notes, examples, and exercises can remain attached to the same mission context.</li>
          <li>Education becomes another serious agentic surface built on the same core runtime.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>What the runtime already gives you today</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Sessions</span>
            <p className={styles.cardBody}>Persistent, resumable work instead of disposable terminal output or one-off chat history.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Tools and permissions</span>
            <p className={styles.cardBody}>Agents can read, write, browse, search, and execute, but inside explicit permission boundaries.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Memory and compaction</span>
            <p className={styles.cardBody}>Context is preserved across long sessions and compacted automatically when the window fills up.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>MCP and skills</span>
            <p className={styles.cardBody}>External servers and reusable skill packs extend the agent without forking the runtime.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Provider routing</span>
            <p className={styles.cardBody}>Multi-provider support, fallback routing, and model switching are part of the core design.</p>
          </div>
          <div className={styles.card}>
            <span className={styles.cardTitle}>Deployment surfaces</span>
            <p className={styles.cardBody}>The same engine can power a CLI app, a Go SDK, a gRPC service, and the larger desktop platform.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Why the runtime matters technically</h2>
        <p className={styles.p}>
          Seshat is intentionally built as a deployable Go runtime rather than as a Python-first framework. That choice
          is about infrastructure qualities: single-binary deployment, fast startup, clean embedding, easier self-hosting,
          and a stable execution core that other languages can call through interfaces instead of re-implementing.
        </p>
        <ul className={styles.list}>
          <li>Local-first and self-hostable, with support for both local and remote models.</li>
          <li>Provider-agnostic by design rather than locked to one model vendor.</li>
          <li>Production-oriented from the start: permissions, recovery, persistence, observability, and compaction.</li>
          <li>Extensible through tools, skills, MCP servers, hooks, and higher-level product layers.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>An open foundation shaped by the community</h2>
        <p className={styles.p}>
          Seshat is not meant to be defined only by a central product roadmap. It is meant to reflect an open-source
          worldview for agentic systems: transparent, self-hostable, extensible, provider-agnostic, and affordable enough
          to matter beyond a handful of very large companies.
        </p>
        <p className={styles.p}>
          In practice, that means the long-term shape of the platform should be influenced by the people who actually know
          their domains well: developers, educators, operators, researchers, designers, marketers, analysts, and other
          specialists who want to build serious agentic systems without surrendering control of the foundation.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Current focus versus long-term direction</h2>
        <p className={styles.p}>
          The project is intentionally staged. Today, the priority is making the single-agent runtime strong enough for
          daily real use. That means one capable agent, one solid session model, one trustworthy execution core.
        </p>
        <ol className={styles.orderedList}>
          <li><span className={styles.inlineCode}>Level 1</span>: production-grade single-agent runtime. This is the current focus.</li>
          <li><span className={styles.inlineCode}>Level 2</span>: stronger sub-agent orchestration and parallel delegation.</li>
          <li><span className={styles.inlineCode}>Level 3</span>: persistent agent teams coordinating around missions, mailboxes, and shared task structures.</li>
        </ol>
        
        <RuntimeProgressionDiagram />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Why the CLI app matters right now</h2>
        <p className={styles.p}>
          The CLI app is currently the fastest place to prove the runtime under real pressure. It lets developers and
          vibecoders use the engine directly, test new capabilities early, and contribute feedback before features become
          polished platform surfaces. In that sense, the CLI is not separate from the vision. It is the proving ground
          that helps the runtime mature.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Next concept</h2>
        <p className={styles.p}>
          Once the runtime itself is clear, the next useful step is understanding why the single-binary design matters
          and how one executable can own the execution surface without collapsing into chaos.
        </p>
        <div className={styles.actionRow}>
          <Link to={`${base}/contribution`} className={styles.secondaryLink}>Contribute</Link>
          <Link to={`${base}/guides/cli`} className={styles.secondaryLink}>CLI guide</Link>
          <Link to={`${base}/concepts/mono-run`} className={styles.primaryLink}>Mono-Run Architecture</Link>
        </div>
      </section>
    </div>
  )
}
