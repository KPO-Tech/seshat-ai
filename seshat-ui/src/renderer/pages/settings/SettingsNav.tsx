import { NexusLogo } from '@/components/NexusLogo'
import { TITLEBAR_HEIGHT } from '@/components/layout/Titlebar'

// Concrete TabId for the Settings page — exported for use in settings/index.tsx.
// Admin-only tabs (users/groups/organizations/workspaces/audit) live
// exclusively in the Admin Console now (apps/admin/index.tsx's own AdminTab
// union) — old ?tab=admin-users style URLs still redirect there via
// settings/index.tsx's plain-string adminRedirects table, which doesn't need
// these in TabId. 'usage' is the one exception: it reuses the Admin
// Console's AdminQuotasView component, but `GET /quotas` has no admin gate
// and is always the caller's own personal counters — it belongs here, not
// behind Admin Console's `isAdmin` wall.
export type TabId = 'general' | 'account' | 'connections' | 'memories' | 'appearance' | 'usage' | 'providers' | 'remote' | 'knowledge' | 'multimodal' | 'mcp' | 'connectors' | 'environment' | 'storage' | 'about'

// ─── Generic nav item ─────────────────────────────────────────────────────────

type NavItemProps<T extends string> = {
  id: T
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: (id: T) => void
  collapsed: boolean
}

export function SettingsNavItem<T extends string>({ id, label, icon, active, onClick, collapsed }: NavItemProps<T>) {
  return (
    <button
      className={`snav-item ${active ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`}
      onClick={() => onClick(id)}
      aria-label={collapsed ? label : undefined}
    >
      <span className="snav-icon">{icon}</span>
      {!collapsed && <span className="snav-label">{label}</span>}
    </button>
  )
}

// ─── Generic sidebar ──────────────────────────────────────────────────────────

type SidebarProps<T extends string> = {
  activeTab: T
  onTabChange: (id: T) => void
  collapsed: boolean
  footer: React.ReactNode
  navGroups: Array<{
    title: string
    items: Array<{ id: T; label: string; icon: React.ReactNode }>
  }>
}

export function SettingsSidebar<T extends string>({ activeTab, onTabChange, collapsed, footer, navGroups }: SidebarProps<T>) {
  return (
    <aside className={`snav-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="snav-header">
        <div className="snav-brand">
          <NexusLogo size={collapsed ? 26 : 22} />
          {!collapsed && <span>SeshatOS</span>}
        </div>
      </div>

      <nav className="snav-nav">
        {navGroups.map((group) => (
          <div key={group.title} className="snav-group">
            {!collapsed && <div className="snav-group-title">{group.title}</div>}
            {group.items.map((item) => (
              <SettingsNavItem
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                active={activeTab === item.id}
                onClick={onTabChange}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="snav-footer">{footer}</div>
    </aside>
  )
}

// ─── Sidebar CSS ──────────────────────────────────────────────────────────────

export const SETTINGS_NAV_CSS = `
.snav-sidebar {
  position: fixed;
  top: ${TITLEBAR_HEIGHT}px;
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10;
}

.snav-sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.snav-header {
  padding: 14px 14px 8px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.snav-sidebar:not(.collapsed) .snav-header {
  justify-content: flex-start;
  padding-left: 16px;
}

.snav-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-lg);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

.snav-nav {
  padding: 10px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
}

.snav-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.snav-group-title {
  font-size: var(--font-size-2xs);
  font-weight: 800;
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
  padding: 0 10px 8px;
  text-transform: uppercase;
}

.snav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.1s;
  width: 100%;
  white-space: nowrap;
}

.snav-item.collapsed {
  justify-content: center;
  padding: 8px 0;
  width: 36px;
  margin: 0 auto;
}

.snav-item:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.snav-item.active {
  background: var(--color-surface-elevated);
  color: var(--color-text);
}

.snav-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.snav-label {
  flex: 1;
}

.snav-footer {
  padding: 10px 10px 16px;
  border-top: 1px solid var(--color-border);
}
`

// ─── Shared layout + view CSS ─────────────────────────────────────────────────

export const SETTINGS_SHARED_CSS = `
.settings-root {
  display: flex;
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  flex: 1;
  font-family: var(--font-sans);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  background: var(--color-surface);
  padding-left: var(--sidebar-width);
  transition: padding-left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-content.collapsed {
  padding-left: var(--sidebar-collapsed-width);
}

.settings-content-inner {
  max-width: 1100px;
  margin: 0 auto;
  /* Bottom padding is deliberately much larger than the other sides - with
     only 28px, the last row of a long list (e.g. Web Search's domain
     categories) sits flush against the window edge with no visible gap,
     so scrolling looks broken/cut-off rather than finished. */
  padding: 28px 32px 96px;
}

/* ── Shared view styles ── */
.sv-view { display: flex; flex-direction: column; }
.sv-view-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.sv-header-info h1 { font-size: var(--font-size-base); font-weight: 700; margin: 0 0 4px; }
.sv-header-info p { color: var(--color-text-muted); margin: 0; font-size: var(--font-size-sm); }

.sv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }

.sv-section { margin-top: 28px; }
.sv-section-header { margin-bottom: 14px; }
.sv-section-header h2 { margin: 0 0 4px; font-size: var(--font-size-base); font-weight: 700; }
.sv-section-header p { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }

.sv-card {
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s;
  /* .sv-view is a column flex container and .sv-card sits directly in it
     (e.g. Multimodal's two cards) - combined with this card's own
     overflow: hidden, a flex item's automatic minimum size no longer
     applies (it only kicks in with overflow: visible), so without this
     the card is free to shrink below its own content height when space
     is tight. It would then just clip itself via that same overflow:
     hidden instead of pushing .sv-view taller and letting the ancestor's
     overflow-y: auto scrollbar engage - silently hiding content with no
     way to reach it, same failure mode as the missing min-height: 0 fix
     one level up, just one level lower in the tree. */
  flex-shrink: 0;
}
.sv-card:focus-within { border-color: var(--color-primary); }

.sv-card-head {
  padding: 14px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.sv-card-brand { display: flex; align-items: center; gap: 10px; }

.sv-brand-icon {
  width: 32px;
  height: 32px;
  background: var(--color-bg);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  border: 1px solid var(--color-border);
}

.sv-brand-name { font-weight: 700; font-size: var(--font-size-sm); }
.sv-brand-sub { font-size: var(--font-size-2xs); color: var(--color-text-muted); }

.sv-card-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; }

.sv-field { display: flex; flex-direction: column; gap: 6px; }
.sv-field label { font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); }

.sv-form-row-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.sv-select-static { border: 1.5px solid var(--color-border); border-radius: 8px; background: var(--color-surface); }
.sv-select-box { padding: 7px 10px; display: flex; align-items: center; justify-content: space-between; font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; color: var(--color-text); }
.sv-selected-preview { display: flex; align-items: center; gap: 8px; }
.sv-mini-icon { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }

.sv-input-box input, .sv-input-box select {
  width: 100%;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  outline: none;
  font-family: inherit;
}
.sv-input-box input:focus, .sv-input-box select:focus { border-color: var(--color-primary); }

.sv-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: var(--color-surface);
  border-radius: 10px;
  border: 1px solid var(--color-border);
}
.sv-toggle-info { display: flex; align-items: flex-start; gap: 8px; color: var(--color-text-secondary); }
.sv-setting-label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); }
.sv-setting-desc { font-size: var(--font-size-2xs); color: var(--color-text-muted); margin-top: 2px; }

.sv-danger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 7px;
  border: 1px solid var(--color-error);
  color: var(--color-error);
  background: transparent;
  border-radius: 8px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.sv-inline-action {
  flex-shrink: 0;
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  background: var(--color-bg);
  border-radius: 7px;
  font-size: var(--font-size-2xs);
  font-weight: 600;
  cursor: pointer;
}
.sv-inline-action:hover { border-color: var(--color-primary); color: var(--color-primary); }

.sv-about-hero { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 36px 0; text-align: center; }
.sv-about-hero h2 { margin: 0; font-size: var(--font-size-base); }
.sv-about-hero p { margin: 0; color: var(--color-text-muted); }

/* ── Footer controls (shared) ── */
.snav-footer-items { display: flex; align-items: center; justify-content: space-between; padding: 0 6px; }
.snav-footer-items.collapsed { flex-direction: column; gap: 12px; padding: 0; }
.snav-footer-btn { display: flex; align-items: center; gap: 6px; background: var(--color-bg); border: 1px solid var(--color-border); padding: 6px 10px; border-radius: 8px; font-size: var(--font-size-xs); font-weight: 600; cursor: pointer; color: var(--color-text); }
.snav-theme-toggle { background: none; border: none; color: var(--color-text-muted); cursor: pointer; padding: 6px; display: flex; border-radius: 7px; }
.snav-theme-toggle:hover { background: var(--color-hover); }

/* ── Shared modals ── */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(2px);
  padding: 24px; box-sizing: border-box;
}
.modal-shell {
  background: var(--color-bg); width: 100%; max-width: 560px;
  border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,0.2);
  animation: slide-up 0.3s ease-out;
  display: flex; flex-direction: column;
  max-height: calc(100vh - 48px); overflow: hidden;
}
.modal-header {
  padding: 14px 18px; display: flex; align-items: center;
  justify-content: space-between; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.modal-header h2 { font-size: var(--font-size-lg); margin: 0; font-weight: 700; color: var(--color-text); }
.modal-close-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; }
.modal-content { padding: 16px 18px; overflow-y: auto; flex: 1; min-height: 0; }
.modal-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.modal-full { grid-column: span 2; }
.modal-field label { display: block; font-size: var(--font-size-sm); font-weight: 700; margin-bottom: 8px; color: var(--color-text); }
.modal-field input, .modal-field textarea { width: 100%; background: var(--color-surface); border: 1.5px solid var(--color-border); padding: 9px 12px; border-radius: 10px; color: var(--color-text); font-size: var(--font-size-sm); outline: none; font-family: inherit; }
.modal-field input:focus, .modal-field textarea:focus { border-color: var(--color-primary); }
.modal-footer {
  padding: 12px 18px; display: flex; justify-content: flex-end; gap: 8px;
  border-top: 1px solid var(--color-border); flex-shrink: 0;
}
.modal-btn-submit { background: var(--color-cta); color: white; border: none; padding: 7px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: var(--font-size-xs); }
.modal-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-btn-cancel { background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); padding: 7px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: var(--font-size-xs); }

@keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
`
