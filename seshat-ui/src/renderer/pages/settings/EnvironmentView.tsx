import { Plus, Terminal, Lock } from '@icon-park/react'

export function EnvironmentView() {
  return (
    <div className="sv-view">
      <style>{ENVIRONMENT_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Environment</h1>
        </div>
        <button className="env-primary-btn" disabled>
          <Plus size={13} />
          Add variable
        </button>
      </header>

      <div className="env-hero">
        <div className="env-icon"><Terminal size={18} /></div>
        <div>
          <h2>Local environment variables</h2>
          <p>API keys and tokens for local agents and MCP servers will live here.</p>
        </div>
      </div>

      <div className="env-empty">
        <Lock size={22} />
        <div>
          <strong>No local variables yet</strong>
          <p>Backend support is the next step: encrypted storage, masked values, and runtime injection.</p>
        </div>
      </div>
    </div>
  )
}

const ENVIRONMENT_CSS = `
.env-primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 8px;
  padding: 7px 13px;
  background: var(--color-cta);
  color: white;
  font-size: var(--font-size-xs);
  font-weight: 700;
}
.env-primary-btn:disabled { opacity: 0.45; }
.env-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  padding: 18px;
  margin-bottom: 16px;
}
.env-icon {
  width: 42px;
  height: 42px;
  border-radius: 9px;
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  background: var(--color-surface);
}
.env-hero h2 { margin: 0 0 4px; font-size: var(--font-size-base); }
.env-hero p, .env-empty p { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.env-empty {
  min-height: 260px;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-muted);
  text-align: center;
}
.env-empty strong { display: block; color: var(--color-text); margin-bottom: 6px; }
`
