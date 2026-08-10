import { SETTINGS_SHARED_CSS } from './SettingsNav'
import { McpPanel, WORKSPACE_PAGE_CSS } from '../workspace'

export function McpView() {
  return (
    <div className="sv-view">
      <style>{SETTINGS_SHARED_CSS}</style>
      <style>{WORKSPACE_PAGE_CSS}</style>
      <style>{MCP_SETTINGS_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>MCP</h1>
        </div>
      </header>

      <div className="mcp-settings-host">
        <McpPanel />
      </div>
    </div>
  )
}

const MCP_SETTINGS_CSS = `
.mcp-settings-host .sv-card {
  margin: 0;
}
.mcp-settings-host .caps-mcp-header {
  width: 100%;
}
.mcp-settings-host .sv-brand-sub,
.mcp-settings-host .caps-mcp-source-badge {
  display: none;
}
`
