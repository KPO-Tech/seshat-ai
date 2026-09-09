import { Book } from '@icon-park/react'
import { PlannedFeatureCard } from '@/components/ui/PlannedFeatureCard'

export function PublicLibraryModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="k-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="k-public-modal" role="dialog" aria-modal="true" aria-label="Public knowledge library" onMouseDown={(e) => e.stopPropagation()}>
        <div className="k-public-head">
          <div>
            <h2>Public Library</h2>
            <p>Shared collections will be includable here once the public catalog API is connected.</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <PlannedFeatureCard
          icon={<Book size={24} />}
          title="No public catalog connected yet"
          description="Admin-added company knowledge should come from Seshat Server and be included by default. Public community knowledge should stay opt-in."
          note="Requires an organization server with a shared knowledge catalog - see Settings -> Cloud Automation."
        />
      </section>
    </div>
  )
}
