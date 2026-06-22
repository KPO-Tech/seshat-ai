import Hero from './Hero'
import Why from './Why'
import AgentSimulator from './AgentSimulator'
import Screenshots from './Screenshots'
import Ecosystem from './Ecosystem'
import Install from './Install'
import { useInView } from '../../hooks/useInView'
import { useCountUp } from '../../hooks/useCountUp'

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <Why />
      <Ecosystem />
      <Screenshots />
      <AgentSimulator />
      <Install />
    </>
  )
}

const STAT_ITEMS = [
  { num: 15, suffix: '+', label: 'LLM Providers' },
  { num: 60, suffix: '+', label: 'Built-in Tools' },
  { num: null, text: 'Go',   label: 'Single Binary' },
  { num: null, text: 'MCP',  label: 'Protocol' },
  { num: null, text: 'gRPC', label: 'API Layer' },
]

function StatItem({ item, active, idx }: { item: typeof STAT_ITEMS[0]; active: boolean; idx: number }) {
  const count = useCountUp(item.num ?? 0, 1200, active && item.num !== null)
  const display = item.num !== null ? `${count}${item.suffix}` : item.text!

  return (
    <div
      className={`reveal stagger-${idx + 1}`}
      style={{
        padding: '2rem 3rem',
        textAlign: 'center',
        borderRight: idx !== STAT_ITEMS.length - 1 ? '1px solid var(--border-glass)' : 'none',
        flexGrow: 1,
        flexBasis: '160px',
      }}
    >
      <div style={{
        fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em',
        background: 'var(--brand-engine-gradient)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text', fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}>
        {display}
      </div>
      <div style={{
        fontSize: '0.72rem', color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        marginTop: '0.4rem', fontWeight: 700,
      }}>
        {item.label}
      </div>
    </div>
  )
}

function Stats() {
  const { ref, inView } = useInView(0.3)

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      style={{
        display: 'flex', justifyContent: 'center', flexWrap: 'wrap',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-glass)',
        borderBottom: '1px solid var(--border-glass)',
        backdropFilter: 'blur(8px)', position: 'relative', zIndex: 5,
      }}
    >
      {STAT_ITEMS.map((item, idx) => (
        <StatItem
          key={item.label}
          item={item}
          active={inView}
          idx={idx}
        />
      ))}
    </div>
  )
}
