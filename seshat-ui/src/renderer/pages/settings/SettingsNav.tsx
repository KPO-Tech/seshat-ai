import { NexusLogo } from '@/components/NexusLogo'

// Concrete TabId for the Settings page — exported for use in settings/index.tsx
export type TabId = 'general' | 'providers' | 'knowledge' | 'memories' | 'capabilities' | 'remote' | 'system' | 'about' | 'admin-users' | 'admin-groups' | 'admin-organizations' | 'admin-workspaces' | 'admin-audit' | 'admin-quotas'

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
      title={collapsed ? label : undefined}
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
          <NexusLogo size={collapsed ? 32 : 28} />
          {!collapsed && <span>Nexus</span>}
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
  top: 42px;
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
  padding: 28px 20px 20px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.snav-sidebar:not(.collapsed) .snav-header {
  justify-content: flex-start;
  padding-left: 24px;
}

.snav-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

.snav-nav {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 28px;
  overflow-y: auto;
}

.snav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.snav-group-title {
  font-size: 11px;
  font-weight: 800;
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
  padding: 0 12px 10px;
  text-transform: uppercase;
}

.snav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.1s;
  width: 100%;
  white-space: nowrap;
}

.snav-item.collapsed {
  justify-content: center;
  padding: 10px 0;
  width: 44px;
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
  padding: 16px 12px 32px;
  border-top: 1px solid var(--color-border);
}
`

// ─── Shared layout + view CSS (used by both Settings and UserSettings) ────────

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
  max-width: 1200px;
  margin: 0 auto;
  padding: 48px 60px;
}

/* ── Shared view styles ── */
.sv-view { display: flex; flex-direction: column; }
.sv-view-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 40px; }
.sv-header-info h1 { font-size: 26px; font-weight: 700; margin: 0 0 6px; }
.sv-header-info p { color: var(--color-text-muted); margin: 0; font-size: 15px; }

.sv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 24px; }

.sv-card {
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color 0.2s;
}
.sv-card:focus-within { border-color: var(--color-primary); }

.sv-card-head {
  padding: 20px 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.sv-card-brand { display: flex; align-items: center; gap: 16px; }

.sv-brand-icon {
  width: 40px;
  height: 40px;
  background: var(--color-bg);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  border: 1px solid var(--color-border);
}

.sv-brand-name { font-weight: 700; font-size: 15px; }
.sv-brand-sub { font-size: 12px; color: var(--color-text-muted); }

.sv-card-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

.sv-field { display: flex; flex-direction: column; gap: 8px; }
.sv-field label { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); }

.sv-form-row-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.sv-select-static { border: 1.5px solid var(--color-border); border-radius: 10px; background: var(--color-surface); }
.sv-select-box { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; cursor: pointer; color: var(--color-text); }
.sv-selected-preview { display: flex; align-items: center; gap: 10px; }
.sv-mini-icon { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }

.sv-input-box input, .sv-input-box select {
  width: 100%;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  padding: 10px 16px;
  border-radius: 10px;
  color: var(--color-text);
  font-size: 14px;
  outline: none;
  font-family: inherit;
}
.sv-input-box input:focus, .sv-input-box select:focus { border-color: var(--color-primary); }

.sv-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
}
.sv-toggle-info { display: flex; align-items: flex-start; gap: 12px; color: var(--color-text-secondary); }
.sv-setting-label { font-size: 14px; font-weight: 600; color: var(--color-text); }
.sv-setting-desc { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }

.sv-danger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-error);
  color: var(--color-error);
  background: transparent;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.sv-about-hero { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 60px 0; text-align: center; }
.sv-about-hero h2 { margin: 0; font-size: 24px; }
.sv-about-hero p { margin: 0; color: var(--color-text-muted); }

/* ── Footer controls (shared) ── */
.snav-footer-items { display: flex; align-items: center; justify-content: space-between; padding: 0 8px; }
.snav-footer-items.collapsed { flex-direction: column; gap: 16px; padding: 0; }
.snav-footer-btn { display: flex; align-items: center; gap: 10px; background: var(--color-bg); border: 1px solid var(--color-border); padding: 7px 14px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--color-text); }
.snav-theme-toggle { background: none; border: none; color: var(--color-text-muted); cursor: pointer; padding: 8px; display: flex; border-radius: 8px; }
.snav-theme-toggle:hover { background: var(--color-hover); }

/* ── Shared modals ── */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(2px);
  padding: 24px; box-sizing: border-box;
}
.modal-shell {
  background: var(--color-bg); width: 100%; max-width: 680px;
  border-radius: 20px; box-shadow: 0 30px 80px rgba(0,0,0,0.2);
  animation: slide-up 0.3s ease-out;
  display: flex; flex-direction: column;
  max-height: calc(100vh - 48px); overflow: hidden;
}
.modal-header {
  padding: 20px 28px; display: flex; align-items: center;
  justify-content: space-between; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.modal-header h2 { font-size: 18px; margin: 0; font-weight: 700; color: var(--color-text); }
.modal-close-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; }
.modal-content { padding: 24px 28px; overflow-y: auto; flex: 1; min-height: 0; }
.modal-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.modal-full { grid-column: span 2; }
.modal-field label { display: block; font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--color-text); }
.modal-field input, .modal-field textarea { width: 100%; background: var(--color-surface); border: 1.5px solid var(--color-border); padding: 12px 16px; border-radius: 12px; color: var(--color-text); font-size: 14px; outline: none; font-family: inherit; }
.modal-field input:focus, .modal-field textarea:focus { border-color: var(--color-primary); }
.modal-footer {
  padding: 16px 28px; display: flex; justify-content: flex-end; gap: 12px;
  border-top: 1px solid var(--color-border); flex-shrink: 0;
}
.modal-btn-submit { background: var(--color-cta); color: white; border: none; padding: 9px 22px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 13px; }
.modal-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-btn-cancel { background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); padding: 9px 22px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 13px; }

@keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
`
