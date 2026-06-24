import { useState, useEffect, useRef } from 'react'
import styles from './TeamSession.module.css'

type LineType = 'cmd' | 'ok' | 'info' | 'warn' | 'meta'
interface TermLine { type: LineType; text: string; delay: number }

const SCENARIOS: TermLine[][] = [
  [
    { type: 'cmd',  text: '$ seshat team start --crew architect,godev,qa',                    delay: 0 },
    { type: 'info', text: '[Engine] Session: "feature-build"  ·  3 agents online',            delay: 420 },
    { type: 'info', text: '[Architect] Scanning project: 146 Go files found.',                 delay: 940 },
    { type: 'meta', text: '[Architect -> Go Dev] Build the /api/v1/search endpoint',          delay: 1440 },
    { type: 'meta', text: '[Go Dev] tool: file_write  ->  internal/api/search.go  (142 lines)', delay: 1940 },
    { type: 'meta', text: '[Go Dev -> QA] File is ready for test suite review.',              delay: 2380 },
    { type: 'ok',   text: '[QA] tool: run_tests  ->  12/12 pass. Approved.',                 delay: 2960 },
    { type: 'ok',   text: '[Engine] Mission complete in 00:04:21',                            delay: 3560 },
  ],
  [
    { type: 'cmd',  text: '$ seshat team start --crew researcher,scraper,writer',             delay: 0 },
    { type: 'info', text: '[Engine] Session: "market-intel"  ·  3 agents online',             delay: 420 },
    { type: 'info', text: '[Researcher] Query scope: agentic AI frameworks.',                  delay: 940 },
    { type: 'meta', text: '[Scraper] tool: search_web  ->  14 papers, 22 repos collected',   delay: 1440 },
    { type: 'meta', text: '[Scraper -> Researcher] Dataset ready for synthesis.',             delay: 1940 },
    { type: 'meta', text: '[Researcher -> Writer] Draft SWOT analysis from this data.',       delay: 2380 },
    { type: 'ok',   text: '[Writer] tool: write_file  ->  reports/swot.md  (380 lines)',     delay: 2960 },
    { type: 'ok',   text: '[Engine] Mission complete in 00:12:08',                            delay: 3560 },
  ],
  [
    { type: 'cmd',  text: '$ seshat team start --crew monitor,cibot,notifier --scheduled',    delay: 0 },
    { type: 'info', text: '[Engine] Scheduler triggered at 02:00 UTC',                        delay: 420 },
    { type: 'warn', text: '[Monitor] Anomaly detected: revenue -23% vs prior day',            delay: 940 },
    { type: 'meta', text: '[Monitor -> CI Bot] Investigate data pipeline health.',            delay: 1440 },
    { type: 'warn', text: '[CI Bot] tool: check_logs  ->  ETL job failed at 02:14 UTC',      delay: 1940 },
    { type: 'meta', text: '[CI Bot -> Notifier] Escalate: P1 incident.',                      delay: 2380 },
    { type: 'ok',   text: '[Notifier] tool: send_alert  ->  Slack + SMS sent',               delay: 2960 },
    { type: 'ok',   text: '[Engine] Incident #847 logged. Watchdog continues.',               delay: 3560 },
  ],
]

const LABELS = ['Build Session', 'Research Team', 'Auto Monitor']

export default function TeamSession() {
  const [scenario, setScenario] = useState(0)
  const [lines, setLines] = useState<TermLine[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setLines([])

    const sc = SCENARIOS[scenario]
    sc.forEach(line => {
      const t = setTimeout(() => setLines(prev => [...prev, line]), line.delay)
      timersRef.current.push(t)
    })

    const last = sc[sc.length - 1]
    const loop = setTimeout(() => setScenario(s => (s + 1) % SCENARIOS.length), last.delay + 3200)
    timersRef.current.push(loop)

    return () => timersRef.current.forEach(clearTimeout)
  }, [scenario])

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.label}>
            <span className={styles.dot} />
            Live agent team session
          </div>
          <div className={styles.scenarioPills}>
            {LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => setScenario(i)}
                className={`${styles.pill} ${i === scenario ? styles.pillActive : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.terminal}>
          <div className={styles.termHeader}>
            <div className={styles.termDots}>
              <span className={styles.tdot} style={{ background: '#ff5f57' }} />
              <span className={styles.tdot} style={{ background: '#febc2e' }} />
              <span className={styles.tdot} style={{ background: '#28c840' }} />
            </div>
            <span className={styles.termTitle}>seshat · agent team session · {LABELS[scenario]}</span>
          </div>
          <div className={styles.termBody}>
            {lines.map((line, i) => (
              <div key={i} className={`${styles.termLine} ${styles[`line_${line.type}`]}`}>
                {line.text}
              </div>
            ))}
            <div className={styles.cursor} />
          </div>
        </div>
      </div>
    </section>
  )
}
