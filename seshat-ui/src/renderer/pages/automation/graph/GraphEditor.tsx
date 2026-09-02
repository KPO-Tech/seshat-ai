import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Close, Delete, Plus } from '@icon-park/react'
import { definitionToFlow, flowToDefinition, stripUIPosition, INPUT_HANDLE } from './convert'
import { GRAPH_NODE_TYPES, type FlowGraphNode } from './GraphNode'
import type { DataflowDefinition, NodeDescription } from './types'

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

type GraphEditorProps = {
  value: DataflowDefinition | null
  onChange: (def: DataflowDefinition) => void
  nodeTypes: NodeDescription[]
  nodeTypesLoading?: boolean
  nodeTypesError?: string | null
}

function GraphEditorInner({ value, onChange, nodeTypes, nodeTypesLoading, nodeTypesError }: GraphEditorProps) {
  const initial = useMemo(() => definitionToFlow(value ?? { name: 'Untitled graph', nodes: [] }), [])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowGraphNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const [graphName, setGraphName] = useState(value?.name || 'Untitled graph')
  const [graphDescription, setGraphDescription] = useState(value?.description ?? '')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [paramsDraft, setParamsDraft] = useState('')
  const [paramsError, setParamsError] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowGraphNode, Edge> | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const categories = useMemo(() => Array.from(new Set(nodeTypes.map((n) => n.category))), [nodeTypes])

  // Re-color nodes whenever the catalog resolves (categoryColor needs
  // `categories`, not known yet on first mount if node types load async).
  useEffect(() => {
    if (categories.length === 0) return
    setNodes((current) =>
      current.map((n) => ({ ...n, data: { ...n.data, categoryColor: categoryColor(catalogCategory(n.data.dfType, nodeTypes), categories) } })),
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
    setParamsDraft(JSON.stringify(stripUIPosition(node.data.parameters), null, 2))
    setParamsError(null)
  }, [])

  const onPaneClick = useCallback(() => setSelectedNodeId(null), [])

  const onDragStart = useCallback((event: React.DragEvent, type: string) => {
    event.dataTransfer.setData('application/x-seshat-node-type', type)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/x-seshat-node-type')
      if (!type || !flowInstance || !wrapperRef.current) return
      const bounds = wrapperRef.current.getBoundingClientRect()
      const position = flowInstance.screenToFlowPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
      const id = nextNodeId(type)
      const newNode: FlowGraphNode = {
        id,
        type: 'dataflow',
        position,
        data: { dfType: type, parameters: {}, categoryColor: categoryColor(catalogCategory(type, nodeTypes), categories) },
      }
      const next = [...nodes, newNode]
      setNodes(next)
      emitChange(next, edges)
    },
    [flowInstance, nodes, edges, setNodes, emitChange, nodeTypes, categories],
  )

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null

  function saveParams() {
    if (!selectedNode) return
    let parsed: Record<string, unknown>
    try {
      parsed = paramsDraft.trim() === '' ? {} : JSON.parse(paramsDraft)
    } catch (err) {
      setParamsError(err instanceof Error ? err.message : 'Invalid JSON')
      return
    }
    const next = nodes.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, parameters: parsed } } : n))
    setNodes(next)
    setParamsError(null)
    emitChange(next, edges)
  }

  function deleteSelectedNode() {
    if (!selectedNode) return
    onNodesDelete([selectedNode])
  }

  function handleNameChange(next: string) {
    setGraphName(next)
    emitChange(nodes, edges, next, graphDescription)
  }

  function handleDescriptionChange(next: string) {
    setGraphDescription(next)
    emitChange(nodes, edges, graphName, next)
  }

  return (
    <div className="gf-root">
      <style>{GRAPH_EDITOR_CSS}</style>
      <div className="gf-meta-row">
        <input className="gf-name-input" value={graphName} onChange={(e) => handleNameChange(e.target.value)} placeholder="Graph name" />
        <input
          className="gf-description-input"
          value={graphDescription}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="Description (optional)"
        />
      </div>
      <div className="gf-body">
        <aside className="gf-palette">
          {nodeTypesLoading && <div className="gf-palette-empty">Loading node types…</div>}
          {nodeTypesError && <div className="gf-palette-empty gf-palette-error">{nodeTypesError}</div>}
          {categories.map((category) => (
            <div key={category} className="gf-palette-group">
              <div className="gf-palette-group-label" style={{ color: categoryColor(category, categories) }}>
                {category}
              </div>
              {nodeTypes
                .filter((n) => n.category === category)
                .map((n) => (
                  <div
                    key={n.type}
                    className="gf-palette-item"
                    draggable
                    onDragStart={(e) => onDragStart(e, n.type)}
                    title={n.description}
                  >
                    {n.name}
                  </div>
                ))}
            </div>
          ))}
        </aside>

        <div className="gf-canvas" ref={wrapperRef} onDrop={onDrop} onDragOver={onDragOver}>
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
            colorMode="dark"
            fitView
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="gf-canvas-hint">
              <Plus size={20} />
              <span>Drag a node type from the left to start building.</span>
            </div>
          )}
        </div>

        {selectedNode && (
          <aside className="gf-config-panel">
            <header className="gf-config-head">
              <div>
                <strong>{selectedNode.id}</strong>
                <span>{selectedNode.data.dfType}</span>
              </div>
              <button type="button" onClick={() => setSelectedNodeId(null)} aria-label="Close">
                <Close size={14} />
              </button>
            </header>
            <div className="gf-config-body">
              <label className="gf-config-label">Parameters (JSON)</label>
              <textarea
                className="gf-config-textarea"
                value={paramsDraft}
                onChange={(e) => setParamsDraft(e.target.value)}
                spellCheck={false}
                rows={14}
              />
              {paramsError && <div className="gf-config-error">{paramsError}</div>}
              <div className="gf-config-actions">
                <button type="button" className="ib-action-btn primary" onClick={saveParams}>
                  Save parameters
                </button>
                <button type="button" className="ib-action-btn" onClick={deleteSelectedNode}>
                  <Delete size={13} /> Delete node
                </button>
              </div>
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

const GRAPH_EDITOR_CSS = `
.gf-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.gf-meta-row {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.gf-name-input,
.gf-description-input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.gf-name-input {
  width: 240px;
  font-weight: 700;
}

.gf-description-input {
  flex: 1;
  min-width: 0;
}

.gf-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.gf-palette {
  overflow-y: auto;
  padding: 10px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border-subtle);
}

.gf-palette-empty {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  padding: 6px 2px;
}

.gf-palette-error {
  color: #ff6b6b;
}

.gf-palette-group {
  margin-bottom: 14px;
}

.gf-palette-group-label {
  font-size: var(--font-size-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.gf-palette-item {
  padding: 7px 9px;
  margin-bottom: 5px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: grab;
  user-select: none;
}

.gf-palette-item:hover {
  color: var(--color-text);
  border-color: var(--color-border);
}

.gf-canvas {
  position: relative;
  min-width: 0;
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

.gf-config-head strong {
  display: block;
  font-size: var(--font-size-sm);
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

.gf-node {
  min-width: 150px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.gf-node-head {
  padding: 7px 10px;
  border-left: 3px solid var(--color-cta);
  background: var(--color-surface);
}

.gf-node-type {
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: 800;
}

.gf-node-id {
  padding: 4px 10px 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}

.gf-node-ports {
  padding: 6px 0;
}

.gf-node-port-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 2px 10px;
  min-height: 18px;
}

.gf-port-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}

.gf-handle {
  width: 9px;
  height: 9px;
  background: var(--color-cta);
  border: 1px solid var(--color-bg);
}
`

export function GraphEditor(props: GraphEditorProps) {
  return (
    <ReactFlowProvider>
      <GraphEditorInner {...props} />
    </ReactFlowProvider>
  )
}
