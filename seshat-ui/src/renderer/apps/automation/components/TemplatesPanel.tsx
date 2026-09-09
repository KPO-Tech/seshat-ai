import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Close, Search } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import type { AutomationTemplate } from '../api/types'
import type { NodeDescription } from '../graph/types'

type Props = {
  // Already fetched by AutomationPage alongside its other catalog data - the
  // requirements checklist below is derived from this, not a new backend
  // field, so a template stays honest about "what kind of resource this
  // needs" without claiming to verify an org's actual secrets (see the
  // audit doc's Tier 3.3 entry for why that's the right level of ambition).
  nodeTypes: NodeDescription[]
}

function nodeLabel(type: string, nodeTypes: NodeDescription[]): string {
  return nodeTypes.find((nt) => nt.type === type)?.name ?? type
}

function deriveRequirements(template: AutomationTemplate, nodeTypes: NodeDescription[]): string[] {
  const byType = new Map(nodeTypes.map((nt) => [nt.type, nt]))
  const requirements = new Set<string>()
  for (const node of template.definition.nodes) {
    if (node.type === 'agent') requirements.add('An Agent')
    const desc = byType.get(node.type)
    for (const prop of desc?.properties ?? []) {
      if (prop.type === 'secretRef') requirements.add(prop.displayName || 'A connection')
    }
  }
  return [...requirements]
}

// Tier 3.3 - a searchable catalogue of Seshat-authored templates, replacing
// the "Coming soon" stub previously wired to the Templates rail item (see
// AutomationPage.tsx). Deliberately client-side search/filter over a small
// fetched list (same weight as SecretRefField's own filtering) - the
// catalog is a handful of built-in templates today, not a paginated,
// hosted one (see automation.Service.ListTemplates's doc comment).
export function TemplatesPanel({ nodeTypes }: Props) {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<AutomationTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<{ templates: AutomationTemplate[] }>('/dataflow/templates')
      .then((res) => { if (!cancelled) setTemplates(res.templates ?? []) })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load templates.') })
    return () => { cancelled = true }
  }, [])

  const categories = useMemo(() => [...new Set((templates ?? []).map((t) => t.category))].sort(), [templates])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (templates ?? []).filter((t) =>
      (!category || t.category === category)
      && (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    )
  }, [templates, search, category])

  const preview = (templates ?? []).find((t) => t.id === previewId) ?? null

  function useTemplate(template: AutomationTemplate) {
    navigate(`/automation/new?template=${encodeURIComponent(template.id)}`)
  }

  return (
    <div className="au-templates">
      <style>{TEMPLATES_PANEL_CSS}</style>
      <div className="au-templates-toolbar">
        <div className="au-templates-search-row">
          <Search size={14} className="au-templates-search-icon" />
          <input
            className="au-templates-search"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
          />
        </div>
        <select className="au-var-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {templates === null ? (
        <div className="au-loading">Loading…</div>
      ) : error ? (
        <div className="au-loading au-loading-error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="au-stub">
          <h2>No templates found</h2>
          <p>Try a different search or category.</p>
        </div>
      ) : (
        <div className="au-templates-grid">
          {filtered.map((t) => (
            <button key={t.id} type="button" className="au-templates-card" onClick={() => setPreviewId(t.id)}>
              <span className="au-templates-card-category">{t.category}</span>
              <span className="au-templates-card-name">{t.name}</span>
              <span className="au-templates-card-desc">{t.description}</span>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div className="au-templates-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreviewId(null) }}>
          <div className="au-templates-preview" role="dialog" aria-modal="true" aria-label={preview.name}>
            <header className="au-templates-preview-head">
              <div>
                <span className="au-templates-card-category">{preview.category}</span>
                <h2>{preview.name}</h2>
              </div>
              <button type="button" className="au-icon-btn" onClick={() => setPreviewId(null)} aria-label="Close">
                <Close size={14} />
              </button>
            </header>

            <p className="au-templates-preview-desc">{preview.description}</p>

            <div className="au-templates-preview-section">
              <h3>Workflow</h3>
              <ol className="au-templates-preview-nodes">
                {preview.definition.nodes.map((n) => <li key={n.id}>{nodeLabel(n.type, nodeTypes)}</li>)}
              </ol>
            </div>

            {(() => {
              const requirements = deriveRequirements(preview, nodeTypes)
              return requirements.length > 0 && (
                <div className="au-templates-preview-section">
                  <h3>This workflow will need</h3>
                  <ul className="au-templates-preview-reqs">
                    {requirements.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )
            })()}

            <button type="button" className="au-save-btn au-templates-use-btn" onClick={() => useTemplate(preview)}>
              Use this template
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const TEMPLATES_PANEL_CSS = `
.au-templates {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.au-templates-toolbar {
  display: flex;
  gap: 8px;
}

.au-templates-search-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.au-templates-search-icon { color: var(--color-text-muted); flex-shrink: 0; }

.au-templates-search {
  flex: 1;
  height: 100%;
  background: none;
  border: none;
  outline: none;
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.au-templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  overflow-y: auto;
}

.au-templates-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.08s, background 0.08s;
}

.au-templates-card:hover {
  border-color: var(--color-primary);
  background: var(--color-hover);
}

.au-templates-card-category {
  font-size: var(--font-size-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.au-templates-card-name {
  font-size: 14px;
  font-weight: 650;
  color: var(--color-text);
}

.au-templates-card-desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.au-templates-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 14px;
}

.au-templates-preview {
  width: 380px;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.32);
}

.au-templates-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.au-templates-preview-head h2 {
  margin: 4px 0 0;
  font-size: 15px;
}

.au-templates-preview-desc {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  margin: 0;
}

.au-templates-preview-section h3 {
  margin: 0 0 6px;
  font-size: var(--font-size-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.au-templates-preview-nodes,
.au-templates-preview-reqs {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: var(--font-size-xs);
  color: var(--color-text);
}

.au-templates-use-btn {
  justify-content: center;
}
`
