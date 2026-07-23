import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, SettingTwo, LinkOne, Left, SunOne, Moon,
  Logout, Delete, Edit, Check, Close, Down,
  Robot, Write as WriteIcon,
} from '@icon-park/react'
import { SettingsSidebar, SETTINGS_NAV_CSS, SETTINGS_SHARED_CSS } from '../settings/SettingsNav'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'profile' | 'account' | 'connections'

type UserProfile = {
  id: string
  email: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  status: string
  created_at: string
}

type AgentPrefs = {
  preferred_name?: string
  work_type?: string
  agent_instructions?: string
}

// ─── Nav groups ───────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    title: 'USER',
    items: [
      { id: 'profile'     as TabId, label: 'Profile',     icon: <User size={16} theme="outline" /> },
      { id: 'account'     as TabId, label: 'Account',     icon: <SettingTwo size={16} theme="outline" /> },
      { id: 'connections' as TabId, label: 'Connections', icon: <LinkOne size={16} theme="outline" /> },
    ],
  },
]

const WORK_TYPES = [
  'Software Engineering',
  'Data Science',
  'Data Engineering',
  'Machine Learning / AI',
  'DevOps / Platform',
  'Design / Creative',
  'Product Management',
  'Research',
  'Marketing / Growth',
  'Finance',
  'Business / Executive',
  'Other',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string, email: string): string {
  const src = name?.trim() || email || '?'
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  '#EF7C2F', '#6B39CB', '#10A37F', '#4285F4',
  '#D97757', '#C89A6A', '#6FAF7B', '#7D9CCF',
]

function avatarColor(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function UserSettings() {
  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const navigate = useNavigate()
  const { theme, setTheme, sidebarCollapsed } = useUIStore()

  const footer = (
    <div className={`snav-footer-items ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <button
        className="snav-footer-btn"
        onClick={() => navigate(-1)}
        title={sidebarCollapsed ? 'Back' : undefined}
      >
        <Left size={13} />
        {!sidebarCollapsed && <span>Back</span>}
      </button>
      <button
        className="snav-theme-toggle"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <SunOne size={15} /> : <Moon size={15} />}
      </button>
    </div>
  )

  return (
    <div className="settings-root">
      <style>{USER_SETTINGS_CSS}</style>

      <SettingsSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        footer={footer}
        navGroups={NAV_GROUPS}
      />

      <main className={`settings-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="settings-content-inner">
          {activeTab === 'profile'     && <ProfileView />}
          {activeTab === 'account'     && <AccountView />}
          {activeTab === 'connections' && <ConnectionsView />}
        </div>
      </main>
    </div>
  )
}

// ─── Profile view ─────────────────────────────────────────────────────────────

function ProfileView() {
  const storeUser  = useAuthStore((s) => s.user)
  const storeSetUser = useAuthStore((s) => s.updateUser)

  const [profile,  setProfile]  = useState<UserProfile | null>(null)
  const [prefs,    setPrefs]    = useState<AgentPrefs>({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // Full Name
  const [editName, setEditName] = useState(false)
  const [nameVal,  setNameVal]  = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Agent preferred name
  const [editAgentName, setEditAgentName] = useState(false)
  const [agentNameVal,  setAgentNameVal]  = useState('')
  const agentNameRef = useRef<HTMLInputElement>(null)

  // Work type dropdown
  const [workDropOpen, setWorkDropOpen] = useState(false)
  const workDropRef = useRef<HTMLDivElement>(null)

  // Agent instructions
  const [editInstructions, setEditInstructions] = useState(false)
  const [instructionsVal,  setInstructionsVal]  = useState('')
  const instructionsRef = useRef<HTMLTextAreaElement>(null)

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<UserProfile>('/users/me'),
      api.get<AgentPrefs>('/users/me/settings'),
    ])
      .then(([p, s]) => {
        setProfile(p)
        setNameVal(p.display_name || '')
        setPrefs(s || {})
        setAgentNameVal(s?.preferred_name || '')
        setInstructionsVal(s?.agent_instructions || '')
      })
      .catch(() => {
        if (storeUser) {
          const fallback = { ...storeUser, bio: null, avatar_url: null, created_at: '' } as unknown as UserProfile
          setProfile(fallback)
          setNameVal(storeUser.display_name || '')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (editName) nameRef.current?.focus() }, [editName])
  useEffect(() => { if (editAgentName) agentNameRef.current?.focus() }, [editAgentName])
  useEffect(() => { if (editInstructions) instructionsRef.current?.focus() }, [editInstructions])

  // Close work dropdown on outside click
  useEffect(() => {
    if (!workDropOpen) return
    function handler(e: MouseEvent) {
      if (workDropRef.current && !workDropRef.current.contains(e.target as Node)) {
        setWorkDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [workDropOpen])

  async function saveName() {
    if (!profile || !nameVal.trim()) return
    setSaving(true); setError('')
    try {
      const updated = await api.put<UserProfile>('/users/me', { display_name: nameVal.trim() })
      setProfile(updated)
      setNameVal(updated.display_name)
      if (storeUser) {
        const nextUser = { ...storeUser, display_name: updated.display_name }
        storeSetUser(nextUser)
        void window.nexus?.auth?.updateUser(nextUser).catch(() => {})
      }
      setEditName(false)
    } catch (e: unknown) { setError((e as { message?: string })?.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  async function saveSettings(patch: Partial<AgentPrefs>) {
    setSaving(true); setError('')
    try {
      const merged = { ...prefs, ...patch }
      const updated = await api.put<AgentPrefs>('/users/me/settings', merged)
      setPrefs(updated)
      return updated
    } catch (e: unknown) { setError((e as { message?: string })?.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  async function saveAgentName() {
    const updated = await saveSettings({ preferred_name: agentNameVal.trim() || undefined })
    if (updated) { setAgentNameVal(updated.preferred_name || ''); setEditAgentName(false) }
  }

  async function saveWorkType(wt: string) {
    setWorkDropOpen(false)
    await saveSettings({ work_type: wt })
  }

  async function saveInstructions() {
    const updated = await saveSettings({ agent_instructions: instructionsVal.trim() || undefined })
    if (updated) { setInstructionsVal(updated.agent_instructions || ''); setEditInstructions(false) }
  }

  if (loading) return (
    <div className="sv-view">
      <header className="sv-view-header"><div className="sv-header-info"><h1>Profile</h1></div></header>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading…</p>
    </div>
  )

  if (!profile) return null

  const initials = getInitials(profile.display_name, profile.email)
  const color    = avatarColor(profile.email)

  return (
    <div className="sv-view">
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Profile</h1>
          <p>Your identity and preferences on SeshatOS</p>
        </div>
      </header>

      {/* ── Identity card ── */}
      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="up-avatar" style={{ background: color }}>{initials}</div>
            <div>
              <div className="sv-brand-name">{profile.display_name || profile.email}</div>
              <div className="sv-brand-sub">{profile.email}</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">

          {/* Full Name */}
          <div className="sv-field">
            <label>Full Name</label>
            {editName ? (
              <div className="up-inline-edit">
                <div className="sv-input-box" style={{ flex: 1 }}>
                  <input
                    ref={nameRef}
                    value={nameVal}
                    onChange={(e) => setNameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName()
                      if (e.key === 'Escape') { setEditName(false); setNameVal(profile.display_name) }
                    }}
                    maxLength={80}
                  />
                </div>
                <button className="up-confirm-btn" onClick={saveName} disabled={saving}><Check size={12} /></button>
                <button className="up-cancel-btn" onClick={() => { setEditName(false); setNameVal(profile.display_name) }}><Close size={12} /></button>
              </div>
            ) : (
              <div className="up-field-editable" onClick={() => setEditName(true)}>
                <span>{profile.display_name || <em style={{ color: 'var(--color-text-muted)' }}>Not set</em>}</span>
                <Edit size={11} className="up-edit-hint" />
              </div>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="sv-field">
            <label>Email</label>
            <div className="sv-input-box"><input type="text" value={profile.email} readOnly /></div>
          </div>

        </div>
      </div>

      {/* ── Agent Preferences card ── */}
      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><Robot size={15} /></div>
            <div>
              <div className="sv-brand-name">Agent Preferences</div>
              <div className="sv-brand-sub">How SeshatOS agents interact with you</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">

          {/* What should agents call you? */}
          <div className="sv-field">
            <label>What should Agents call you?</label>
            {editAgentName ? (
              <div className="up-inline-edit">
                <div className="sv-input-box" style={{ flex: 1 }}>
                  <input
                    ref={agentNameRef}
                    value={agentNameVal}
                    onChange={(e) => setAgentNameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveAgentName()
                      if (e.key === 'Escape') { setEditAgentName(false); setAgentNameVal(prefs.preferred_name || '') }
                    }}
                    placeholder="e.g. Alex, Chef, Boss…"
                    maxLength={40}
                  />
                </div>
                <button className="up-confirm-btn" onClick={saveAgentName} disabled={saving}><Check size={12} /></button>
                <button className="up-cancel-btn" onClick={() => { setEditAgentName(false); setAgentNameVal(prefs.preferred_name || '') }}><Close size={12} /></button>
              </div>
            ) : (
              <div className="up-field-editable" onClick={() => setEditAgentName(true)}>
                <span>{prefs.preferred_name || <em style={{ color: 'var(--color-text-muted)' }}>Same as your full name</em>}</span>
                <Edit size={11} className="up-edit-hint" />
              </div>
            )}
          </div>

          {/* What best describes your work? */}
          <div className="sv-field">
            <label>What best describes your work?</label>
            <div className="up-work-select" ref={workDropRef}>
              <button
                className="up-work-trigger"
                onClick={() => setWorkDropOpen((v) => !v)}
              >
                <span style={{ color: prefs.work_type ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                  {prefs.work_type || 'Select your role…'}
                </span>
                <Down size={11} style={{ color: 'var(--color-text-muted)', transform: workDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {workDropOpen && (
                <div className="up-work-dropdown">
                  {WORK_TYPES.map((wt) => (
                    <button
                      key={wt}
                      className={`up-work-option ${prefs.work_type === wt ? 'active' : ''}`}
                      onClick={() => saveWorkType(wt)}
                    >
                      {wt}
                      {prefs.work_type === wt && <Check size={11} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Instructions for Agents */}
          <div className="sv-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ marginBottom: 0 }}>Instructions for Agents</label>
              {!editInstructions && (
                <button className="up-ghost-btn" onClick={() => setEditInstructions(true)}>
                  <WriteIcon size={11} /> Edit
                </button>
              )}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              SeshatOS will keep these in mind across all chats.
            </p>
            {editInstructions ? (
              <>
                <textarea
                  ref={instructionsRef}
                  value={instructionsVal}
                  onChange={(e) => setInstructionsVal(e.target.value)}
                  placeholder="e.g. Always respond in French. Prefer concise answers. Assume I have a CS background."
                  maxLength={2000}
                  rows={5}
                  className="up-textarea"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flex: 1 }}>{instructionsVal.length}/2000</span>
                  <button className="up-ghost-btn" onClick={() => { setEditInstructions(false); setInstructionsVal(prefs.agent_instructions || '') }}>Cancel</button>
                  <button className="up-primary-btn" onClick={saveInstructions} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </>
            ) : (
              <div
                className="up-instructions-preview"
                onClick={() => setEditInstructions(true)}
              >
                {prefs.agent_instructions
                  ? <span style={{ whiteSpace: 'pre-wrap' }}>{prefs.agent_instructions}</span>
                  : <em>No instructions yet. Click to add.</em>
                }
              </div>
            )}
          </div>

        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(201,107,92,0.1)', border: '1px solid rgba(201,107,92,0.3)', padding: '10px 14px', borderRadius: 8, color: 'var(--color-error)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {profile.created_at && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
          Member since {new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
        </p>
      )}
    </div>
  )
}

// ─── Account view ─────────────────────────────────────────────────────────────

function AccountView() {
  const { logout, user } = useAuthStore()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try { await api.post('/auth/logout') } catch { /* best-effort */ }
    logout()
    navigate('/login', { replace: true })
  }

  function closeDeleteModal() {
    if (deleting) return
    setDeleteOpen(false)
    setConfirmEmail('')
    setDeleteError('')
  }

  async function handleDeleteAccount() {
    if (!user) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete('/users/me', { confirm_email: confirmEmail.trim() })
      logout()
      navigate('/login', { replace: true })
    } catch (e: unknown) {
      setDeleteError((e as { message?: string })?.message ?? 'Failed to close account')
    } finally {
      setDeleting(false)
    }
  }

  const canDelete = !!user && confirmEmail.trim().toLowerCase() === user.email.trim().toLowerCase()

  return (
    <div className="sv-view">
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Account</h1>
          <p>Manage your session and account security</p>
        </div>
      </header>

      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><Logout size={15} /></div>
            <div>
              <div className="sv-brand-name">Session</div>
              <div className="sv-brand-sub">Your active login session on this device</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">
          <div className="sv-toggle-row">
            <div className="sv-toggle-info">
              <div>
                <div className="sv-setting-label">Sign out</div>
                <div className="sv-setting-desc">End your current session. You will need to log in again.</div>
              </div>
            </div>
            <button className="up-ghost-btn" onClick={handleLogout} disabled={loggingOut} style={{ flexShrink: 0 }}>
              <Logout size={12} />
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>

      <div className="sv-card" style={{ borderColor: 'rgba(201,107,92,0.3)' }}>
        <div className="sv-card-head" style={{ background: 'rgba(201,107,92,0.05)' }}>
          <div className="sv-card-brand">
            <div className="sv-brand-icon" style={{ borderColor: 'rgba(201,107,92,0.3)', color: 'var(--color-error)' }}><Delete size={15} /></div>
            <div>
              <div className="sv-brand-name" style={{ color: 'var(--color-error)' }}>Danger zone</div>
              <div className="sv-brand-sub">Access is revoked immediately after confirmation</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">
          <div className="sv-toggle-row">
            <div className="sv-toggle-info">
              <div>
                <div className="sv-setting-label">Delete account</div>
                <div className="sv-setting-desc">Disable this account, revoke its sessions and API keys, and sign out everywhere.</div>
              </div>
            </div>
            <button className="sv-danger-btn" onClick={() => setDeleteOpen(true)} style={{ width: 'auto', padding: '8px 16px', flexShrink: 0 }}>
              <Delete size={12} /> Delete account
            </button>
          </div>
        </div>
      </div>

      {deleteOpen && user && (
        <div className="modal-backdrop" onClick={closeDeleteModal}>
          <div className="modal-shell up-delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete account</h2>
              <button className="modal-close-btn" onClick={closeDeleteModal}><Close size={15} /></button>
            </div>
            <div className="modal-content">
              <p className="up-delete-copy">
                This closes your SeshatOS account immediately. To confirm, type <strong>{user.email}</strong> below.
              </p>
              <div className="modal-field">
                <label>Confirm your email</label>
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder={user.email}
                  autoFocus
                />
              </div>
              {deleteError && <div className="up-inline-error">{deleteError}</div>}
            </div>
            <div className="modal-footer">
              <button className="modal-btn-cancel" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
              <button className="sv-danger-btn up-delete-submit" onClick={handleDeleteAccount} disabled={!canDelete || deleting}>
                <Delete size={12} />
                {deleting ? 'Closing account…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Connections view ─────────────────────────────────────────────────────────

function ConnectionsView() {
  const navigate = useNavigate()

  return (
    <div className="sv-view">
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Connections</h1>
          <p>Linked accounts will live here once SeshatOS exposes dedicated identity integrations.</p>
        </div>
      </header>

      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><LinkOne size={15} /></div>
            <div>
              <div className="sv-brand-name">Provider auth moved</div>
              <div className="sv-brand-sub">Model provider connections now belong to Settings → Providers</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body up-connection-stack">
          <div className="up-support-note">
            OpenAI OAuth is now configured from the provider settings screen so it stays separate from SeshatOS account login and register flows.
          </div>
          <div className="up-connection-actions">
            <button className="up-primary-btn" onClick={() => navigate('/settings?tab=providers')}>
              Open Providers settings
            </button>
          </div>
        </div>
      </div>

      <div className="sv-card">
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><LinkOne size={15} /></div>
            <div>
              <div className="sv-brand-name">Coming next</div>
              <div className="sv-brand-sub">GitHub, Google, Slack, and other user-linked accounts can be added here later</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">
          <div className="up-support-note">
            This page is now reserved for identity and account-linking flows rather than runtime model providers.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const USER_SETTINGS_CSS = `
${SETTINGS_NAV_CSS}
${SETTINGS_SHARED_CSS}

/* ── Avatar ── */
.up-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
  color: white;
  flex-shrink: 0;
}

/* ── Inline field edit ── */
.up-inline-edit { display: flex; align-items: center; gap: 6px; }
.up-confirm-btn { background: none; border: none; padding: 6px; border-radius: 5px; cursor: pointer; color: var(--color-success); display: flex; }
.up-confirm-btn:hover { background: rgba(111,175,123,0.12); }
.up-confirm-btn:disabled { opacity: 0.4; cursor: default; }
.up-cancel-btn  { background: none; border: none; padding: 6px; border-radius: 5px; cursor: pointer; color: var(--color-text-muted); display: flex; }
.up-cancel-btn:hover { background: var(--color-hover); }

.up-field-editable {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px; border-radius: 8px;
  font-size: 12px; color: var(--color-text);
  cursor: pointer; transition: background 0.1s;
  border: 1.5px solid transparent;
}
.up-field-editable:hover { background: var(--color-hover); border-color: var(--color-border); }
.up-edit-hint { color: var(--color-text-muted); opacity: 0; transition: opacity 0.1s; flex-shrink: 0; }
.up-field-editable:hover .up-edit-hint { opacity: 1; }

/* ── Work type select ── */
.up-work-select { position: relative; }
.up-work-trigger {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 11px; border-radius: 8px;
  background: var(--color-surface); border: 1.5px solid var(--color-border);
  font-size: 12px; font-weight: 500; cursor: pointer;
  transition: border-color 0.15s; font-family: inherit;
}
.up-work-trigger:hover { border-color: var(--color-text-muted); }
.up-work-dropdown {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  background: var(--color-bg); border: 1.5px solid var(--color-border);
  border-radius: 9px; overflow: hidden; z-index: 50;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  max-height: 280px; overflow-y: auto;
}
.up-work-option {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 7px 11px; background: none; border: none;
  font-size: 12px; font-weight: 500; color: var(--color-text-secondary);
  cursor: pointer; text-align: left; font-family: inherit; transition: background 0.1s;
}
.up-work-option:hover { background: var(--color-hover); color: var(--color-text); }
.up-work-option.active { color: var(--color-primary); font-weight: 600; }

/* ── Agent instructions ── */
.up-textarea {
  width: 100%; background: var(--color-surface);
  border: 1.5px solid var(--color-primary);
  padding: 8px 10px; border-radius: 8px;
  color: var(--color-text); font-size: 12px; line-height: 1.6;
  outline: none; font-family: inherit; resize: vertical;
  box-sizing: border-box;
}
.up-instructions-preview {
  min-height: 60px; padding: 8px 10px; border-radius: 8px;
  font-size: 12px; line-height: 1.6; cursor: pointer;
  border: 1.5px solid transparent; transition: background 0.1s, border-color 0.1s;
  color: var(--color-text-secondary);
}
.up-instructions-preview:hover { background: var(--color-hover); border-color: var(--color-border); }
.up-instructions-preview em { color: var(--color-text-muted); font-style: italic; }

/* ── Shared action buttons ── */
.up-ghost-btn {
  background: none; border: 1px solid var(--color-border);
  color: var(--color-text-secondary); font-size: 11px; font-weight: 600;
  display: flex; align-items: center; gap: 5px; cursor: pointer;
  padding: 5px 10px; border-radius: 6px; transition: background 0.1s;
  font-family: inherit;
}
.up-ghost-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.up-ghost-btn:disabled { opacity: 0.45; cursor: default; }

.up-primary-btn {
  background: var(--color-primary); color: white; border: none;
  font-size: 11px; font-weight: 600; display: flex; align-items: center;
  gap: 5px; cursor: pointer; padding: 6px 13px; border-radius: 6px;
  font-family: inherit;
}
.up-primary-btn:hover:not(:disabled) { opacity: 0.9; }
.up-primary-btn:disabled { opacity: 0.5; cursor: default; }

/* ── Account deletion / connections ── */
.up-delete-modal { max-width: 560px; }
.up-delete-copy {
  margin: 0 0 18px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.up-delete-submit {
  width: auto;
  padding: 6px 13px;
}
.up-inline-error {
  margin-top: 14px;
  border: 1px solid var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  color: var(--color-error);
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 11px;
  line-height: 1.5;
}
.up-connection-stack { display: flex; flex-direction: column; gap: 12px; }
.up-connection-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}
.up-connection-meta { display: flex; flex-direction: column; gap: 11px; }
.up-connection-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.up-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border-radius: 779px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  background: var(--color-surface);
}
.up-status-chip.connected {
  color: var(--color-success);
  border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border));
}
.up-status-chip.pending {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
}
.up-status-chip.error {
  color: var(--color-error);
  border-color: color-mix(in srgb, var(--color-error) 35%, var(--color-border));
}
.up-connection-note {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 11px;
  border-radius: 11px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
.up-connection-code {
  margin: 10px 0 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--color-text);
}
.up-support-note {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .up-connection-grid { grid-template-columns: 1fr; }
  .up-connection-actions { justify-content: flex-start; }
  .up-connection-note { flex-direction: column; }
}
`
