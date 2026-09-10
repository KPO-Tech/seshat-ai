import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Book,
  GridFour,
  List,
  Message,
  Peoples,
  PlayOne,
  Time,
  Branch,
  Workbench,
  Mail,
  SmilingFace,
} from '@icon-park/react'
import { StatusBadge, STATUS_BADGE_CSS } from '@/components/ui/StatusBadge'
import { api } from '@/api/client'

type AppStatus = 'ready' | 'planned'
type AppCategory = 'all' | 'core' | 'agentic'
type ViewMode = 'grid' | 'list'
type SystemStatus = { mode: 'standalone' | 'connected'; server_url?: string }

type AppEntry = {
  id: string
  title: string
  description: string
  route?: string
  status: AppStatus
  category: Exclude<AppCategory, 'all'>
  icon: React.ReactNode
  tone: string
  highlights: string[]
  // Same gate Sidebar.tsx's own "Scheduling" nav item has - saved
  // automations need a real connected seshat-server, not just this desktop
  // app running standalone/local.
  requiresConnected?: boolean
}

const APPS: AppEntry[] = [
  {
    id: 'knowledge',
    title: 'Knowledge',
    description: 'Search, ask questions, and summarize your personal knowledge — plus shared collections when connected to an organization.',
    route: '/knowledge',
    status: 'ready',
    category: 'core',
    icon: <Book size={32} />,
    tone: 'knowledge',
    highlights: ['Semantic RAG', 'Personal & shared docs', 'Cited answers'],
  },
  {
    id: 'skills-creator',
    title: 'Skills Creator',
    description: 'Browse, edit, enable/disable, and import skills from repositories.',
    route: '/skills-creator',
    status: 'ready',
    category: 'agentic',
    icon: <Workbench size={32} />,
    tone: 'skills',
    highlights: ['Repository import', 'Custom icons', 'skill.md editing'],
  },
  {
    id: 'inbox',
    title: 'Inbox',
    description: 'Intelligent mailbox across email and WhatsApp. Triage, draft, and send replies, backed by the Inbox Agent.',
    route: '/inbox',
    status: 'ready',
    category: 'core',
    icon: <Mail size={32} />,
    tone: 'browser',
    highlights: ['Gmail & WhatsApp sync', 'Draft before you send', 'Inbox Agent triage'],
  },
  {
    id: 'teams',
    title: 'Teams',
    description: 'Persistent groups of specialized agents collaborating on multi-step missions.',
    route: '/teams',
    status: 'planned',
    category: 'agentic',
    icon: <Peoples size={32} />,
    tone: 'teams',
    highlights: ['Task boards', 'Agent handoffs', 'Collaborative execution'],
  },
  {
    id: 'companion',
    title: 'Companion',
    description: 'Create and manage your own custom agents, each with an illustrated face you pick or generate.',
    route: '/companion',
    status: 'ready',
    category: 'agentic',
    icon: <SmilingFace size={32} />,
    tone: 'companion',
    highlights: ['Illustrated avatars', 'Custom system prompts', 'Your own agent roster'],
  },
  {
    id: 'automation',
    title: 'Agent Workflows',
    description: 'Build governed agent workflows with triggers, tools, knowledge, human validation, pinned test data, and per-node execution traces.',
    route: '/automation',
    status: 'ready',
    category: 'agentic',
    icon: <Branch size={32} />,
    tone: 'workflow',
    highlights: ['Visual graph editor', 'Cron/interval/webhook triggers', 'Test nodes before you save'],
    requiresConnected: true,
  },
]

const FILTERS: Array<{ id: AppCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'core', label: 'Core Products' },
  { id: 'agentic', label: 'Agentic Workflows' },
]

export function AppsPage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<AppCategory>('all')
  const [selectedId, setSelectedId] = useState('knowledge')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    api.get<SystemStatus>('/system/status').then(setSystemStatus).catch(() => setSystemStatus(null))
  }, [])
  const connected = systemStatus?.mode === 'connected'

  const apps = useMemo(() => APPS.filter((app) => !app.requiresConnected || connected), [connected])
  const selected = apps.find((app) => app.id === selectedId) ?? apps[0]
  const visibleApps = useMemo(
    () => apps.filter((app) => category === 'all' || app.category === category),
    [apps, category],
  )

  function select(app: AppEntry) {
    setSelectedId(app.id)
  }

  function launch(app: AppEntry) {
    select(app)
    if (app.route) navigate(app.route)
  }

  return (
    <div className="apps-root">
      <style>{APPS_CSS}</style>
      <style>{STATUS_BADGE_CSS}</style>

      <main className="apps-content">
        <section className="apps-toolbar">
          <h1>Seshat-Labs</h1>
          <div className="apps-toolbar-controls">
            <div className="apps-filters" aria-label="App categories">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  className={category === filter.id ? 'active' : ''}
                  onClick={() => setCategory(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="apps-view-toggle" aria-label="App view mode">
              <button className={viewMode === 'grid' ? 'active' : ''} type="button" onClick={() => setViewMode('grid')} aria-label="Grid view">
                <GridFour size={14} />
              </button>
              <button className={viewMode === 'list' ? 'active' : ''} type="button" onClick={() => setViewMode('list')} aria-label="List view">
                <List size={14} />
              </button>
            </div>
          </div>
        </section>

        <section className="apps-layout">
          <div className={`apps-list apps-list--${viewMode}`}>
            {visibleApps.map((app) => (
              <button
                key={app.id}
                className={`apps-item ${selected.id === app.id ? 'selected' : ''}`}
                type="button"
                onClick={() => select(app)}
                onDoubleClick={() => launch(app)}
              >
                <span className={`apps-item-icon ${app.tone}`}>{app.icon}</span>
                <span className="apps-item-copy">
                  <strong>{app.title}</strong>
                  <small>{app.description}</small>
                </span>
                <StatusBadge
                  className="apps-status"
                  variant={app.status === 'ready' ? 'success' : 'planned'}
                  label={app.status === 'ready' ? 'Ready' : 'Planned'}
                />
              </button>
            ))}
          </div>

          <aside className="apps-inspector">
            <div className={`apps-inspector-icon ${selected.tone}`}>{selected.icon}</div>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>

            <div className="apps-inspector-status">
              {selected.status === 'ready' ? <Message size={14} /> : <Time size={14} />}
              <span>{selected.status === 'ready' ? 'Available now' : 'Planned surface'}</span>
            </div>

            <div className="apps-highlights">
              {selected.highlights.map((highlight) => (
                <div key={highlight} className="apps-highlight">
                  <Book size={13} />
                  <span>{highlight}</span>
                </div>
              ))}
            </div>

            <button
              className="apps-launch"
              type="button"
              disabled={!selected.route}
              onClick={() => selected.route && navigate(selected.route)}
            >
              <PlayOne size={14} />
              {selected.route ? 'Open app' : 'Coming later'}
            </button>
          </aside>
        </section>
      </main>
    </div>
  )
}

const APPS_CSS = `
.apps-root {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
}

.apps-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 0;
}

.apps-toolbar {
  min-height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-7);
  padding: 0 var(--space-8);
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
}

.apps-toolbar h1 {
  margin: 0;
  font-size: var(--font-size-base);
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0;
}

.apps-toolbar-controls {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.apps-filters,
.apps-view-toggle {
  display: flex;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.apps-filters button,
.apps-view-toggle button {
  min-height: 30px;
  border: 0;
  border-right: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 700;
  cursor: pointer;
}

.apps-filters button {
  min-width: 88px;
  padding: 0 var(--space-5);
}

.apps-view-toggle button {
  width: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.apps-filters button:last-child,
.apps-view-toggle button:last-child {
  border-right: 0;
}

.apps-filters button:hover,
.apps-view-toggle button:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.apps-filters button.active,
.apps-view-toggle button.active {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  box-shadow: inset 0 -2px 0 var(--color-primary);
}

.apps-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  overflow: hidden;
  padding: var(--space-7);
}

.apps-list {
  min-width: 0;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.apps-list--grid {
  padding: var(--space-7);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  grid-auto-rows: 124px;
  align-content: start;
  gap: var(--space-7);
}

.apps-list--list {
  display: flex;
  flex-direction: column;
}

.apps-item {
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.apps-list--grid .apps-item {
  min-width: 0;
  border-radius: var(--radius-md);
  padding: var(--space-6) var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  text-align: center;
}

.apps-list--list .apps-item {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border-subtle);
  text-align: left;
}

.apps-list--list .apps-item:last-child {
  border-bottom: 0;
}

.apps-item:hover,
.apps-item.selected {
  border-color: rgba(239, 124, 47, 0.38);
  background: rgba(239, 124, 47, 0.06);
}

.apps-item-icon,
.apps-inspector-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 14px 28px rgba(0, 0, 0, 0.18);
}

[data-theme='light'] .apps-item-icon,
[data-theme='light'] .apps-inspector-icon {
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 8px 20px rgba(0, 0, 0, 0.08);
}

.apps-list--list .apps-item-icon {
  width: 42px;
  height: 42px;
  border-radius: 8px;
}

.apps-item-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.apps-item-copy strong {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 850;
}

.apps-item-copy small {
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.apps-list--grid .apps-item-copy small {
  display: none;
}

.apps-list--list .apps-item-copy strong,
.apps-list--list .apps-item-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apps-status { flex-shrink: 0; }

.apps-list--grid .apps-status {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.apps-inspector {
  min-width: 0;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: var(--space-7);
}

.apps-inspector-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
}

.apps-inspector h2 {
  margin: var(--space-7) 0 var(--space-3);
  font-size: var(--font-size-lg);
  font-weight: 750;
}

.apps-inspector p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.apps-inspector-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 16px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.apps-highlights {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-subtle);
}

.apps-highlight {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.apps-highlight svg {
  color: var(--color-text-muted);
}

.apps-launch {
  margin-top: 20px;
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  background: var(--color-cta);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.apps-launch:disabled {
  cursor: default;
  opacity: 0.45;
}

.knowledge { background: rgba(14, 165, 233, 0.18); color: #7dd3fc; }
.workflow { background: rgba(249, 115, 22, 0.2); color: #fdba74; }
.teams { background: rgba(16, 185, 129, 0.17); color: #6ee7b7; }
.skills { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.research { background: rgba(124, 58, 237, 0.2); color: #c4b5fd; }
.code { background: rgba(59, 130, 246, 0.18); color: #93c5fd; }
.builder { background: rgba(20, 184, 166, 0.18); color: #5eead4; }
.images { background: rgba(236, 72, 153, 0.18); color: #f9a8d4; }
.documents { background: rgba(244, 63, 94, 0.18); color: #fda4af; }
.browser { background: rgba(100, 116, 139, 0.2); color: #cbd5e1; }
.companion { background: rgba(99, 102, 241, 0.18); color: #a5b4fc; }

/* Dark-mode-tuned: pale icon glyphs on a translucent wash read fine against
   the dark surface above but vanish against a white one, so light mode
   swaps each glyph for a deeper shade of the same hue instead. */
[data-theme='light'] .knowledge { background: rgba(14, 165, 233, 0.14); color: #0369a1; }
[data-theme='light'] .workflow { background: rgba(249, 115, 22, 0.14); color: #c2410c; }
[data-theme='light'] .teams { background: rgba(16, 185, 129, 0.14); color: #047857; }
[data-theme='light'] .skills { background: rgba(245, 158, 11, 0.14); color: #b45309; }
[data-theme='light'] .research { background: rgba(124, 58, 237, 0.14); color: #6d28d9; }
[data-theme='light'] .code { background: rgba(59, 130, 246, 0.14); color: #1d4ed8; }
[data-theme='light'] .builder { background: rgba(20, 184, 166, 0.14); color: #0f766e; }
[data-theme='light'] .images { background: rgba(236, 72, 153, 0.14); color: #be185d; }
[data-theme='light'] .documents { background: rgba(244, 63, 94, 0.14); color: #be123c; }
[data-theme='light'] .browser { background: rgba(100, 116, 139, 0.16); color: #334155; }
[data-theme='light'] .companion { background: rgba(99, 102, 241, 0.14); color: #4338ca; }

@media (max-width: 1100px) {
  .apps-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .apps-toolbar-controls {
    justify-content: flex-start;
  }

  .apps-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .apps-list {
    min-height: 420px;
  }

  .apps-inspector {
    min-height: 260px;
  }
}
`
