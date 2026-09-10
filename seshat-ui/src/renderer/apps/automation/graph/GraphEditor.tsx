import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  type Connection,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Close, Plus, Undo as UndoIcon, Redo as RedoIcon, TreeDiagram, Magic, BlockOne, Play, LoadingOne } from '@icon-park/react'
import { definitionToFlow, flowToDefinition, ancestorClosure, INPUT_HANDLE } from './convert'
import { missingRequiredFields } from './validation'
import { GRAPH_NODE_TYPES, type FlowGraphNode, type TestStatus, type TestRunNodeResult } from './GraphNode'
import { NodeCreator } from './NodeCreator'
import { ParameterForm } from './ParameterForm'
import type { RetrySettingsValue } from './RetrySettingsField'
import type { DataflowDefinition, NodeDescription } from './types'
import { useUIStore } from '@/stores/ui'
import { api, ApiError } from '@/api/client'

type TestRunResponse = { success: boolean; results: Record<string, TestRunNodeResult> }

// One color per node-type Category, cycled if the live catalog ever grows a
// 6th - purely cosmetic grouping, never a correctness signal (the type
// string is what actually matters to the backend).
const CATEGORY_COLORS = ['#EF7C2F', '#4C9AFF', '#57D9A3', '#B197FC', '#FF8ED4', '#FFC53D']

// Exported alongside GRAPH_EDITOR_CSS for GraphReplayViewer.tsx (Tier 2.6)
// to reuse verbatim - same reasoning: a 7th category added to CATEGORY_
// COLORS later should never need updating in two places.
export function categoryColor(category: string, allCategories: string[]): string {
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

type FlowState = { nodes: FlowGraphNode[]; edges: Edge[] }

type GraphEditorProps = {
  value: DataflowDefinition | null
  onChange: (def: DataflowDefinition) => void
  nodeTypes: NodeDescription[]
  nodeTypesLoading?: boolean
  nodeTypesError?: string | null
  // Only known once the job has been saved (a webhook needs a stable
  // per-job token, minted server-side on first save - see
  // ParameterForm.tsx's webhook_trigger branch for where these surface).
  jobId?: string
  webhookToken?: string
  // Same "only known once saved" reasoning as jobId - lets "test this node"
  // (Tier 2.4) scope secret/expression resolution the same way a real run
  // would. Absent for a never-saved job, which just hides the test action
  // (see ParameterForm.tsx), same precondition Scheduling's whole-graph
  // "Run now" already has.
  organizationId?: string
  // The organization's own Variables (Tier 3.2), by name only - threaded
  // straight through to ParameterForm/ExpressionField for the $vars.NAME
  // insert chips. Fetched once by AutomationPage alongside nodeTypes.
  variableNames?: string[]
  // "Run now" is AutomationPage's own handleRunThisJob/runningThisJob/isNew
  // state (the job's whole lifecycle, not something the canvas owns) -
  // threaded through so the canvas toolbar can offer the same action the
  // topbar's own Run button already does, without duplicating that state
  // here. onRun is undefined until the job is saved for the first time
  // (same "nothing to run yet" precondition the topbar button already
  // encodes via its own disabled+title combo).
  onRun?: () => void
  running?: boolean
}

function GraphEditorInner({ value, onChange, nodeTypes, nodeTypesLoading, nodeTypesError, jobId, webhookToken, organizationId, variableNames, onRun, running }: GraphEditorProps) {
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

  // Undo/redo history. Plain refs, not state, since the stacks themselves
  // never need to drive a render directly - historyTick exists purely to
  // force one so the Undo/Redo buttons' disabled state stays in sync.
  const historyPast = useRef<FlowState[]>([])
  const historyFuture = useRef<FlowState[]>([])
  const [, setHistoryTick] = useState(0)

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
        return { ...n, data: { ...n.data, categoryColor: categoryColor(category, categories), title: desc?.name, category, isTrigger: desc?.isTrigger } }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length])

  // Every mutation in this file funnels through emitChange, so it's the one
  // choke point where a history snapshot can be pushed for free instead of
  // instrumenting every individual handler (add/delete/move/duplicate/
  // rename node, connect/reconnect/delete edge, save parameters). Captures
  // `nodes`/`edges` as they still are at call time (the caller's own
  // setNodes/setEdges have been scheduled but not yet applied to this
  // closure), i.e. exactly the pre-change state undo should restore.
  const emitChange = useCallback(
    (nextNodes: FlowGraphNode[], nextEdges: Edge[], name?: string, description?: string) => {
      historyPast.current = [...historyPast.current, { nodes, edges }].slice(-50)
      historyFuture.current = []
      setHistoryTick((t) => t + 1)
      onChange(flowToDefinition(name ?? graphName, description ?? graphDescription, nextNodes, nextEdges))
    },
    [onChange, graphName, graphDescription, nodes, edges],
  )

  // Undo/redo apply a snapshot directly (setNodes/setEdges + onChange) and
  // bypass emitChange entirely - going through it would push a new history
  // entry for the undo/redo action itself, corrupting the stack.
  function undo() {
    const previous = historyPast.current.at(-1)
    if (!previous) return
    historyPast.current = historyPast.current.slice(0, -1)
    historyFuture.current = [{ nodes, edges }, ...historyFuture.current]
    setNodes(previous.nodes)
    setEdges(previous.edges)
    onChange(flowToDefinition(graphName, graphDescription, previous.nodes, previous.edges))
    setHistoryTick((t) => t + 1)
  }

  function redo() {
    const next = historyFuture.current[0]
    if (!next) return
    historyFuture.current = historyFuture.current.slice(1)
    historyPast.current = [...historyPast.current, { nodes, edges }]
    setNodes(next.nodes)
    setEdges(next.edges)
    onChange(flowToDefinition(graphName, graphDescription, next.nodes, next.edges))
    setHistoryTick((t) => t + 1)
  }

  const canUndo = historyPast.current.length > 0
  const canRedo = historyFuture.current.length > 0

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

  // Dragging an existing edge's endpoint onto a different node/port rewires
  // it in place - without this, the only way to move a connection was
  // delete it and draw a brand new one from scratch. Providing this handler
  // is also what makes edges reconnectable at all (off by default otherwise).
  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      setEdges((eds) => {
        const next = reconnectEdge(oldEdge, { ...connection, targetHandle: INPUT_HANDLE }, eds)
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
  // No assistant feature exists yet (see the toolbar's Assistant button
  // below) - this is purely a transient "not yet" acknowledgement, same
  // local-timeout pattern VariablesPanel's copiedId already uses, not a
  // real feature flag.
  const [assistantComingSoon, setAssistantComingSoon] = useState(false)

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
          isTrigger: desc.isTrigger,
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

  function savePinnedOutput(next: Record<string, unknown>[] | undefined) {
    if (!selectedNode) return
    const nextNodes = nodes.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, pinnedOutput: next } } : n))
    setNodes(nextNodes)
    emitChange(nextNodes, edges)
  }

  function saveRetrySettings(next: RetrySettingsValue) {
    if (!selectedNode) return
    const nextNodes = nodes.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...next } } : n))
    setNodes(nextNodes)
    emitChange(nextNodes, edges)
  }

  function deleteSelectedNode() {
    if (!selectedNode) return
    onNodesDelete([selectedNode])
  }

  // Purely local UI state (never through emitChange/onChange - a test run
  // changes nothing about the saved graph, so it must not trip the "you
  // have unsaved changes" prompt or mark the job dirty).
  function setNodeTestStatus(ids: string[], status: TestStatus, patch?: Partial<Record<string, { result?: TestRunNodeResult; snapshot?: string }>>) {
    setNodes((current) => current.map((n) => (ids.includes(n.id) ? {
      ...n,
      data: { ...n.data, testStatus: status, testResult: patch?.[n.id]?.result ?? n.data.testResult, testSnapshot: patch?.[n.id]?.snapshot ?? n.data.testSnapshot },
    } : n)))
  }

  // "Dirty" (n8n's CanvasNodeDirtiness, collapsed to one boolean - see the
  // Tier 2.4 plan) is exactly "would re-sending the same ancestor-closure
  // sub-graph produce different JSON than what was actually tested" - a
  // param edit, a rewired connection, or a pin change anywhere in the
  // node's own upstream chain all change that serialization, so this one
  // comparison catches every case n8n's own 4-reason enum does.
  function isNodeTestStale(node: FlowGraphNode): boolean {
    if (!node.data.testSnapshot) return false
    return nodeTestSnapshot(node.id) !== node.data.testSnapshot
  }

  // Runs nodeId's own ancestor closure (Tier 2.4) - the real upstream chain
  // feeding it, so testing a node reflects genuine upstream data (pin any
  // costly upstream node first - Tier 2.3 - to skip re-running it for
  // real). Only available once the job is saved (jobId/organizationId both
  // set) - see ParameterForm.tsx, the same precondition Scheduling's
  // whole-graph "Run now" already has.
  async function testNode(nodeId: string) {
    if (!jobId || !organizationId) return
    const closure = ancestorClosure(nodes, edges, nodeId)
    const closureIds = closure.nodes.map((n) => n.id)
    const def = flowToDefinition('test', '', closure.nodes, closure.edges)

    setNodeTestStatus(closureIds, 'running')
    try {
      const res = await api.post<TestRunResponse>('/automation/dataflow/test-run', { organization_id: organizationId, graph: def, seed: [{}] })
      setNodes((current) => current.map((n) => {
        if (!closureIds.includes(n.id)) return n
        const r = res.results[n.id]
        // Each node's own snapshot must match what isNodeTestStale will
        // later recompute for THAT node specifically (its own ancestor
        // closure, not the target's) - an upstream node like a trigger has
        // a smaller closure than the node that was actually clicked, so a
        // shared snapshot string here would make it look stale immediately.
        return { ...n, data: { ...n.data, testStatus: r?.success ? 'success' : 'error', testResult: r, testSnapshot: nodeTestSnapshot(n.id) } }
      }))
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to test this node.'
      setNodeTestStatus([nodeId], 'error', { [nodeId]: { result: { success: false, error: message } } })
    }
  }

  function nodeTestSnapshot(nodeId: string): string {
    const closure = ancestorClosure(nodes, edges, nodeId)
    return JSON.stringify(flowToDefinition('test', '', closure.nodes, closure.edges))
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
      const active = document.activeElement?.tagName
      if (active === 'INPUT' || active === 'TEXTAREA' || active === 'SELECT') return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()

      if (key === 'd') {
        if (!selectedNodeId) return
        e.preventDefault()
        duplicateSelectedNode()
        return
      }
      // Ctrl+Z / Cmd+Shift+Z (Mac redo convention) undo; Ctrl+Shift+Z and
      // Ctrl+Y (the two conventions in real use on Windows/Linux) redo.
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, nodes, edges])

  // Display-only: injects each node's current staleness (see
  // isNodeTestStale) into a copy of `nodes` for rendering - never fed back
  // into React Flow's own onNodesChange/setNodes state.
  const nodesForCanvas = nodes.map((n) => {
    const warnings = missingRequiredFields(nodeTypes.find((nt) => nt.type === n.data.dfType)?.properties, n.data.parameters)
    if (!n.data.testStatus && warnings.length === 0) return n
    return {
      ...n,
      data: {
        ...n.data,
        ...(n.data.testStatus ? { isStale: isNodeTestStale(n) } : {}),
        validationWarnings: warnings,
      },
    }
  })

  return (
    <div className="gf-root">
      <style>{GRAPH_EDITOR_CSS}</style>
      <div className="gf-body">
        <div className="gf-canvas" ref={wrapperRef}>
          <ReactFlow<FlowGraphNode>
            nodes={nodesForCanvas}
            edges={edges}
            nodeTypes={GRAPH_NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
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
            // Uncapped, fitView zooms in as far as it takes to fill the
            // viewport with however few nodes exist - for a 1-2 node graph
            // that means a single huge node on load. Capping how far IN it's
            // allowed to go keeps the initial view small/zoomed-out; it can
            // never prevent zooming out to see everything, only zooming in.
            fitViewOptions={{ maxZoom: 0.85 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} orientation="horizontal" />
          </ReactFlow>

          <div className="gf-history-controls">
            <button type="button" className="gf-history-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              <UndoIcon size={15} />
            </button>
            <button type="button" className="gf-history-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
              <RedoIcon size={15} />
            </button>
          </div>

          {/* Left-edge vertical toolbar - vertically centered so it never
              collides with the undo/redo cluster (top-left) or the node
              config panel (slides in from the right, see .gf-config-panel).
              Assistant is a placeholder (no AI-generated-workflow backend
              exists yet) - Run and Add node are both real, existing actions
              relocated here from the topbar's "+" button and (for Run) the
              topbar itself, which keeps its own Run button too. */}
          <div className="gf-toolbar">
            <div className="gf-toolbar-item">
              <button
                type="button"
                className="gf-toolbar-btn"
                onClick={() => {
                  setAssistantComingSoon(true)
                  window.setTimeout(() => setAssistantComingSoon(false), 1600)
                }}
                title="Assistant"
              >
                <Magic size={17} />
              </button>
              {assistantComingSoon && <span className="gf-toolbar-tooltip">Coming soon</span>}
            </div>

            {onRun && (
              <>
                <span className="gf-toolbar-divider" />
                <button type="button" className="gf-toolbar-btn" onClick={onRun} disabled={running} title="Run now">
                  {running ? <LoadingOne size={17} className="spin" /> : <Play size={17} />}
                </button>
              </>
            )}

            <span className="gf-toolbar-divider" />
            <button type="button" className="gf-toolbar-btn" onClick={() => setCreatorOpen(true)} title="Add node">
              <BlockOne size={17} />
            </button>
          </div>

          {nodes.length === 0 && (
            <div className="gf-canvas-hint">
              <div className="gf-canvas-hint-icon">
                <TreeDiagram size={22} />
              </div>
              <h2>Design your automation</h2>
              <p>Add a trigger to start, then chain the steps that follow.</p>
              <button type="button" className="gf-canvas-hint-cta" onClick={() => setCreatorOpen(true)}>
                <Plus size={14} /> Add your first node
              </button>
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
                nodeType={selectedNode.data.dfType}
                nodeId={selectedNode.id}
                parameters={selectedNode.data.parameters}
                properties={nodeTypes.find((nt) => nt.type === selectedNode.data.dfType)?.properties}
                isTestable={nodeTypes.find((nt) => nt.type === selectedNode.data.dfType)?.isTestable}
                jobId={jobId}
                webhookToken={webhookToken}
                organizationId={organizationId}
                variableNames={variableNames ?? []}
                siblingNodes={nodes.filter((n) => n.id !== selectedNode.id).map((n) => ({ id: n.id, type: n.data.dfType }))}
                pinnedOutput={selectedNode.data.pinnedOutput}
                onPinnedOutputChange={savePinnedOutput}
                retrySettings={{
                  retryOnFail: selectedNode.data.retryOnFail,
                  maxTries: selectedNode.data.maxTries,
                  waitBetweenTriesMs: selectedNode.data.waitBetweenTriesMs,
                  onError: selectedNode.data.onError,
                }}
                onRetrySettingsChange={saveRetrySettings}
                canTestNode={!!jobId && !!organizationId}
                testStatus={selectedNode.data.testStatus}
                testResult={selectedNode.data.testResult}
                testStale={isNodeTestStale(selectedNode)}
                onTestNode={() => void testNode(selectedNode.id)}
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

// Exported so GraphReplayViewer.tsx (Tier 2.6) can reuse the exact same
// canvas/node-card/side-panel styling for its own read-only view of a past
// run, instead of duplicating ~550 lines of CSS that would inevitably drift
// from this one. Unused selectors (e.g. the NodeCreator/undo-redo chrome
// replay never renders) are harmless dead weight, not a bug.
export const GRAPH_EDITOR_CSS = `
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
  overflow: hidden;
}

.gf-canvas {
  position: relative;
  flex: 1;
  min-width: 0;
}

.gf-history-controls {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 10;
  display: flex;
  gap: 6px;
}

.gf-history-btn {
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

.gf-history-btn:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-hover);
}

.gf-history-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Left-edge vertical toolbar (Assistant/Run/Add node) - vertically
   centered so it never collides with .gf-history-controls (top-left) or
   .gf-config-panel (slides in from the right). Same card language as the
   history controls right above, just laid out as one grouped pill instead
   of a loose row. */
.gf-toolbar {
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  box-shadow: var(--shadow-medium);
}

.gf-toolbar-item {
  position: relative;
}

.gf-toolbar-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.gf-toolbar-btn:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-hover);
}

.gf-toolbar-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.gf-toolbar-divider {
  width: 22px;
  height: 1px;
  background: var(--color-border-subtle);
  margin: 2px 0;
}

.gf-toolbar-tooltip {
  position: absolute;
  top: 50%;
  left: calc(100% + 10px);
  transform: translateY(-50%);
  white-space: nowrap;
  padding: 4px 9px;
  border-radius: var(--radius-sm);
  background: var(--color-text);
  color: var(--color-bg);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  box-shadow: var(--shadow-medium);
}

/* React Flow's own zoom/fit-view bar - default xyflow styling (plain white
   squares, sharp corners, no shadow) looked visually disconnected from the
   rest of the app. Same card language as .gf-history-btn/.gf-toolbar above.
   Shared with GraphReplayViewer.tsx via the same GRAPH_EDITOR_CSS export,
   so its zoom bar gets this for free too. */
.react-flow__controls {
  display: flex;
  gap: 6px;
  box-shadow: none;
}

.react-flow__controls-button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: var(--shadow-medium);
  fill: var(--color-text-secondary);
}

.react-flow__controls-button:hover {
  background: var(--color-hover);
  fill: var(--color-text);
}

/* pointer-events is re-enabled here (unlike the old bare hint) since this
   now carries a real, clickable CTA - only the empty area around it stays
   click-through so the canvas beneath (pan/zoom) still works. */
.gf-canvas-hint {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  padding: 0 24px;
}

.gf-canvas-hint-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 6px;
  border-radius: var(--radius-lg);
  background: var(--color-cta);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gf-canvas-hint h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 750;
  color: var(--color-text);
}

.gf-canvas-hint p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  max-width: 320px;
}

.gf-canvas-hint-cta {
  pointer-events: all;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-cta);
  color: white;
  font-size: var(--font-size-sm);
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow-medium);
}

.gf-config-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 340px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg);
  box-shadow: -14px 0 40px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  /* Higher than the canvas's own "+" add-node button and undo/redo
     controls (both z-index: 10, top-right/top-left of the canvas) - this
     panel's own close button sits at its top-right corner, exactly where
     the "+" button lives, and was rendering underneath it (unclickable). */
  z-index: 15;
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
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.gf-config-actions-row {
  display: flex;
  gap: 8px;
}

.gf-config-actions-row .gf-action-btn {
  flex: 1;
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

.gf-webhook-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gf-webhook-url {
  flex: 1;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 11px;
  overflow-x: auto;
  white-space: nowrap;
}

.gf-webhook-payload {
  margin: 0;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
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

/* Trigger nodes have no input handle (nothing connects into a graph's own
   entry point) - a fully rounded left edge makes that visually obvious
   instead of just quietly missing a handle other nodes have. */
.gf-node.trigger .gf-node-card {
  border-radius: 999px 10px 10px 999px;
}

.gf-node.selected .gf-node-card {
  border-color: var(--color-cta);
  box-shadow: 0 0 0 2px var(--color-primary-subtle), var(--shadow-medium);
}

/* Floats at the card's own top-right corner (positioned against .gf-node,
   the nearest positioned ancestor) rather than inline in the card's flex
   row, so it reads as a status badge on the node, not a fourth piece of
   its regular content. */
.gf-node-pin-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--color-cta);
  color: var(--color-bg);
  border: 2px solid var(--color-bg);
  z-index: 1;
}

/* Bottom-right, mirroring the pin badge's top-right corner so a node that
   is both pinned and tested never has the two overlap. */
.gf-node-test-badge {
  position: absolute;
  bottom: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 2px solid var(--color-bg);
  color: var(--color-bg);
  z-index: 1;
}

.gf-node-test-badge.running {
  background: var(--color-text-muted);
  animation: gf-test-pulse 1s ease-in-out infinite;
}

.gf-node-test-badge.success {
  background: #2ecc71;
}

.gf-node-test-badge.success.stale {
  background: var(--color-text-muted);
}

.gf-node-test-badge.error {
  background: #ff6b6b;
}

.gf-node-test-badge.skipped {
  background: var(--color-text-muted);
}

@keyframes gf-test-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.05); }
}

/* Top-left, the one corner the pin (top-right) and test-status (bottom-
   right) badges don't already use - distinct from both, per the doc's own
   "a badge distinct from the execution-error badge" framing (Tier 2.5). */
.gf-node-validation-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #f5a623;
  color: var(--color-bg);
  border: 2px solid var(--color-bg);
  z-index: 1;
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
