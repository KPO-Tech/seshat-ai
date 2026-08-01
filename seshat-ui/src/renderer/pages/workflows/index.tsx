import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Left, Plus, Delete, Copy, CheckOne, Caution, Robot, Lightning } from '@icon-park/react'
import { NexusLogo } from '@/components/NexusLogo'

type WorkflowNodeKind = 'agent' | 'verifier' | 'critic' | 'router'

type WorkflowNode = {
  id: string
  kind: WorkflowNodeKind
  agent: string
  prompt: string
  needs: string[]
  routes: string[]
  maxTurns: number
  outputFormat: string
}

const NODE_KINDS: WorkflowNodeKind[] = ['agent', 'verifier', 'critic', 'router']

const KIND_LABELS: Record<WorkflowNodeKind, string> = {
  agent: 'Agent',
  verifier: 'Verifier',
  critic: 'Critic',
  router: 'Router',
}

const KIND_COLORS: Record<WorkflowNodeKind, string> = {
  agent: '#4f8cff',
  verifier: '#10a37f',
  critic: '#d97757',
  router: '#8b6fd6',
}

const STARTER_NODES: WorkflowNode[] = [
  {
    id: 'collect',
    kind: 'agent',
    agent: 'researcher',
    prompt: 'Collect the strongest relevant facts, sources, and constraints.',
    needs: [],
    routes: [],
    maxTurns: 3,
    outputFormat: 'Bulleted findings with source notes.',
  },
  {
    id: 'verify',
    kind: 'verifier',
    agent: 'verifier',
    prompt: 'Check the collected findings for contradictions, weak evidence, and missing verification.',
    needs: ['collect'],
    routes: [],
    maxTurns: 2,
    outputFormat: 'PASS/FAIL plus exact issues.',
  },
  {
    id: 'critique',
    kind: 'critic',
    agent: 'critic',
    prompt: 'Identify gaps, risks, assumptions, and improvements before final synthesis.',
    needs: ['collect'],
    routes: [],
    maxTurns: 2,
    outputFormat: 'Prioritized critique.',
  },
  {
    id: 'route',
    kind: 'router',
    agent: 'router',
    prompt: 'Decide whether the workflow is ready for final synthesis.',
    needs: ['verify', 'critique'],
    routes: ['final'],
    maxTurns: 1,
    outputFormat: 'Chosen route id first, then short reason.',
  },
  {
    id: 'final',
    kind: 'agent',
    agent: 'synthesizer',
    prompt: 'Write the final answer from the dependency outputs.',
    needs: ['route'],
    routes: [],
    maxTurns: 3,
    outputFormat: 'Concise final answer with caveats.',
  },
]

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseCsv(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

function yamlString(value: string): string {
  if (!value) return '""'
  if (/^[a-zA-Z0-9_.-]+$/.test(value)) return value
  return JSON.stringify(value)
}

function buildYaml(name: string, description: string, nodes: WorkflowNode[]): string {
  const lines: string[] = [`name: ${yamlString(name || 'workflow')}`]
  if (description.trim()) lines.push(`description: ${yamlString(description.trim())}`)
  lines.push('nodes:')
  for (const node of nodes) {
    lines.push(`  - id: ${yamlString(node.id)}`)
    if (node.kind !== 'agent') lines.push(`    kind: ${node.kind}`)
    if (node.agent.trim()) lines.push(`    agent: ${yamlString(node.agent.trim())}`)
    lines.push(`    prompt: ${yamlString(node.prompt.trim())}`)
    if (node.needs.length > 0) lines.push(`    needs: [${node.needs.map(yamlString).join(', ')}]`)
    if (node.kind === 'router' && node.routes.length > 0) {
      lines.push(`    routes: [${node.routes.map(yamlString).join(', ')}]`)
    }
    if (node.maxTurns > 0) lines.push(`    max_turns: ${node.maxTurns}`)
    if (node.outputFormat.trim()) lines.push(`    output_format: ${yamlString(node.outputFormat.trim())}`)
  }
  return `${lines.join('\n')}\n`
}

function validateWorkflow(nodes: WorkflowNode[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const node of nodes) {
    if (!node.id.trim()) errors.push('Every node needs an id.')
    if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`)
    ids.add(node.id)
    if (!node.prompt.trim()) errors.push(`Node ${node.id || '(blank)'} needs a prompt.`)
    if (node.kind === 'router' && node.routes.length === 0) errors.push(`Router ${node.id} needs at least one route.`)
  }
  for (const node of nodes) {
    for (const dep of node.needs) {
      if (!ids.has(dep)) errors.push(`${node.id} depends on unknown node ${dep}.`)
    }
    for (const route of node.routes) {
      if (!ids.has(route)) errors.push(`${node.id} routes to unknown node ${route}.`)
      if (route === node.id) errors.push(`${node.id} cannot route to itself.`)
    }
  }
  return [...new Set(errors)]
}

export function WorkflowsPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('deep-research')
  const [description, setDescription] = useState('Parallel investigation workflow with verification and critique.')
  const [nodes, setNodes] = useState<WorkflowNode[]>(STARTER_NODES)
  const [selectedId, setSelectedId] = useState('collect')
  const [copied, setCopied] = useState(false)

  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0]
  const yaml = useMemo(() => buildYaml(name, description, nodes), [name, description, nodes])
  const errors = useMemo(() => validateWorkflow(nodes), [nodes])

  function updateNode(id: string, patch: Partial<WorkflowNode>) {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, ...patch } : node))
  }

  function renameNode(oldId: string, nextValue: string) {
    const nextId = slugify(nextValue)
    updateNode(oldId, { id: nextId })
    setNodes((current) => current.map((node) => ({
      ...node,
      needs: node.needs.map((dep) => dep === oldId ? nextId : dep),
      routes: node.routes.map((route) => route === oldId ? nextId : route),
    })))
    setSelectedId(nextId)
  }

  function addNode(kind: WorkflowNodeKind = 'agent') {
    const base = kind === 'agent' ? 'node' : kind
    let index = nodes.length + 1
    let id = `${base}-${index}`
    const ids = new Set(nodes.map((node) => node.id))
    while (ids.has(id)) {
      index += 1
      id = `${base}-${index}`
    }
    const next: WorkflowNode = {
      id,
      kind,
      agent: kind,
      prompt: kind === 'router' ? 'Choose the best next route.' : 'Describe one bounded task.',
      needs: [],
      routes: [],
      maxTurns: kind === 'router' ? 1 : 3,
      outputFormat: '',
    }
    setNodes((current) => [...current, next])
    setSelectedId(id)
  }

  function removeNode(id: string) {
    const remaining = nodes.filter((node) => node.id !== id)
    setNodes(remaining.map((node) => ({
      ...node,
      needs: node.needs.filter((dep) => dep !== id),
      routes: node.routes.filter((route) => route !== id),
    })))
    setSelectedId(remaining[0]?.id ?? '')
  }

  async function copyYaml() {
    await navigator.clipboard.writeText(yaml)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="wf-root">
      <style>{CSS}</style>
      <header className="wf-topbar">
        <div className="wf-topbar-left">
          <button className="wf-back" type="button" onClick={() => navigate(-1)}>
            <Left size={12} /> Home
          </button>
          <div>
            <div className="wf-title">Workflows</div>
            <div className="wf-subtitle">Visual static DAG designer for Seshat agents</div>
          </div>
        </div>
        <NexusLogo size={22} />
      </header>

      <main className="wf-main">
        <section className="wf-panel wf-left">
          <div className="wf-panel-header">
            <span>Workflow</span>
            <button className="wf-icon-btn" type="button" onClick={() => addNode()} title="Add node">
              <Plus size={13} />
            </button>
          </div>

          <div className="wf-field">
            <label>Name</label>
            <input value={name} onChange={(event) => setName(slugify(event.target.value))} />
          </div>
          <div className="wf-field">
            <label>Description</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </div>

          <div className="wf-kind-row">
            {NODE_KINDS.map((kind) => (
              <button key={kind} type="button" onClick={() => addNode(kind)} className="wf-kind-add">
                <Plus size={10} /> {KIND_LABELS[kind]}
              </button>
            ))}
          </div>

          <div className="wf-node-list">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`wf-node-list-item${selected?.id === node.id ? ' active' : ''}`}
                onClick={() => setSelectedId(node.id)}
              >
                <span className="wf-dot" style={{ background: KIND_COLORS[node.kind] }} />
                <span className="wf-node-list-main">
                  <span>{node.id || '(blank)'}</span>
                  <small>{KIND_LABELS[node.kind]}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="wf-canvas">
          <WorkflowCanvas nodes={nodes} selectedId={selected?.id ?? ''} onSelect={setSelectedId} />
        </section>

        <section className="wf-panel wf-right">
          {selected ? (
            <>
              <div className="wf-panel-header">
                <span>Edit Node</span>
                <button className="wf-icon-btn danger" type="button" onClick={() => removeNode(selected.id)} title="Delete node" disabled={nodes.length <= 1}>
                  <Delete size={13} />
                </button>
              </div>
              <NodeEditor node={selected} nodes={nodes} onChange={(patch) => updateNode(selected.id, patch)} onRename={(nextId) => renameNode(selected.id, nextId)} />
            </>
          ) : (
            <div className="wf-empty">Create a node to start designing.</div>
          )}

          <div className="wf-export">
            <div className="wf-export-header">
              <span>YAML</span>
              <button className="wf-copy" type="button" onClick={() => { void copyYaml() }}>
                {copied ? <CheckOne size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {errors.length > 0 && (
              <div className="wf-errors">
                <Caution size={13} />
                <div>{errors.map((error) => <div key={error}>{error}</div>)}</div>
              </div>
            )}
            <pre className="wf-yaml">{yaml}</pre>
          </div>
        </section>
      </main>
    </div>
  )
}

function NodeEditor({ node, nodes, onChange, onRename }: {
  node: WorkflowNode
  nodes: WorkflowNode[]
  onChange: (patch: Partial<WorkflowNode>) => void
  onRename: (id: string) => void
}) {
  const otherIds = nodes.filter((item) => item.id !== node.id).map((item) => item.id)
  return (
    <div className="wf-editor">
      <div className="wf-field">
        <label>Id</label>
        <input value={node.id} onChange={(event) => onRename(event.target.value)} />
      </div>
      <div className="wf-row">
        <div className="wf-field">
          <label>Kind</label>
          <select value={node.kind} onChange={(event) => onChange({ kind: event.target.value as WorkflowNodeKind })}>
            {NODE_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
          </select>
        </div>
        <div className="wf-field">
          <label>Max Turns</label>
          <input type="number" min={0} value={node.maxTurns} onChange={(event) => onChange({ maxTurns: Number(event.target.value) || 0 })} />
        </div>
      </div>
      <div className="wf-field">
        <label>Agent Label</label>
        <input value={node.agent} onChange={(event) => onChange({ agent: event.target.value })} />
      </div>
      <div className="wf-field">
        <label>Needs</label>
        <input value={node.needs.join(', ')} onChange={(event) => onChange({ needs: parseCsv(event.target.value) })} placeholder={otherIds.join(', ')} />
      </div>
      {node.kind === 'router' && (
        <div className="wf-field">
          <label>Routes</label>
          <input value={node.routes.join(', ')} onChange={(event) => onChange({ routes: parseCsv(event.target.value) })} placeholder={otherIds.join(', ')} />
        </div>
      )}
      <div className="wf-field">
        <label>Prompt</label>
        <textarea value={node.prompt} onChange={(event) => onChange({ prompt: event.target.value })} rows={5} />
      </div>
      <div className="wf-field">
        <label>Output Format</label>
        <textarea value={node.outputFormat} onChange={(event) => onChange({ outputFormat: event.target.value })} rows={3} />
      </div>
    </div>
  )
}

function WorkflowCanvas({ nodes, selectedId, onSelect }: {
  nodes: WorkflowNode[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const positions = useMemo(() => layoutNodes(nodes), [nodes])
  const lines = nodes.flatMap((node) => node.needs.map((dep) => ({ from: dep, to: node.id, kind: 'need' as const })))
  const routes = nodes.flatMap((node) => node.routes.map((route) => ({ from: node.id, to: route, kind: 'route' as const })))

  return (
    <div className="wf-canvas-inner">
      <svg className="wf-lines" viewBox="0 0 980 620" preserveAspectRatio="none">
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {[...lines, ...routes].map((line) => {
          const from = positions.get(line.from)
          const to = positions.get(line.to)
          if (!from || !to) return null
          const startX = from.x + 190
          const startY = from.y + 40
          const endX = to.x
          const endY = to.y + 40
          const mid = Math.max(28, (endX - startX) / 2)
          return (
            <path
              key={`${line.kind}:${line.from}:${line.to}`}
              className={`wf-line ${line.kind}`}
              d={`M ${startX} ${startY} C ${startX + mid} ${startY}, ${endX - mid} ${endY}, ${endX} ${endY}`}
              markerEnd="url(#wf-arrow)"
            />
          )
        })}
      </svg>
      {nodes.map((node) => {
        const pos = positions.get(node.id) ?? { x: 0, y: 0 }
        return (
          <button
            key={node.id}
            type="button"
            className={`wf-canvas-node${node.id === selectedId ? ' active' : ''}`}
            style={{ left: pos.x, top: pos.y, borderColor: KIND_COLORS[node.kind] }}
            onClick={() => onSelect(node.id)}
          >
            <div className="wf-canvas-node-top">
              <span className="wf-node-icon" style={{ background: KIND_COLORS[node.kind] }}>
                {node.kind === 'agent' ? <Robot size={13} /> : <Lightning size={13} />}
              </span>
              <span>{KIND_LABELS[node.kind]}</span>
            </div>
            <strong>{node.id || '(blank)'}</strong>
            <small>{node.prompt || 'No prompt'}</small>
          </button>
        )
      })}
    </div>
  )
}

function layoutNodes(nodes: WorkflowNode[]): Map<string, { x: number; y: number }> {
  const levelById = new Map<string, number>()
  const ids = new Set(nodes.map((node) => node.id))
  for (const node of nodes) {
    const deps = node.needs.filter((dep) => ids.has(dep))
    const level = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => levelById.get(dep) ?? 0)) + 1
    levelById.set(node.id, level)
  }
  const groups = new Map<number, WorkflowNode[]>()
  for (const node of nodes) {
    const level = levelById.get(node.id) ?? 0
    groups.set(level, [...(groups.get(level) ?? []), node])
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const [level, items] of groups) {
    items.forEach((node, index) => {
      positions.set(node.id, { x: 44 + level * 230, y: 48 + index * 118 })
    })
  }
  return positions
}

const CSS = `
.wf-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text);
}
.wf-topbar {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  border-bottom: 1px solid var(--color-border-subtle);
}
.wf-topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.wf-back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.wf-back:hover { background: var(--color-hover); color: var(--color-text); }
.wf-title { font-size: 14px; font-weight: 800; }
.wf-subtitle { font-size: 10px; color: var(--color-text-muted); margin-top: 2px; }
.wf-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 292px minmax(460px, 1fr) 360px;
}
.wf-panel {
  min-width: 0;
  overflow-y: auto;
  border-right: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
}
.wf-right { border-right: none; border-left: 1px solid var(--color-border-subtle); }
.wf-panel-header {
  height: 43px;
  padding: 0 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: 11px;
  font-weight: 800;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.wf-field { display: flex; flex-direction: column; gap: 5px; padding: 10px 14px 0; }
.wf-field label { font-size: 10px; font-weight: 700; color: var(--color-text-muted); }
.wf-field input, .wf-field textarea, .wf-field select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 11px;
  padding: 7px 8px;
  outline: none;
  resize: vertical;
}
.wf-field input:focus, .wf-field textarea:focus, .wf-field select:focus { border-color: var(--color-primary); }
.wf-row { display: grid; grid-template-columns: 1fr 92px; gap: 8px; }
.wf-kind-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 13px 14px 0;
}
.wf-kind-add, .wf-copy, .wf-icon-btn {
  border: none;
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.wf-kind-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 6px;
  font-size: 10px;
  font-weight: 700;
}
.wf-kind-add:hover, .wf-copy:hover, .wf-icon-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.wf-icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wf-icon-btn.danger:hover:not(:disabled) { color: var(--color-error); }
.wf-icon-btn:disabled { opacity: 0.35; cursor: default; }
.wf-node-list { padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.wf-node-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 8px 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}
.wf-node-list-item.active { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface)); }
.wf-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.wf-node-list-main { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.wf-node-list-main span { font-size: 12px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-node-list-main small { font-size: 10px; color: var(--color-text-muted); }
.wf-canvas {
  min-width: 0;
  overflow: auto;
  background:
    linear-gradient(var(--color-border-subtle) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px);
  background-size: 28px 28px;
  background-color: var(--color-surface);
}
.wf-canvas-inner {
  position: relative;
  width: 980px;
  height: 620px;
}
.wf-lines {
  position: absolute;
  inset: 0;
  width: 980px;
  height: 620px;
  color: color-mix(in srgb, var(--color-text-muted) 60%, transparent);
  pointer-events: none;
}
.wf-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}
.wf-line.route {
  stroke: #8b6fd6;
  stroke-dasharray: 5 5;
}
.wf-canvas-node {
  position: absolute;
  width: 190px;
  height: 82px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px;
  border: 1.5px solid;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 96%, transparent);
  color: var(--color-text);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.13);
  text-align: left;
  cursor: pointer;
}
.wf-canvas-node.active { outline: 2px solid color-mix(in srgb, var(--color-primary) 40%, transparent); }
.wf-canvas-node-top { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; color: var(--color-text-secondary); }
.wf-node-icon {
  width: 21px;
  height: 21px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.wf-canvas-node strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-canvas-node small {
  font-size: 10px;
  line-height: 1.35;
  color: var(--color-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wf-editor { padding-bottom: 14px; }
.wf-export { border-top: 1px solid var(--color-border-subtle); margin-top: 8px; }
.wf-export-header {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  font-size: 11px;
  font-weight: 800;
  color: var(--color-text-secondary);
}
.wf-copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  font-size: 10px;
  font-weight: 700;
}
.wf-errors {
  margin: 0 14px 9px;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid rgba(201, 107, 92, 0.25);
  background: rgba(201, 107, 92, 0.08);
  color: var(--color-error);
  font-size: 10px;
  line-height: 1.5;
}
.wf-yaml {
  margin: 0 14px 14px;
  max-height: 310px;
  overflow: auto;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
  background: #17161b;
  color: var(--color-text);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.wf-empty { padding: 22px; color: var(--color-text-muted); font-size: 12px; }
@media (max-width: 1080px) {
  .wf-main { grid-template-columns: 260px minmax(420px, 1fr); }
  .wf-right { grid-column: 1 / -1; border-left: none; border-top: 1px solid var(--color-border-subtle); max-height: 360px; }
}
`
