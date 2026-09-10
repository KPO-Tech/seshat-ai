import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '@arco-design/web-react'
import { Right, Search, TreeDiagram } from '@icon-park/react'
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

// Same stable per-category "tone" technique Projects' cards use for tags
// (toneFor in AutomationProjectsPanel.tsx) - a categorization aid, not new
// data. Duplicated rather than shared: both are ~6 lines, and the two
// panels categorize different things (a job's tags vs. a template's single
// category), not worth a shared util for.
const TONES = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-success)', 'var(--color-warning)']
function toneFor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
}

function nodeLabel(type: string, nodeTypes: NodeDescription[]): string {
  return nodeTypes.find((nt) => nt.type === type)?.name ?? type
}

// Distinct node-type labels a template's graph actually uses, in graph
// order, deduplicated - a real, derived "what's in this workflow" summary
// (see mockup's "Integrations"/"Agent Pod" row) instead of the mockup's
// invented specialist role names and model assignments we have no data for.
function workflowSummary(template: AutomationTemplate, nodeTypes: NodeDescription[]): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const node of template.definition.nodes) {
    const label = nodeLabel(node.type, nodeTypes)
    if (!seen.has(label)) { seen.add(label); labels.push(label) }
  }
  return labels
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
//
// A later pass (this one) picked up structural cues from the Stitch mockup
// under docs/produits/platforms/automation/design/ - pill category filters
// (matching Projects' folder pills), toned card accents, and a real
// "what's in this workflow" summary and requirements chips shown directly
// on the card instead of only inside the preview drawer. Deliberately NOT
// carried over: the mockup's time-saved/STP-accuracy/cost figures, named
// specialist-agent + model assignments, and a live "Configuration
// Readiness" per-secret checklist - none of that data exists here, and
// this file's own deriveRequirements already documents why per-org secret
// verification is intentionally out of scope.
export function TemplatesPanel({ nodeTypes }: Props) {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<AutomationTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<{ templates: AutomationTemplate[] }>('/automation/dataflow/templates')
      .then((res) => { if (!cancelled) setTemplates(res.templates ?? []) })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load templates.') })
    return () => { cancelled = true }
  }, [])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of templates ?? []) counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [templates])

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
      </div>

      {categories.length > 0 && (
        <div className="au-folder-pills">
          <button type="button" className={`au-folder-pill ${category === '' ? 'active' : ''}`} onClick={() => setCategory('')}>
            All <span className="au-folder-pill-count">{(templates ?? []).length}</span>
          </button>
          {categories.map(([c, count]) => (
            <button type="button" key={c} className={`au-folder-pill ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {c} <span className="au-folder-pill-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {templates === null ? (
        <div className="au-loading">Loading…</div>
      ) : error ? (
        <div className="au-loading au-loading-error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="au-stub au-stub--inline">
          <h2>No templates found</h2>
          <p>Try a different search or category.</p>
        </div>
      ) : (
        <div className="au-templates-grid">
          {filtered.map((t) => {
            const tone = toneFor(t.category)
            const summary = workflowSummary(t, nodeTypes)
            const requirements = deriveRequirements(t, nodeTypes)
            return (
              <div key={t.id} className="au-templates-card" style={{ '--tone': tone } as React.CSSProperties}>
                <div className="au-templates-card-head">
                  <div className="au-templates-card-icon"><TreeDiagram size={18} /></div>
                  <span className="au-templates-card-category">{t.category}</span>
                </div>
                <span className="au-templates-card-name">{t.name}</span>
                <span className="au-templates-card-desc">{t.description}</span>

                {summary.length > 0 && (
                  <div className="au-templates-card-chips">
                    {summary.slice(0, 4).map((s) => <span key={s} className="au-overview-badge au-overview-badge--tag">{s}</span>)}
                    {summary.length > 4 && <span className="au-overview-badge au-overview-badge--tag">+{summary.length - 4} more</span>}
                  </div>
                )}

                {requirements.length > 0 && (
                  <div className="au-templates-card-reqs">Needs: {requirements.join(', ')}</div>
                )}

                <div className="au-templates-card-actions">
                  <button type="button" className="au-templates-card-preview" onClick={() => setPreviewId(t.id)}>
                    Preview flow
                  </button>
                  <button type="button" className="au-templates-card-use" onClick={() => useTemplate(t)}>
                    Use template <Right size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Arco's Modal, not a hand-rolled backdrop + <div> - gets
          Escape-to-close, a focus trap, and click-outside-to-close for
          free (maskClosable defaults to true), none of which the previous
          hand-rolled version had. Only the outer chrome comes from Arco;
          every piece of inner content below is unchanged. */}
      <Modal
        visible={!!preview}
        onCancel={() => setPreviewId(null)}
        footer={null}
        title={preview && (
          <div className="au-templates-preview-title">
            <span className="au-templates-card-category">{preview.category}</span>
            <span>{preview.name}</span>
          </div>
        )}
        className="au-templates-preview-modal"
      >
        {preview && (
          <>
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
          </>
        )}
      </Modal>
    </div>
  )
}

const TEMPLATES_PANEL_CSS = `
.au-templates {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 24px;
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

/* .au-folder-pill(s) itself is defined in AutomationProjectsPanel.tsx's own
   local styles - not visible here, since only one of these two panels is
   ever mounted at a time (railView switch), so redeclaring the same rules
   here keeps this file self-contained instead of silently depending on
   whichever panel happened to render most recently. */
.au-folder-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.au-folder-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-surface-elevated);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
}

.au-folder-pill:hover {
  color: var(--color-text);
}

.au-folder-pill.active {
  background: var(--color-primary);
  color: white;
}

.au-folder-pill-count {
  font-size: var(--font-size-2xs);
  opacity: 0.75;
}

.au-templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding: 2px;
}

.au-templates-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px;
  border-radius: var(--radius-2xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.au-templates-card:hover {
  box-shadow: var(--shadow-medium);
  transform: translateY(-1px);
}

.au-templates-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.au-templates-card-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  color: var(--tone);
  display: flex;
  align-items: center;
  justify-content: center;
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
  font-weight: 700;
  color: var(--color-text);
  margin-top: 2px;
}

.au-templates-card-desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.au-templates-card-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

/* .au-overview-badge (the shape/font, no color) is global (automation.css)
   - safe to reuse. Its --tag color modifier is NOT: it's only defined
   locally inside AutomationProjectsPanel.tsx's own styles, and only one of
   these two panels is ever mounted at a time, so relying on it here would
   silently break the moment Templates is viewed without Projects having
   rendered first in the same session (the exact cross-component CSS bug
   already found and fixed once in this app - see TemplatesPanel's git
   history / the au-var-input incident). Redefined locally instead. */
.au-overview-badge--tag {
  background: var(--color-surface-elevated);
  color: var(--color-text-secondary);
}

.au-templates-card-reqs {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-templates-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-subtle);
  width: 100%;
}

.au-templates-card-preview {
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-2xs);
  font-weight: 600;
  cursor: pointer;
  padding: 6px 4px;
}

.au-templates-card-preview:hover {
  color: var(--color-text);
}

.au-templates-card-use {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-text);
  color: var(--color-surface);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  cursor: pointer;
}

/* The Modal's own chrome (backdrop, panel, close icon, focus trap,
   Escape-to-close) is Arco's - see the au-templates-preview-modal Modal
   above. Only its title's inner layout and the body content below still
   need local styling. */
.au-templates-preview-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
