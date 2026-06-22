import { NexusLogo } from '@/components/NexusLogo'

export function AboutView() {
  return (
    <div className="sv-view">
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>About</h1>
        </div>
      </header>
      <div className="sv-about-hero">
        <NexusLogo size={100} />
        <h2>SeshatOS OS</h2>
        <p>Version 0.1.0-alpha • Desktop Orchestration Runtime</p>
      </div>
    </div>
  )
}
