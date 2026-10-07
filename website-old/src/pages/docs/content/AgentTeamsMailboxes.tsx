import { Link, useLocation } from 'react-router-dom'
import articleStyles from './DocArticle.module.css'
import styles from './ToolsProvidersConcept.module.css'

type Tone = 'tool' | 'provider' | 'runtime' | 'capability'
type IconName = 'users' | 'mail' | 'flow' | 'shield' | 'spark' | 'search' | 'stack'

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'users':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 4.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'mail':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      )
    case 'flow':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="7" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
          <path d="M8 7h8M7 8.7l4 6.1M17 8.7l-4 6.1" />
        </svg>
      )
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v5c0 4.7-2.8 7.9-7 10-4.2-2.1-7-5.3-7-10V6l7-3z" />
        </svg>
      )
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </svg>
      )
    case 'search':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      )
    case 'stack':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="5" width="14" height="4" rx="1.5" />
          <rect x="5" y="10" width="14" height="4" rx="1.5" />
          <rect x="5" y="15" width="14" height="4" rx="1.5" />
        </svg>
      )
  }
}

function toneClassName(tone: Tone) {
  switch (tone) {
    case 'provider':
      return styles.toneProvider
    case 'runtime':
      return styles.toneRuntime
    case 'capability':
      return styles.toneCapability
    default:
      return styles.toneTool
  }
}

function Node({ eyebrow, title, body, meta, tone, icon }: { eyebrow: string; title: string; body: string; meta: string; tone: Tone; icon: IconName }) {
  return (
    <div className={styles.node}>
      <div className={styles.top}>
        <span className={`${styles.icon} ${toneClassName(tone)}`}>
          <IconGlyph name={icon} />
        </span>
        <span className={styles.eyebrow}>{eyebrow}</span>
      </div>
      <strong className={styles.title}>{title}</strong>
      <p className={styles.body}>{body}</p>
      <span className={styles.metaChip}>{meta}</span>
    </div>
  )
}

function TeamDiagram() {
  return (
    <div className={styles.board}>
      <div className={styles.glow} />
      <div className={styles.laneGrid}>
        <Node
          eyebrow="Identity Layer"
          title="Agent Profiles"
          body="Persistent team members have stable IDs, nicknames, roles, optional team membership, preferred models, and profile-specific skills."
          meta="Who each agent is"
          tone="tool"
          icon="users"
        />
        <Node
          eyebrow="Transport Layer"
          title="Mailbox"
          body="Each agent gets a persistent async inbox backed by SQLite. Messages survive restarts instead of living only inside one in-memory turn."
          meta="How team messages move"
          tone="provider"
          icon="mail"
        />
        <Node
          eyebrow="Routing Layer"
          title="Dispatcher"
          body="Send, Reply, Broadcast, and Assign turn roles and team membership into actual message delivery rules."
          meta="How work is delegated"
          tone="runtime"
          icon="flow"
        />
        <Node
          eyebrow="Execution Layer"
          title="TeamBus + Handler"
          body="The TeamBus polls unread inboxes and hands each message to host-defined execution logic that can run a real session and send follow-ups."
          meta="How inbox work becomes runtime work"
          tone="capability"
          icon="spark"
        />
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.hub}>
        <div className={styles.top}>
          <span className={`${styles.icon} ${styles.toneRuntime}`}>
            <IconGlyph name="stack" />
          </span>
          <span className={styles.eyebrow}>Persistent Team Runtime</span>
        </div>
        <strong className={styles.title}>This is not the same thing as spawn_agent</strong>
        <p className={styles.body}>
          `spawn_agent` creates a short-lived delegated execution path. Teams and mailboxes model persistent agent identities that can be offline, receive work asynchronously, reply later, and collaborate over multiple sessions without sharing one immediate turn.
        </p>
      </div>

      <div className={styles.centerLine}><span /></div>

      <div className={styles.branchRow}>
        <div className={styles.branch}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneTool}`}>
              <IconGlyph name="search" />
            </span>
            <span className={styles.eyebrow}>Routing Detail</span>
          </div>
          <strong className={styles.title}>Assign uses role + team scope</strong>
          <p className={styles.body}>The dispatcher can target a role and team, then route to the least-loaded matching agent based on unread mailbox counts.</p>
        </div>
        <div className={styles.branch}>
          <div className={styles.top}>
            <span className={`${styles.icon} ${styles.toneRuntime}`}>
              <IconGlyph name="shield" />
            </span>
            <span className={styles.eyebrow}>Execution Detail</span>
          </div>
          <strong className={styles.title}>Execution is still host-owned</strong>
          <p className={styles.body}>Today the TeamBus is intentionally minimal. The caller wires the real session execution through the message handler instead of hiding it in a black box.</p>
        </div>
      </div>
    </div>
  )
}

export default function AgentTeamsMailboxes() {
  const location = useLocation()

  return (
    <article className={articleStyles.page}>
      <div className={articleStyles.breadcrumb}>
        <Link className={articleStyles.breadLink} to="/docs">Docs</Link>
        <span className={articleStyles.breadSep}>/</span>
        <Link className={articleStyles.breadLink} to="/docs/concepts">Concepts</Link>
        <span className={articleStyles.breadSep}>/</span>
        <span className={articleStyles.breadCurrent}>Agent Teams and Mailboxes</span>
      </div>

      <header className={articleStyles.header}>
        <h1 className={articleStyles.title}>Agent Teams and Mailboxes</h1>
        <p className={articleStyles.sub}>
          Seshat’s team model is about persistent agent identities that collaborate asynchronously through a mailbox system. It is the beginning of a team runtime, not just a nicer name for sub-agents.
        </p>
      </header>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>The Conceptual Shift</h2>
        <p className={articleStyles.p}>
          A sub-agent tool call is useful for bounded delegation inside one turn. A team runtime is a different architectural level: named agents with roles, inboxes, team membership, and message threads that can stay alive across sessions and restarts. That is closer to how a real organization works than to how a single prompt decomposes a task.
        </p>
        <TeamDiagram />
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>What Exists In The Runtime Today</h2>
        <div className={articleStyles.grid}>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Persistent AgentProfile</div>
            <p className={articleStyles.cardBody}>Each agent has a stable UUID, nickname, role, optional team, persona template, preferred model, and preloaded skills.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>SQLite mailbox</div>
            <p className={articleStyles.cardBody}>Unread messages, read state, thread history, broadcasts, and reply links persist on disk instead of vanishing when one turn ends.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>Dispatcher routing</div>
            <p className={articleStyles.cardBody}>The runtime already supports direct send, threaded reply, team broadcast, and role-based assign with least-loaded routing.</p>
          </div>
          <div className={articleStyles.card}>
            <div className={articleStyles.cardTitle}>TeamBus bridge</div>
            <p className={articleStyles.cardBody}>Inbox polling and message dispatch exist, but the caller still plugs in the real session execution logic through the handler.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Message Model</h2>
        <p className={articleStyles.p}>
          The mailbox transport is intentionally explicit. The runtime does not hide coordination inside invisible internal state. Work moves as messages that can be inspected, stored, replayed, and threaded.
        </p>
        <div className={styles.messageGrid}>
          <div className={styles.messageCard}>
            <span className={styles.kindChip}>task</span>
            <strong className={styles.messageTitle}>Delegation</strong>
            <p className={styles.messageText}>Assign a concrete unit of work to a specific agent.</p>
          </div>
          <div className={styles.messageCard}>
            <span className={styles.kindChip}>reply</span>
            <strong className={styles.messageTitle}>Threaded response</strong>
            <p className={styles.messageText}>Link a follow-up to a parent message through <span className={articleStyles.inlineCode}>ReplyTo</span>.</p>
          </div>
          <div className={styles.messageCard}>
            <span className={styles.kindChip}>broadcast</span>
            <strong className={styles.messageTitle}>Team fan-out</strong>
            <p className={styles.messageText}>Send one announcement to all agents in a team, excluding the sender.</p>
          </div>
          <div className={styles.messageCard}>
            <span className={styles.kindChip}>event</span>
            <strong className={styles.messageTitle}>System signal</strong>
            <p className={styles.messageText}>Carry runtime notifications like started, finished, or errored.</p>
          </div>
        </div>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Architecture Responsibilities</h2>
        <ol className={articleStyles.orderedList}>
          <li><span className={articleStyles.inlineCode}>internal/agent</span> defines who the agents are: profiles, identities, and profile registry.</li>
          <li><span className={articleStyles.inlineCode}>internal/mailbox</span> defines how they communicate: typed messages and persistent inbox operations.</li>
          <li><span className={articleStyles.inlineCode}>internal/team</span> defines how coordination happens: routing, team membership, TeamBus polling, and handler dispatch.</li>
          <li>The caller wires real session execution into the handler, which keeps the runtime honest about what is implemented versus what is still a higher-level roadmap.</li>
        </ol>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Why This Matters</h2>
        <div className={articleStyles.callout}>
          <div className={articleStyles.calloutTitle}>Runtime Level Change</div>
          <p className={articleStyles.calloutText}>
            The point is not to add more agent names to one turn. The point is to move from isolated delegation toward persistent organizational coordination: identities, inboxes, shared team membership, delayed replies, and explicit message history.
          </p>
        </div>
        <ul className={articleStyles.list}>
          <li>A manager agent can delegate and synthesize without doing every task itself.</li>
          <li>Two researchers can share a role while assignment still balances toward the least-loaded one.</li>
          <li>A team can survive process restarts because its communication state lives in the mailbox, not only in memory.</li>
          <li>Execution remains observable because messages and threads are first-class runtime records.</li>
        </ul>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Current Boundary</h2>
        <p className={articleStyles.p}>
          The team primitives are real, but the fully autonomous persistent team loop is still not the official polished product surface. Profiles, mailbox, dispatcher, least-loaded assignment, TeamBus, and team registry exist. The remaining step is richer session execution on top of the mailbox handler and then first-class product surfaces around it.
        </p>
      </section>

      <section className={articleStyles.section}>
        <h2 className={articleStyles.h2}>Related Pages</h2>
        <p className={articleStyles.p}>
          Continue with{' '}
          <Link className={articleStyles.link} to="/docs/concepts/tools" state={{ from: location.pathname }}>
            Tools &amp; Providers
          </Link>
          {' '}for the action-versus-transport architecture, or{' '}
          <Link className={articleStyles.link} to="/docs/guides/cli" state={{ from: location.pathname }}>
            CLI Usage
          </Link>
          {' '}for the current user-facing runtime surface.
        </p>
      </section>
    </article>
  )
}
