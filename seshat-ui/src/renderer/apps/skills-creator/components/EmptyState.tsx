import { FileCode, Upload } from '@icon-park/react'

// ─── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({ canImport, onImport }: { canImport: boolean; onImport: () => void }) {
  return (
    <div className="sc-empty-state">
      <div className="sc-empty-icon">
        <FileCode size={33} />
      </div>
      <h2>No skill selected</h2>
      <p>
        Select a skill from the sidebar{canImport ? ', or import one from a repository' : ''}.
        {' '}Need a brand new skill, or a bigger rewrite? Ask the main assistant — it has
        direct access to your skills folder on this machine.
      </p>
      {canImport && (
        <button className="sc-empty-btn" onClick={onImport}>
          <Upload size={11} /> Import skills
        </button>
      )}
    </div>
  )
}

