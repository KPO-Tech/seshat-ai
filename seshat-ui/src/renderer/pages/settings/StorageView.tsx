import { MEMORIES_CSS, StorageCard } from './MemoriesView'

export function StorageView() {
  return (
    <div className="sv-view">
      <style>{MEMORIES_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Storage</h1>
        </div>
      </header>
      <StorageCard />
    </div>
  )
}
