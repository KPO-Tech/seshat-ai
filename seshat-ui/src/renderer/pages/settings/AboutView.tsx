import { useEffect, useState } from 'react'
import { NexusLogo } from '@/components/NexusLogo'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloaded' | 'error'

export function AboutView() {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    window.nexus?.getVersion().then((v: string) => setVersion(v))
  }, [])

  useEffect(() => {
    if (!window.nexus?.updates) return
    const offAvailable = window.nexus.updates.onAvailable(() => setStatus('available'))
    const offNotAvailable = window.nexus.updates.onNotAvailable(() => setStatus('up-to-date'))
    const offDownloaded = window.nexus.updates.onDownloaded(() => setStatus('downloaded'))
    const offError = window.nexus.updates.onError(({ message }) => {
      setStatus('error')
      setErrorMessage(message)
    })
    return () => {
      offAvailable()
      offNotAvailable()
      offDownloaded()
      offError()
    }
  }, [])

  async function handleCheck() {
    if (!window.nexus?.updates) return
    setStatus('checking')
    setErrorMessage(null)
    const result = await window.nexus.updates.checkNow()
    if (!result.ok) {
      setStatus('error')
      setErrorMessage(result.error ?? 'Update check failed')
    }
    // On success, the actual outcome (available/not-available) arrives via
    // the onAvailable/onNotAvailable events above, not this response.
  }

  function handleRestart() {
    window.nexus?.updates?.quitAndInstall()
  }

  return (
    <div className="sv-view">
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>About</h1>
        </div>
      </header>
      <div className="sv-about-hero">
        <NexusLogo size={82} />
        <h2>SeshatOS</h2>
        <p>Version {version || '…'} • Desktop Orchestration Runtime</p>

        <div className="sv-about-updates">
          {status === 'downloaded' ? (
            <button className="kv-emb-save-btn" onClick={handleRestart} type="button">
              Restart to apply update
            </button>
          ) : (
            <button className="kv-emb-test-btn" onClick={handleCheck} disabled={status === 'checking'} type="button">
              {status === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          )}
          {status === 'up-to-date' && <span className="sv-about-update-note">You're up to date.</span>}
          {status === 'available' && <span className="sv-about-update-note">Downloading update…</span>}
          {status === 'error' && errorMessage && <span className="sv-about-update-note">{errorMessage}</span>}
        </div>
      </div>
    </div>
  )
}
