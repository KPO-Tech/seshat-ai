import { SunOne, Moon, FullScreen, FontSize } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'

export function AppearanceView() {
  const { theme, setTheme } = useUIStore()

  return (
    <div className="sv-view">
      <style>{APPEARANCE_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Appearance</h1>
        </div>
      </header>

      <div className="sv-card">
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon">{theme === 'dark' ? <Moon size={15} /> : <SunOne size={15} />}</div>
            <div>
              <div className="sv-brand-name">Theme</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">
          <div className="appearance-pill-row">
            <button className={`appearance-pill ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
              <Moon size={13} />
              Dark
            </button>
            <button className={`appearance-pill ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
              <SunOne size={13} />
              Light
            </button>
          </div>
        </div>
      </div>

      <div className="sv-grid appearance-grid">
        <div className="sv-card">
          <div className="sv-card-head">
            <div className="sv-card-brand">
              <div className="sv-brand-icon"><FontSize size={15} /></div>
              <div>
                <div className="sv-brand-name">Text scale</div>
              </div>
            </div>
          </div>
          <div className="sv-card-body">
            <div className="appearance-muted">Coming next: compact, comfortable, and large text presets.</div>
          </div>
        </div>

        <div className="sv-card">
          <div className="sv-card-head">
            <div className="sv-card-brand">
              <div className="sv-brand-icon"><FullScreen size={15} /></div>
              <div>
                <div className="sv-brand-name">Density</div>
              </div>
            </div>
          </div>
          <div className="sv-card-body">
            <div className="appearance-muted">Coming next: compact workspace spacing and terminal theme.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const APPEARANCE_CSS = `
.appearance-grid { margin-top: 16px; }
.appearance-pill-row { display: flex; gap: 8px; flex-wrap: wrap; }
.appearance-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: var(--font-size-xs);
  font-weight: 700;
  cursor: pointer;
}
.appearance-pill.active {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}
.appearance-muted { color: var(--color-text-muted); font-size: var(--font-size-sm); }
`
