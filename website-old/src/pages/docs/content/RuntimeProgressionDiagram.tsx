import styles from './MonoRunArchitecture.module.css'

type Tone = 'entry' | 'engine' | 'runtime' | 'system'
type IconName = 'cpu' | 'branch' | 'network'

function IconGlyph({ name }: { name: IconName }) {
  switch (name) {
    case 'cpu':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <rect x="10" y="10" width="4" height="4" rx="1" />
          <path d="M10 2v3M14 2v3M10 19v3M14 19v3M19 10h3M19 14h3M2 10h3M2 14h3" />
        </svg>
      )
    case 'branch':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M8 6h6" />
          <path d="M16 8v8" />
          <path d="M8 6v12h8" />
        </svg>
      )
    case 'network':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M8 11l7.7-4" />
          <path d="M8 13l7.7 4" />
        </svg>
      )
  }
}

function IconBadge({ icon, tone }: { icon: IconName; tone: Tone }) {
  return (
    <span className={`${styles.iconBadge} ${styles[`iconTone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
      <IconGlyph name={icon} />
    </span>
  )
}

export default function RuntimeProgressionDiagram() {
  const levels = [
    {
      eyebrow: 'Level 1',
      title: 'Mono-Run Runtime',
      body: 'One session owner handles prompt assembly, model calls, tools, permissions, and persistence inside one execution boundary.',
      chips: ['single session', 'durable transcript', 'provider + tools'],
      tone: 'engine' as const,
      icon: 'cpu' as const,
    },
    {
      eyebrow: 'Level 2',
      title: 'Sub-Agents and Delegation',
      body: 'One orchestrator session can spawn isolated sub-sessions, collect progress, and re-ingest their outputs as tool results.',
      chips: ['parallel spawn', 'isolated sessions', 'result integration'],
      tone: 'runtime' as const,
      icon: 'branch' as const,
    },
    {
      eyebrow: 'Level 3',
      title: 'Team Runtime',
      body: 'Specialized agents coordinate via task boards, mailboxes, and explicit responsibilities while still relying on the same trusted inner runtime.',
      chips: ['mailboxes', 'task board', 'specialist crews'],
      tone: 'system' as const,
      icon: 'network' as const,
    },
  ]

  return (
    <div className={styles.progressionBoard}>
      <div className={styles.diagramIntro}>
        <div>
          <span className={styles.diagramBadge}>Runtime Progression</span>
          <strong className={styles.diagramTitle}>The same inner runtime scales upward.</strong>
        </div>
        <p className={styles.diagramText}>
          Mono-run is not the end state. It is the trustworthy base layer that makes delegation, teams, and higher-order orchestration coherent.
        </p>
      </div>

      <div className={styles.progressionTrack}>
        {levels.map((level, index) => (
          <div key={level.title} className={styles.progressionItem}>
            <div className={`${styles.progressionCard} ${styles[`tone${level.tone[0].toUpperCase()}${level.tone.slice(1)}`]}`}>
              <div className={styles.progressionHeader}>
                <IconBadge icon={level.icon} tone={level.tone} />
                <div>
                  <span className={styles.promptColumnEyebrow}>{level.eyebrow}</span>
                  <strong className={styles.progressionTitle}>{level.title}</strong>
                </div>
              </div>
              <p className={styles.progressionBody}>{level.body}</p>
              <div className={styles.progressionChips}>
                {level.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </div>
            {index < levels.length - 1 ? <div className={styles.progressionArrow}><span /></div> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
