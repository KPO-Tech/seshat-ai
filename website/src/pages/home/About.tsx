import { useState } from 'react'
import { useInView } from '../../hooks/useInView'
import styles from './About.module.css'

const ITEMS = [
  {
    number: '01',
    title: 'What is Seshat?',
    tag: 'The Project',
    body: `Seshat is an open-source unified environment for agentic work. It brings together everything that is today scattered across dozens of disconnected tools: agents, memory, missions, multi-agent coordination and 60+ built-in tools. All in one coherent system built in Go.

It is structured around two complementary layers. The first is seshat, the headless Go runtime engine: the core that provides sessions, the agentic loop, 15+ LLM providers, MCP, gRPC, RAG, skills, persistent memory and sandboxed execution. The second is seshat-ai, the full production platform built on top of it: desktop app, multi-user backend, knowledge base, workspaces, schedulers and enterprise AI features.

The engine executes. The platform organizes. Together, they form a complete infrastructure for running AI agent teams at production scale.`,
  },
  {
    number: '02',
    title: 'The problem we are solving',
    tag: 'The Gap',
    body: `The AI landscape is fragmented. To work seriously with AI today, you need one product for conversation, another for coding, another for automation, another for research, another for knowledge management, another for image generation and yet another for workflow orchestration. Every context switch means lost decisions, broken continuity and duplicated effort.

The fragmentation also runs deeper than tools. Most products today are still built around a single agent answering a single question. The harder unsolved challenge is how multiple autonomous agents coordinate, share a mission, maintain structured communication and produce reliable results together without losing coherence.

That is the gap Seshat is designed to fill. Not a chatbot. Not another pipeline framework. A complete environment where agents, teams, missions and tools coexist in the same governed system.`,
  },
  {
    number: '03',
    title: 'What inspired the project',
    tag: 'The Inspiration',
    body: `The deepest inspiration for Seshat came from observing how human organizations actually function. A real company does not run as a sequence of prompts. It operates through roles, responsibilities, inboxes, meetings, status reports, shared decisions, structured handoffs and a collective memory of what has been agreed.

If AI agents are going to take on serious intellectual and operational work, they need the same coordination primitives that make human teams effective. Not just the ability to call each other, but a real model of teamwork: assigned roles, a shared mission, explicit communication, escalation paths and a minimal but durable mission memory.

At the same time, the fragmentation of the tool landscape made it clear that a unified environment was missing. The goal became simple: build the place where agentic work happens without context loss, without tool fragmentation and without the complexity of stitching dozens of products together.`,
  },
  {
    number: '04',
    title: 'Where we are going',
    tag: 'The Vision',
    body: `The long-term vision for Seshat is to become the infrastructure layer for intellectual and operational work. Not a better assistant. Not another framework. The place where multiple AI agent teams pursue missions together, where work is observable, governable and economically useful for real organizations.

This means progressively unifying in one environment what is today dispersed: individual agentic work, multi-agent team coordination, automation, research, knowledge management, media production, real-time voice interaction and communication across external channels. Each of these domains can become a specialized surface within the same core.

For enterprises, this translates into a governed platform with audit, roles, quotas, SLA and deep integration with existing workflows. For developers, it means a clean embeddable Go runtime and SDK. For the open-source community, it means a shared foundation for building the next generation of agentic systems.`,
  },
]

export default function About() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const { ref, inView } = useInView(0.1)

  return (
    <section className={styles.section}>
      <div className="container">
        <p className="section-label">The Story</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>
          Built with a clear purpose
        </h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>
          Seshat did not start as a feature list. It started as a conviction that
          AI work deserves a real environment, not a collection of fragmented tools.
        </p>

        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className={styles.accordion}
        >
          {ITEMS.map((item, i) => {
            const isOpen = openIndex === i
            return (
              <div
                key={item.number}
                className={`${styles.item} reveal stagger-${i + 1} ${inView ? 'visible' : ''} ${isOpen ? styles.itemOpen : ''}`}
              >
                <button
                  className={styles.header}
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className={styles.number}>{item.number}</span>
                  <div className={styles.headerMeta}>
                    <span className={styles.tag}>{item.tag}</span>
                    <span className={styles.itemTitle}>{item.title}</span>
                  </div>
                  <svg
                    className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <div className={`${styles.body} ${isOpen ? styles.bodyOpen : ''}`}>
                  <div className={styles.bodyInner}>
                    {item.body.split('\n\n').map((para, j) => (
                      <p key={j} className={styles.para}>{para}</p>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
