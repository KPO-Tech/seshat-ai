import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Close, Plus } from '@icon-park/react'
import { definitionToFlow, flowToDefinition, INPUT_HANDLE } from './convert'
import { GRAPH_NODE_TYPES, type FlowGraphNode } from './GraphNode'
import { NodeCreator } from './NodeCreator'
import { ParameterForm } from './ParameterForm'
import type { DataflowDefinition, NodeDescription } from './types'
import { useUIStore } from '@/stores/ui'

// One color per node-type Category, cycled if the live catalog ever grows a
// 6th - purely cosmetic grouping, never a correctness signal (the type
// string is what actually matters to the backend).
const CATEGORY_COLORS = ['#EF7C2F', '#4C9AFF', '#57D9A3', '#B197FC', '#FF8ED4', '#FFC53D']

function categoryColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category)
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length] ?? CATEGORY_COLORS[0]
}

let nodeIdCounter = 0
function nextNodeId(type: string): string {
  nodeIdCounter += 1
  return `${type}_${nodeIdCounter}`
}

// nodeIdCounter is module-scoped (shared across every graph opened this
// session) but never seeded from a *loaded* graph's own ids - opening a
// saved graph that already has e.g. "http_request_3" and then adding or
// duplicating a node could produce a colliding "..._1". Bump the counter to
// at least the highest numeric suffix already present whenever a graph
// loads, so freshly generated ids never collide with ones it was saved
// with.
function seedNodeIdCounter(nodes: FlowGraphNode[]) {
  let max = 0
  for (const n of nodes) {
    const match = /_(\d+)$/.exec(n.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  nodeIdCounter = Math.max(nodeIdCounter, max)
}

type GraphEditorProps = {
  value: DataflowDefinition | null
  onChange: (def: DataflowDefinition) => void
  nodeTypes: NodeDescription[]
  nodeTypesLoading?: boolean
  nodeTypesError?: string | null
}

function GraphEditorInner({ value, onChange, nodeTypes, nodeTypesLoading, nodeTypesError }: GraphEditorProps) {
  const theme = useUIStore((s) => s.theme)
  const initial = useMemo(() => {
    const flow = definitionToFlow(value ?? { name: 'Untitled graph', nodes: [] })
    seedNodeIdCounter(flow.nodes)
    return flow
  }, [])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowGraphNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  // The job's own name/description (edited in AutomationPage's topbar and
  // settings drawer) are what the user actually sees and edits - these are
  // just the values threaded through to the underlying Definition, never
  // surfaced as their own inputs.
  const graphName = value?.name || 'Untitled graph'
  const graphDescription = value?.description ?? ''
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowGraphNode, Edge> | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const categories = useMemo(() => Array.from(new Set(nodeTypes.map((n) => n.category))), [nodeTypes])

  // Re-color and re-label nodes whenever the catalog resolves (categoryColor
  // needs `categories`, not known yet on first mount if node types load
  // async; title/category are needed too since a node loaded from a saved
  // DataflowDefinition only ever carries its raw dfType, never a display
  // name).
  useEffect(() => {
    if (categories.length === 0) return
    setNodes((current) =>
      current.map((n) => {
        const desc = nodeTypes.find((nt) => nt.type === n.data.dfType)
        const category = desc?.category ?? catalogCategory(n.data.dfType, nodeTypes)
        return { ...n, data: { ...n.data, categoryColor: categoryColor(category, categories), title: desc?.name, category } }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length])

  const emitChange = useCallback(
    (nextNodes: FlowGraphNode[], nextEdges: Edge[], name?: string, description?: string) => {
      onChange(flowToDefinition(name ?? graphName, description ?? graphDescription, nextNodes, nextEdges))
    },
    [onChange, graphName, graphDescription],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const next = addEdge({ ...connection, targetHandle: INPUT_HANDLE }, eds)
        emitChange(nodes, next)
        return next
      })
    },
    [nodes, setEdges, emitChange],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: FlowGraphNode) => {
      const next = nodes.map((n) => (n.id === node.id ? node : n))
      setNodes(next)
      emitChange(next, edges)
    },
    [nodes, edges, setNodes, emitChange],
  )

  const onNodesDelete = useCallback(
    (deleted: FlowGraphNode[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id))
      const nextNodes = nodes.filter((n) => !deletedIds.has(n.id))
      const nextEdges = edges.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target))
      setEdges(nextEdges)
      emitChange(nextNodes, nextEdges)
      if (selectedNodeId && deletedIds.has(selectedNodeId)) setSelectedNodeId(null)
    },
    [nodes, edges, setEdges, emitChange, selectedNodeId],
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const deletedIds = new Set(deleted.map((e) => e.id))
      const next = edges.filter((e) => !deletedIds.has(e.id))
      emitChange(nodes, next)
    },
    [nodes, edges, emitChange],
  )

  const onNodeClick = useCallback((_: unknown, node: FlowGraphNode) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => setSelectedNodeId(null), [])

  const [creatorOpen, setCreatorOpen] = useState(false)

  const addNodeFromCatalog = useCallback(
    (desc: NodeDescription) => {
      const bounds = wrapperRef.current?.getBoundingClientRect()
      const jitter = nodes.length * 24
      const screenPoint = bounds
        ? { x: bounds.width / 2 + jitter, y: bounds.height / 2 + jitter }
        : { x: 200 + jitter, y: 150 + jitter }
      const position = flowInstance ? flowInstance.screenToFlowPosition(screenPoint) : screenPoint
      const id = nextNodeId(desc.type)
      const newNode: FlowGraphNode = {
        id,
        type: 'dataflow',
        position,
        data: {
          dfType: desc.type,
          parameters: {},
          categoryColor: categoryColor(desc.category, categories),
          title: desc.name,
          category: desc.category,
        },
      }
      const next = [...nodes, newNode]
      setNodes(next)
      emitChange(next, edges)
      setCreatorOpen(false)
    },
    [flowInstance, nodes, edges, setNodes, emitChange, categories],
  )

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null

  function saveParams(next: Record<string, unknown>) {
    if (!selectedNode) return
    const nextNodes = nodes.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, parameters: next } } : n))
    setNodes(nextNodes)
    emitChange(nextNodes, edges)
  }

  function deleteSelectedNode() {
    if (!selectedNode) return
    onNodesDelete([selectedNode])
  }

  // Connections are edge-derived (flowToDefinition rebuilds `connections`
  // from `edges` on every save, never stored per-node), so a rename only
  // needs to touch the one node's id and any edge referencing it - no
  // deeper remapping. Edge ids themselves (`${source}:${port}->${target}`)
  // go stale until the graph next reloads; cosmetic only, not worth
  // recomputing here.
  // Returns true on success, or an error message on failure, so NodeIdEditor
  // can tell a real collision apart from a no-op (typing back the same id)
  // instead of both silently doing nothing with no feedback.
  function renameNode(oldId: string, newId: string): true | string {
    if (newId === oldId) return true
    if (nodes.some((n) => n.id === newId)) return `"${newId}" is already used by another node`
    const nextNodes = nodes.map((n) => (n.id === oldId ? { ...n, id: newId } : n))
    const nextEdges = edges.map((e) => ({
      ...e,
      source: e.source === oldId ? newId : e.source,
      target: e.target === oldId ? newId : e.target,
    }))
    setNodes(nextNodes)
    setEdges(nextEdges)
    setSelectedNodeId(newId)
    emitChange(nextNodes, nextEdges)
    return true
  }

  function duplicateSelectedNode() {
    if (!selectedNode) return
    const id = nextNodeId(selectedNode.data.dfType)
    const newNode: FlowGraphNode = {
      ...selectedNode,
      id,
      selected: false,
      position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
      data: { ...selectedNode.data, parameters: JSON.parse(JSON.stringify(selectedNode.data.parameters)) },
    }
    const next = [...nodes, newNode]
    setNodes(next)
    emitChange(next, edges)
    setSelectedNodeId(id)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'd') return
      const active = document.activeElement?.tagName
      if (active === 'INPUT' || active === 'TEXTAREA' || active === 'SELECT') return
      if (!selectedNodeId) return
      e.preventDefault()
      duplicateSelectedNode()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, nodes, edges])

  return (
    <div className="gf-root">
      <style>{GRAPH_EDITOR_CSS}</style>
      <div className="gf-body">
        <div className="gf-canvas" ref={wrapperRef}>
          <ReactFlow<FlowGraphNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={GRAPH_NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setFlowInstance}
            colorMode={theme}
            // React Flow's own default is 'Backspace' only - on a keyboard
            // with both keys (most non-Mac layouts, including French
            // "Suppr"), pressing the forward Delete key did nothing.
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>

          <button type="button" className="gf-add-btn" onClick={() => setCreatorOpen(true)} title="Add node">
            <Plus size={16} />
          </button>

          {nodes.length === 0 && (
            <div className="gf-canvas-hint">
              <Plus size={20} />
              <span>Click + to add your first node.</span>
            </div>
          )}

          <NodeCreator
            open={creatorOpen}
            nodeTypes={nodeTypes}
            categoryColorOf={(category) => categoryColor(category, categories)}
            loading={nodeTypesLoading}
            error={nodeTypesError}
            onClose={() => setCreatorOpen(false)}
            onPick={addNodeFromCatalog}
          />
        </div>

        {selectedNode && (
          <aside className="gf-config-panel">
            <header className="gf-config-head">
              <div>
                <NodeIdEditor key={selectedNode.id} nodeId={selectedNode.id} onRename={(next) => renameNode(selectedNode.id, next)} />
                <span>{selectedNode.data.dfType}</span>
              </div>
              <button type="button" onClick={() => setSelectedNodeId(null)} aria-label="Close">
                <Close size={14} />
              </button>
            </header>
            <div className="gf-config-body">
              <ParameterForm
                key={selectedNode.id}
                parameters={selectedNode.data.parameters}
                properties={nodeTypes.find((nt) => nt.type === selectedNode.data.dfType)?.properties}
                onSave={saveParams}
                onDelete={deleteSelectedNode}
                onDuplicate={duplicateSelectedNode}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function catalogCategory(type: string, nodeTypes: NodeDescription[]): string {
  return nodeTypes.find((n) => n.type === type)?.category ?? 'Other'
}

// Mount with `key={nodeId}` so switching the selected node (or a successful
// rename, which changes selectedNodeId to the new id) resets the local
// draft instead of showing stale text.
function NodeIdEditor({ nodeId, onRename }: { nodeId: string; onRename: (next: string) => string | true }) {
  const [draft, setDraft] = useState(nodeId)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === nodeId) {
      setDraft(nodeId)
      setError(null)
      return
    }
    const result = onRename(trimmed)
    if (result === true) {
      setError(null)
      return
    }
    // Rejected (collision) - keep the attempted text visible with a red
    // outline and refocus, rather than silently reverting or doing nothing,
    // so the user can see exactly what failed and fix it inline.
    setError(result)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  return (
    <input
      ref={inputRef}
      className={`gf-id-input${error ? ' error' : ''}`}
      value={draft}
      title={error ?? undefined}
      onChange={(e) => { setDraft(e.target.value); setError(null) }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
        if (e.key === 'Escape') { setDraft(nodeId); setError(null); e.currentTarget.blur() }
      }}
    />
  )
}

const GRAPH_EDITOR_CSS = `
.gf-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.gf-body {
  flex: 1;
  min-height: 0;
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.gf-canvas {
  position: relative;
  flex: 1;
  min-width: 0;
}

.gf-add-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 10;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  box-shadow: var(--shadow-medium);
  cursor: pointer;
}

.gf-add-btn:hover {
  color: var(--color-text);
  background: var(--color-hover);
}

.gf-canvas-hint {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.gf-config-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 300px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg);
  box-shadow: -14px 0 40px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  z-index: 5;
}

.gf-config-head {
  min-height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.gf-id-input {
  display: block;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 1px 4px;
  margin: -1px -4px;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 700;
  font-family: inherit;
}

.gf-id-input:hover {
  border-color: var(--color-border-subtle);
}

.gf-id-input:focus {
  outline: none;
  border-color: var(--color-cta);
  background: var(--color-surface);
}

.gf-id-input.error {
  border-color: #ff6b6b;
  background: var(--color-surface);
}

.gf-config-head span {
  display: block;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}

.gf-config-head button {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.gf-config-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gf-config-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.gf-config-textarea {
  flex-shrink: 0;
  min-height: 220px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.gf-config-error {
  color: #ff6b6b;
  font-size: var(--font-size-xs);
}

.gf-config-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

/* Save/Duplicate/Delete (ParameterForm) and Save/Cancel (SecretRefField's
   inline secret-creation form) both use this - previously they carried
   .ib-action-btn, a class that only existed in Inbox's own <style> block
   and was never loaded here, so these buttons rendered with no styling at
   all (bare browser defaults) despite being fully wired. */
.gf-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 var(--space-5);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.gf-action-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text);
}

.gf-action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.gf-action-btn.primary {
  background: var(--color-cta);
  border-color: transparent;
  color: white;
}

.gf-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gf-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gf-field-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.gf-field-required {
  color: var(--color-cta);
  margin-left: 2px;
}

.gf-field-input {
  padding: 7px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-family: inherit;
}

.gf-field-textarea {
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.gf-field-checkbox {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: normal;
  text-transform: none;
  letter-spacing: normal;
}

.gf-field-hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  line-height: 1.4;
}

.gf-field-error {
  color: #ff6b6b;
  font-size: var(--font-size-2xs);
}

.gf-node {
  position: relative;
  width: 170px;
  border-radius: 10px;
}

.gf-node-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: var(--shadow-medium);
  transition: border-color 0.1s ease, box-shadow 0.1s ease;
}

.gf-node.selected .gf-node-card {
  border-color: var(--color-cta);
  box-shadow: 0 0 0 2px var(--color-primary-subtle), var(--shadow-medium);
}

.gf-node-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gf-node-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.gf-node-title {
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: 750;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gf-node-subtitle {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* One per output port, absolutely positioned at an even vertical interval
   along the card's own right edge (set inline via top%) rather than
   stacked below the card in normal flow - that's what made ports look
   detached/floating instead of attached to the node. */
.gf-port {
  position: absolute;
  right: -5px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: none;
}

.gf-port-label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-2xs);
  background: var(--color-bg);
  border: 1px solid var(--color-border-subtle);
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
}

.gf-handle {
  width: 9px;
  height: 9px;
  background: var(--color-cta);
  border: 2px solid var(--color-bg);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
  pointer-events: all;
}

.gf-handle:hover {
  transform: scale(1.4);
  box-shadow: 0 0 0 4px var(--color-primary-subtle);
}

.gf-handle-target {
  background: var(--color-text-muted);
}
`

export function GraphEditor(props: GraphEditorProps) {
  return (
    <ReactFlowProvider>
      <GraphEditorInner {...props} />
    </ReactFlowProvider>
  )
}
