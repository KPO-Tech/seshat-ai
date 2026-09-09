import { useState } from 'react'
import { Close, Sync, Upload } from '@icon-park/react'
import { api } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { CatalogEntry, RepoInfo } from '../api/types'

// ─── Repo manager modal ───────────────────────────────────────────────────────

function repoNameFromURL(url: string): string {
  return url.replace(/\.git$/, '').split('/').filter(Boolean).pop() ?? url
}

export function RepoManagerModal({ catalog, installed, onChanged }: {
  catalog: CatalogEntry[]
  installed: RepoInfo[]
  onChanged: () => void
}) {
  const [url, setUrl] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [localInstalled, setLocalInstalled] = useState<Set<string>>(
    () => new Set([...catalog.filter(c => c.installed).map(c => c.name), ...installed.map(r => r.name)])
  )

  const installRepo = async (repoUrl: string) => {
    const name = repoNameFromURL(repoUrl)
    setInstalling(repoUrl)
    setErr(null)
    try {
      await api.post('/skills/repos', { url: repoUrl })
      setLocalInstalled(s => { const n = new Set(s); n.add(name); return n })
      setUrl('')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to install')
    } finally {
      setInstalling(null)
    }
  }

  const uninstallRepo = async (name: string) => {
    setUninstalling(name)
    setErr(null)
    try {
      await api.delete(`/skills/repos/${encodeURIComponent(name)}`)
      setLocalInstalled(s => { const n = new Set(s); n.delete(name); return n })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to uninstall')
    } finally {
      setUninstalling(null)
    }
  }

  // Repos installed but not in catalog
  const installedNames = localInstalled
  const uncataloged = installed.filter(r => !catalog.some(c => c.name === r.name) && installedNames.has(r.name))

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onChanged()}>
      <div className="modal-shell repo-modal-shell">
        <div className="modal-header">
          <h2>Import skills</h2>
          <button className="modal-close-btn" onClick={onChanged}><WindowCloseIcon size={16} /></button>
        </div>
        <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {err && <div className="caps-error">{err}</div>}

          <div className="sv-field">
            <label>Install from GitHub</label>
            <div className="repo-url-row">
              <div className="sv-input-box" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://github.com/user/skill-collection"
                  onKeyDown={e => e.key === 'Enter' && url.trim() && installRepo(url.trim())}
                />
              </div>
              <button
                className="caps-reload-btn"
                disabled={!url.trim() || !!installing}
                onClick={() => installRepo(url.trim())}
              >
                {installing && installing === url.trim() ? <Sync size={10} /> : <Upload size={10} />}
                {installing && installing === url.trim() ? 'Installing…' : 'Install'}
              </button>
            </div>
          </div>

          {catalog.length > 0 && (
            <div>
              <div className="repo-section-title">Featured collections</div>
              <div className="repo-catalog-list">
                {catalog.map(entry => {
                  const isInstalled = installedNames.has(entry.name)
                  const isUninstalling = uninstalling === entry.name
                  const isInstalling = installing === entry.url
                  return (
                    <div key={entry.name} className="repo-catalog-entry">
                      <div className="repo-entry-info">
                        <div className="repo-entry-name">
                          {entry.name}
                          {entry.source === 'organization' && (
                            <span className="repo-origin-badge">from your organization</span>
                          )}
                        </div>
                        {entry.description && <div className="repo-entry-desc">{entry.description}</div>}
                      </div>
                      {isInstalled ? (
                        <button
                          className="repo-uninstall-btn"
                          onClick={() => uninstallRepo(entry.name)}
                          disabled={isUninstalling}
                        >
                          <Close size={10} />
                          {isUninstalling ? 'Removing…' : 'Uninstall'}
                        </button>
                      ) : (
                        <button
                          className="repo-install-btn"
                          onClick={() => installRepo(entry.url)}
                          disabled={!!installing}
                        >
                          {isInstalling ? <Sync size={10} /> : <Upload size={10} />}
                          {isInstalling ? 'Installing…' : 'Install'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {uncataloged.length > 0 && (
            <div>
              <div className="repo-section-title">Other installed</div>
              <div className="repo-catalog-list">
                {uncataloged.map(repo => (
                  <div key={repo.name} className="repo-catalog-entry">
                    <div className="repo-entry-info">
                      <div className="repo-entry-name">{repo.name}</div>
                      <div className="repo-entry-desc">{repo.skill_count} skill{repo.skill_count !== 1 ? 's' : ''}</div>
                    </div>
                    <button
                      className="repo-uninstall-btn"
                      onClick={() => uninstallRepo(repo.name)}
                      disabled={uninstalling === repo.name}
                    >
                      <Close size={10} />
                      {uninstalling === repo.name ? 'Removing…' : 'Uninstall'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn-submit" onClick={onChanged}>Done</button>
        </div>
      </div>
    </div>
  )
}

