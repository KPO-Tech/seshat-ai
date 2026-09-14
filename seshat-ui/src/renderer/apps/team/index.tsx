import { Lightning, Mail, FileText, Caution, Robot } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { useEffect } from 'react'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function TeamPage() {
  const closeAllRightPanels = useUIStore(s => s.closeAllRightPanels)

  useEffect(() => { closeAllRightPanels() }, [closeAllRightPanels])

  return (
    <div className="tm-root">
      <style>{CSS}</style>

      {/* Top bar */}
      <header className="tm-topbar">
        <span className="tm-topbar-title">Agent Teams</span>
        <StatusBadge variant="planned" icon={<Lightning size={10} />} label="Coming soon" className="tm-badge-right" />
      </header>

      {/* Content */}
      <div className="tm-body">
        <div className="tm-hero">
          <div className="tm-hero-icon">
            <Robot size={30} theme="outline" />
          </div>
          <h1>Agent Teams</h1>
          <p>
            Build persistent teams of specialized agents that collaborate on missions
            asynchronously — each with its own role, memory, tools, and inbox.
            No central orchestrator: agents claim tasks, send messages, and act independently.
          </p>
          <StatusBadge variant="planned" icon={<Lightning size={11} />} label="Coming in a future release" />
        </div>

        {/* Mission example */}
        <div className="tm-mission-preview">
          <div className="tm-mission-label">Example mission</div>
          <div className="tm-mission-title">"Implement OAuth2 authentication"</div>
          <div className="tm-mission-flow">
            {MISSION_STEPS.map((step, i) => (
              <div key={step.role} className="tm-mission-step">
                <div className="tm-step-dot" />
                <div className="tm-step-content">
                  <span className="tm-step-role">{step.role}</span>
                  <span className="tm-step-action">{step.action}</span>
                </div>
                {i < MISSION_STEPS.length - 1 && <div className="tm-step-line" />}
              </div>
            ))}
          </div>
        </div>

        {/* Feature preview cards */}
        <div className="tm-feature-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="tm-feature-card">
              <div className="tm-feature-icon">{f.icon}</div>
              <div className="tm-feature-title">{f.title}</div>
              <div className="tm-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        <div className="tm-notify-block">
          <Caution size={11} />
          <span>Agent Teams require the Level 3 runtime. Under development — expected Q4 2026.</span>
        </div>
      </div>
    </div>
  )
}

const MISSION_STEPS = [
  { role: 'Architect',   action: 'reads mission → designs auth flow → posts tasks to board' },
  { role: 'Backend Dev', action: 'claims implementation → writes OAuth routes → spawns test workers' },
  { role: 'QA Agent',    action: 'reviews output → sends bug report via mailbox → re-triggers dev' },
  { role: 'DevOps',      action: 'claims deployment → deploys → marks mission complete' },
]

const FEATURES = [
  {
    icon: <Mail size={18} theme="outline" />,
    title: 'Agent Mailbox',
    desc: 'Agents send and receive async messages. No polling — each agent acts when its inbox has work.',
  },
  {
    icon: <FileText size={18} theme="outline" />,
    title: 'Shared Task Board',
    desc: 'A shared board of tasks agents can claim, complete, and hand off. Visible to all team members.',
  },
  {
    icon: <Robot size={18} theme="outline" />,
    title: 'Role-based Agents',
    desc: 'Each agent has a defined role with its own skills, tools, memory, and permissions.',
  },
  {
    icon: <Lightning size={18} theme="outline" />,
    title: 'Mission Lifecycle',
    desc: 'Start, monitor, pause, and cancel multi-agent missions. Full audit trail per step.',
  },
]

const CSS = `
.tm-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
}

/* Top bar */
.tm-topbar {
  display: flex; align-items: center; gap: 6px;
  padding: 0 17px; height: 52px; flex-shrink: 0;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-subtle);
}
.tm-topbar-sep { color: var(--color-text-muted); font-size: 12px; user-select: none; }
.tm-topbar-title { font-size: 13px; font-weight: 700; color: var(--color-text); }
.tm-badge-right { margin-left: auto; }

/* Body */
.tm-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; align-items: center;
  padding: 45px 34px 34px; gap: 36px;
}

/* Hero */
.tm-hero {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; gap: 12px; max-width: 520px;
}
.tm-hero-icon {
  width: 72px; height: 72px; border-radius: 17px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
  color: var(--color-primary);
}
.tm-hero h1 { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
.tm-hero p  { margin: 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.7; }

/* Mission preview */
.tm-mission-preview {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 17px 20px;
  width: 100%; max-width: 560px;
  display: flex; flex-direction: column; gap: 12px;
}
.tm-mission-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--color-text-muted);
}
.tm-mission-title {
  font-size: 13px; font-weight: 700; color: var(--color-text);
  font-family: var(--font-mono);
}
.tm-mission-flow {
  display: flex; flex-direction: column; gap: 0;
  padding-left: 3px;
}
.tm-mission-step {
  display: flex; align-items: flex-start; gap: 9px;
  position: relative;
}
.tm-step-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px;
  background: var(--color-primary);
  position: relative; z-index: 1;
}
.tm-step-line {
  position: absolute; left: 3px; top: 13px; bottom: -12px;
  width: 2px;
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
}
.tm-step-content {
  display: flex; flex-direction: column; gap: 2px;
  padding-bottom: 10px;
}
.tm-step-role {
  font-size: 10px; font-weight: 700; color: var(--color-text);
}
.tm-step-action {
  font-size: 10px; color: var(--color-text-muted); line-height: 1.5;
}

/* Feature grid */
.tm-feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 11px;
  width: 100%; max-width: 860px;
}
.tm-feature-card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 15px 14px;
  display: flex; flex-direction: column; gap: 8px;
  opacity: 0.65;
}
.tm-feature-icon {
  width: 42px; height: 42px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
  color: var(--color-primary);
}
.tm-feature-title { font-size: 12px; font-weight: 700; color: var(--color-text); }
.tm-feature-desc  { font-size: 10px; color: var(--color-text-muted); line-height: 1.6; }

/* Notify */
.tm-notify-block {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 8px;
  background: var(--color-bg);
  border: 1px solid var(--color-border-subtle);
  font-size: 11px; color: var(--color-text-muted);
  max-width: 560px; width: 100%;
}
`
