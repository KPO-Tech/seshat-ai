import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Book,
  Caution,
  CloseOne,
  DocDetail,
  FileExcel,
  FilePdf,
  FileText,
  FileWord,
  Home,
  Left,
  LoadingOne,
  Message as MessageIcon,
  Plus,
  Robot,
  Search,
  Setting,
  Upload,
} from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { MarkdownView } from '@/components/MarkdownView'
import { DocxPreviewPanel } from '@/components/chat/DocxPreviewPanel'
import { PDFViewerPanel } from '@/components/chat/PDFViewerPanel'
import { PptxPreviewPanel } from '@/components/chat/PptxPreviewPanel'
import { XlsxPreviewPanel } from '@/components/chat/XlsxPreviewPanel'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { PlannedFeatureCard, PLANNED_FEATURE_CARD_CSS } from '@/components/ui/PlannedFeatureCard'
import { streamingToContentBlocks, useSessionStore } from '@/stores/session'
import { useChat } from '@/hooks/useChat'
import { useProviders, fetchProviderModels } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { ChatInput, CHAT_INPUT_CSS } from '@/components/chat/ChatInput'
import { MessageItem, MESSAGE_ITEM_CSS, isRenderableMessage } from '@/components/chat/MessageItem'
import type { Corpus, CorpusFile, DoclingConfig, EmbedderConfig, FileItem, IngestionJob, Message as ApiMessage, ProviderModel, ProviderSetting } from '@/api/types'

type TaggedSearchResult = {
  key: string
  text: string
  score: number
  metadata?: Record<string, string>
  corpus_id: string
  corpus_name: string
}

type KnowledgeSearchResponse = {
  results: TaggedSearchResult[]
  corpora_searched: number
}

type CorpusDetail = {
  files: CorpusFile[]
  jobs: IngestionJob[]
  loading: boolean
  error: string | null
}

type KnowledgeView = 'search' | 'collections' | 'chat'
type KnowledgePreviewKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'markdown' | 'csv' | 'text' | 'image' | 'audio' | 'unsupported'

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])
const TEXT_EXTENSIONS = new Set(['txt', 'json', 'yaml', 'yml', 'log', 'tex'])
const MARKDOWN_CONVERTED_EXTENSIONS = new Set(['html', 'htm'])
// Rendered natively by the browser (<img>/<audio>) — no docling conversion
// needed for a *preview* (docling only matters for RAG text extraction from
// these, a separate concern). Superset of docconvert.DoclingOnlyExtensions
// on the backend (png/tiff/tif/jpeg/jpg/wav/mp3) plus common formats that
// convert fine in-browser without any backend involvement at all.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'tiff', 'tif', 'gif', 'bmp', 'webp'])
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'm4a', 'ogg', 'flac'])

function fileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function previewKind(filename: string): KnowledgePreviewKind {
  const ext = fileExtension(filename)
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (ext === 'pptx') return 'pptx'
  if (ext === 'csv' || ext === 'tsv') return 'csv'
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (MARKDOWN_CONVERTED_EXTENSIONS.has(ext)) return 'markdown'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  return 'unsupported'
}

function textPreviewEndpoint(file: CorpusFile, kind: KnowledgePreviewKind): string {
  const ext = fileExtension(file.filename)
  if (kind === 'markdown' && MARKDOWN_CONVERTED_EXTENSIONS.has(ext)) return `/files/${file.file_id}/markdown`
  return `/files/${file.file_id}/content`
}

function decodeDataUrlText(dataUrl: string): string {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

const EMPTY_DETAIL: CorpusDetail = { files: [], jobs: [], loading: false, error: null }

// Persists the user's chosen provider/model for the Knowledge Agent chat
// across restarts, same pattern as scheduling's PLANNER_PREFERENCE_KEY - the
// Knowledge Agent's session is reused indefinitely (see latestKnowledgeSession
// below), so without this the choice would reset every time the app relaunches.
const KNOWLEDGE_CHAT_PREFERENCE_KEY = 'seshat.knowledge-chat-preferred-model.v1'

type ChatModelPreference = { providerSettingId: string; modelId: string }

function loadChatModelPreference(): ChatModelPreference | null {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_CHAT_PREFERENCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.providerSettingId === 'string' && typeof parsed.modelId === 'string') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function saveChatModelPreference(pref: ChatModelPreference | null) {
  try {
    if (!pref) {
      localStorage.removeItem(KNOWLEDGE_CHAT_PREFERENCE_KEY)
      return
    }
    localStorage.setItem(KNOWLEDGE_CHAT_PREFERENCE_KEY, JSON.stringify(pref))
  } catch {
    // best-effort only
  }
}

function buildAgentInstruction(query: string, corpusName?: string): string {
  const scope = corpusName ? `Search only in the "${corpusName}" knowledge base.` : 'Search across the available knowledge bases.'
  return `${query}\n\n(${scope} Use the knowledge_search tool and answer only from retrieved knowledge. Cite sources inline with bracketed numbers like [1], [2] matching the tool results.)`
}

function formatDate(ts?: number): string {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function isJobActive(job: IngestionJob): boolean {
  return job.status === 'pending' || job.status === 'running'
}

function isFileReady(file: CorpusFile): boolean {
  return file.status === 'ingested' || file.status === 'completed'
}

export function KnowledgePage() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const resultRefs = useRef<Array<HTMLElement | null>>([])
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [chatPrompt, setChatPrompt] = useState('')
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null)
  const [rawResults, setRawResults] = useState<TaggedSearchResult[]>([])
  const [rawLoading, setRawLoading] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)

  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [selectedCorpusId, setSelectedCorpusId] = useState<string>('all')
  const [detail, setDetail] = useState<CorpusDetail>(EMPTY_DETAIL)
  const [corporaError, setCorporaError] = useState<string | null>(null)
  const [creatingCorpus, setCreatingCorpus] = useState(false)
  const [newCorpusName, setNewCorpusName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [publicLibraryOpen, setPublicLibraryOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [view, setView] = useState<KnowledgeView>('search')
  const [topK, setTopK] = useState(8)
  const [minChunkSize, setMinChunkSize] = useState(300)

  const [embedder, setEmbedder] = useState<EmbedderConfig | null>(null)
  const [docling, setDocling] = useState<DoclingConfig | null>(null)

  // Lets the user pick which provider/model answers Knowledge Agent chat
  // messages, mirroring Home.tsx's picker - see KNOWLEDGE_CHAT_PREFERENCE_KEY
  // above for why the choice is persisted rather than reset per session.
  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)
  const hasAppliedStoredPreference = useRef(false)

  const selectedCorpus = corpora.find((c) => c.id === selectedCorpusId) ?? null
  const totalChunks = corpora.reduce((sum, corpus) => sum + (corpus.chunk_count || 0), 0)
  const activeJobs = detail.jobs.filter(isJobActive).length
  const readyFiles = detail.files.filter(isFileReady).length
  const selectedScope = selectedCorpus?.workspace_id ? 'Organization' : 'Personal'

  const { sendMessage, stopMessage, isStreaming } = useChat(sessionId ?? '')
  const latestKnowledgeSession = useSessionStore((s) => {
    return s.sessions
      .filter((item) => item.source === 'knowledge')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0]
  })
  const session = useSessionStore((s) => (sessionId ? s.sessions.find((x) => x.id === sessionId) : undefined))
  const chatMessages = useMemo(() => session?.messages.filter(isRenderableMessage) ?? [], [session])

  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [chatMessages.length, isStreaming])

  useEffect(() => {
    if (!sessionId && latestKnowledgeSession) setSessionId(latestKnowledgeSession.id)
  }, [latestKnowledgeSession, sessionId])

  const selectedModels = useMemo(
    () => (selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []),
    [selectedProviderId, modelsByProvider],
  )
  const hasLoadedSelectedProviderModels = selectedProviderId
    ? Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)
    : false

  // Apply a stored preference once providers have loaded; otherwise fall
  // back to the organization default, same precedence as scheduling's
  // PlannerSettingsModal.
  useEffect(() => {
    if (hasAppliedStoredPreference.current || providersLoading || providers.length === 0) return
    hasAppliedStoredPreference.current = true
    const stored = loadChatModelPreference()
    const provider = (stored && providers.find((p) => p.id === stored.providerSettingId))
      ?? providers.find((p) => p.is_default)
      ?? providers[0]
    setSelectedProviderId(provider.id)
    if (stored && stored.providerSettingId === provider.id) setSelectedModelId(stored.modelId)
  }, [providers, providersLoading])

  useEffect(() => {
    if (!selectedProviderId) return
    if (!providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(null)
      setSelectedModelId(null)
    }
  }, [providers, selectedProviderId])

  useEffect(() => {
    if (!selectedProviderId || modelsByProvider[selectedProviderId]) return
    let cancelled = false
    setLoadingModelsFor(selectedProviderId)
    fetchProviderModels(selectedProviderId)
      .then((models) => {
        if (cancelled) return
        setModelsByProvider((current) => ({ ...current, [selectedProviderId]: models }))
      })
      .catch(() => {
        if (cancelled) return
        setModelsByProvider((current) => ({ ...current, [selectedProviderId]: [] }))
      })
      .finally(() => {
        if (!cancelled) setLoadingModelsFor((current) => (current === selectedProviderId ? null : current))
      })
    return () => { cancelled = true }
  }, [modelsByProvider, selectedProviderId])

  useEffect(() => {
    if (!hasLoadedSelectedProviderModels || selectedModelId || selectedModels.length === 0) return
    const def = selectedModels.find((m) => m.is_default) ?? selectedModels[0]
    setSelectedModelId(def.model_id)
  }, [hasLoadedSelectedProviderModels, selectedModelId, selectedModels])

  useEffect(() => {
    if (!selectedModelId || !hasLoadedSelectedProviderModels) return
    if (!selectedModels.some((model) => model.model_id === selectedModelId)) setSelectedModelId(null)
  }, [hasLoadedSelectedProviderModels, selectedModelId, selectedModels])

  useEffect(() => {
    if (!hasAppliedStoredPreference.current) return
    if (selectedProviderId && selectedModelId) {
      saveChatModelPreference({ providerSettingId: selectedProviderId, modelId: selectedModelId })
    }
  }, [selectedProviderId, selectedModelId])

  const loadCorpora = useCallback(async () => {
    setCorporaError(null)
    try {
      const [corporaData, embedderData, doclingData] = await Promise.all([
        api.get<{ corpora: Corpus[]; count: number }>('/corpora'),
        api.get<EmbedderConfig>('/settings/embedder').catch(() => null),
        api.get<DoclingConfig>('/settings/docling').catch(() => null),
      ])
      const items = corporaData.corpora ?? []
      setCorpora(items)
      setEmbedder(embedderData)
      setDocling(doclingData)
      setSelectedCorpusId((current) => {
        if (current === 'all') return current
        return items.some((item) => item.id === current) ? current : 'all'
      })
    } catch (err) {
      setCorporaError(err instanceof ApiError ? err.message : 'Unable to load knowledge bases.')
    }
  }, [])

  const loadCorpusDetail = useCallback(async (corpusID: string) => {
    if (corpusID === 'all') {
      setDetail(EMPTY_DETAIL)
      return
    }
    setDetail((current) => ({ ...current, loading: true, error: null }))
    try {
      const [filesData, jobsData] = await Promise.all([
        api.get<{ files: CorpusFile[] }>(`/corpora/${corpusID}/files`),
        api.get<{ jobs: IngestionJob[] }>(`/corpora/${corpusID}/ingest/jobs`),
      ])
      setDetail({
        files: filesData.files ?? [],
        jobs: jobsData.jobs ?? [],
        loading: false,
        error: null,
      })
    } catch (err) {
      setDetail({
        files: [],
        jobs: [],
        loading: false,
        error: err instanceof ApiError ? err.message : 'Unable to load corpus details.',
      })
    }
  }, [])

  useEffect(() => {
    void loadCorpora()
  }, [loadCorpora])

  useEffect(() => {
    void loadCorpusDetail(selectedCorpusId)
  }, [selectedCorpusId, loadCorpusDetail])

  useEffect(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
    if (selectedCorpusId === 'all' || activeJobs === 0) return
    pollTimer.current = setInterval(() => {
      void loadCorpusDetail(selectedCorpusId)
      void loadCorpora()
    }, 3000)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [activeJobs, loadCorpusDetail, loadCorpora, selectedCorpusId])

  useEffect(() => {
    if (sessionId && pendingPrompt) {
      const prompt = pendingPrompt
      setPendingPrompt(null)
      void sendMessage(prompt, {
        agentSlug: 'knowledge-agent',
        corpusId: selectedCorpusId === 'all' ? undefined : selectedCorpusId,
        providerSettingId: selectedProviderId,
        modelId: selectedModelId,
      })
    }
  }, [pendingPrompt, selectedCorpusId, sendMessage, sessionId, selectedProviderId, selectedModelId])

  useEffect(() => {
    if (!sessionId || !pendingChatMessage) return
    const prompt = pendingChatMessage
    setPendingChatMessage(null)
    void sendMessage(prompt, {
      agentSlug: 'knowledge-agent',
      corpusId: selectedCorpusId === 'all' ? undefined : selectedCorpusId,
      providerSettingId: selectedProviderId,
      modelId: selectedModelId,
    })
  }, [pendingChatMessage, selectedCorpusId, sendMessage, sessionId, selectedProviderId, selectedModelId])

  const assistantText = useMemo(() => {
    if (!session) return ''
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const message = session.messages[i]
      if (message.role !== 'assistant') continue
      return message.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n')
    }
    return ''
  }, [session])

  const answerParts = useMemo(() => splitCitations(assistantText), [assistantText])

  const runRawSearch = useCallback(async (q: string, corpusID: string) => {
    setRawLoading(true)
    setRawError(null)
    try {
      const res = await api.post<KnowledgeSearchResponse>('/knowledge/search', {
        query: q,
        top_k: topK,
        ...(corpusID !== 'all' ? { corpus_id: corpusID } : {}),
      })
      setRawResults(res.results ?? [])
    } catch (err) {
      setRawError(err instanceof ApiError ? err.message : 'Unable to search the knowledge base.')
      setRawResults([])
    } finally {
      setRawLoading(false)
    }
  }, [topK])

  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId
    if (latestKnowledgeSession) {
      setSessionId(latestKnowledgeSession.id)
      return latestKnowledgeSession.id
    }
    try {
      const created = await api.post<{ session_id: string; title?: string; created_at?: number }>('/sessions', {
        title: 'Knowledge Chat',
        source: 'knowledge',
      })
      useSessionStore.getState().upsertSession({
        id: created.session_id,
        title: created.title ?? 'Knowledge Chat',
        messages: [],
        createdAt: new Date((created.created_at ?? 0) * 1000 || Date.now()).toISOString(),
        source: 'knowledge',
      })
      setSessionId(created.session_id)
      return created.session_id
    } catch (err) {
      setSessionError(err instanceof ApiError ? err.message : 'Unable to start the assistant.')
      return null
    }
  }

  async function runSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setSubmittedQuery(trimmed)
    void runRawSearch(trimmed, selectedCorpusId)

    const instruction = buildAgentInstruction(trimmed, selectedCorpus?.name)
    if (sessionId) {
      void sendMessage(instruction, {
        agentSlug: 'knowledge-agent',
        corpusId: selectedCorpusId === 'all' ? undefined : selectedCorpusId,
        providerSettingId: selectedProviderId,
        modelId: selectedModelId,
      })
      return
    }
    const created = await ensureSession()
    if (created) setPendingPrompt(instruction)
  }

  // Entry point for CollectionsWorkspace's "Test" forms - takes an explicit
  // corpusId rather than reading selectedCorpusId from closure, since
  // setSelectedCorpusId(corpusId) below wouldn't be visible yet within this
  // same synchronous handler (React state updates are async).
  async function testSearch(q: string, corpusId: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setSelectedCorpusId(corpusId)
    setView('search')
    setSubmittedQuery(trimmed)
    void runRawSearch(trimmed, corpusId)

    const corpusName = corpora.find((c) => c.id === corpusId)?.name
    const instruction = buildAgentInstruction(trimmed, corpusId === 'all' ? undefined : corpusName)
    if (sessionId) {
      void sendMessage(instruction, {
        agentSlug: 'knowledge-agent',
        corpusId: corpusId === 'all' ? undefined : corpusId,
        providerSettingId: selectedProviderId,
        modelId: selectedModelId,
      })
      return
    }
    const created = await ensureSession()
    if (created) setPendingPrompt(instruction)
  }

  async function handleSendChatPrompt() {
    const prompt = chatPrompt.trim()
    if (!prompt) return
    const id = await ensureSession()
    if (!id) return
    setChatPrompt('')
    setPendingChatMessage(prompt)
  }

  async function handleContinueInChat() {
    const id = await ensureSession()
    if (!id) return
    setView('chat')
  }

  const handleKnowledgePermissionDecision = useCallback(async (toolUseId: string, approved: boolean, remember = false) => {
    if (!sessionId) return
    const current = useSessionStore.getState()
    const nextStreaming = current.getStreaming(sessionId).map((block) => {
      if (block.type !== 'tool_use' || block.id !== toolUseId) return block
      return {
        ...block,
        _status: approved ? ('running' as const) : ('failed' as const),
        _approval: undefined,
      }
    })
    current.setStreaming(sessionId, nextStreaming)
    const lastAssistant = [...(current.sessions.find((item) => item.id === sessionId)?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (lastAssistant?.id) {
      current.updateMessage(sessionId, lastAssistant.id, (message) => ({
        ...message,
        content: streamingToContentBlocks(nextStreaming),
      }))
    }
    current.updateAgentState(sessionId, { pendingPermission: null })
    try {
      await api.post(`/permissions/${toolUseId}`, { approved, remember, session_id: sessionId })
    } catch {
      // The stream will surface the final error if the permission bridge is gone.
    }
  }, [sessionId])

  const handleKnowledgePromptSubmission = useCallback(async (promptId: string, value: unknown) => {
    if (!sessionId) return
    const current = useSessionStore.getState()
    const nextStreaming = current.getStreaming(sessionId).map((block) => {
      if (block.type !== 'tool_use' || block.name !== 'ask_user_question' || block._prompt?.promptId !== promptId) return block
      return {
        ...block,
        _prompt: undefined,
        _message: 'Waiting for the tool result...',
      }
    })
    current.setStreaming(sessionId, nextStreaming)
    const lastAssistant = [...(current.sessions.find((item) => item.id === sessionId)?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (lastAssistant?.id) {
      current.updateMessage(sessionId, lastAssistant.id, (message) => ({
        ...message,
        content: streamingToContentBlocks(nextStreaming),
      }))
    }
    try {
      await api.post(`/prompts/${promptId}`, { value, session_id: sessionId })
    } catch {
      // The stream will surface the final error if the prompt bridge is gone.
    }
  }, [sessionId])

  const approveKnowledgeTool = useCallback((toolUseId: string, remember?: boolean) => {
    void handleKnowledgePermissionDecision(toolUseId, true, remember)
  }, [handleKnowledgePermissionDecision])

  const denyKnowledgeTool = useCallback((toolUseId: string) => {
    void handleKnowledgePermissionDecision(toolUseId, false)
  }, [handleKnowledgePermissionDecision])

  const submitKnowledgeToolPrompt = useCallback((promptId: string, value: unknown) => {
    void handleKnowledgePromptSubmission(promptId, value)
  }, [handleKnowledgePromptSubmission])

  async function createCorpus() {
    const name = newCorpusName.trim()
    if (!name) return
    setCreatingCorpus(true)
    setCorporaError(null)
    try {
      const corpus = await api.post<Corpus>('/corpora', { name })
      setCorpora((current) => [corpus, ...current])
      setSelectedCorpusId(corpus.id)
      setNewCorpusName('')
    } catch (err) {
      setCorporaError(err instanceof ApiError ? err.message : 'Unable to create the knowledge base.')
    } finally {
      setCreatingCorpus(false)
    }
  }

  async function uploadFile(file: File) {
    if (!selectedCorpus) return
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const uploaded = await api.upload<FileItem>('/files', form)
      await api.post(`/corpora/${selectedCorpus.id}/files`, { file_id: uploaded.id })
      await api.post(`/corpora/${selectedCorpus.id}/ingest`, { file_id: uploaded.id })
      await loadCorpusDetail(selectedCorpus.id)
      await loadCorpora()
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Unable to upload and ingest the file.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Re-enqueues ingestion for files a corpus already has. `mode: 'missing'`
  // targets files that never finished (not ready, no job already in
  // flight) - `mode: 'all'` re-queues every file without an active job,
  // for a full reprocess (e.g. after changing the embedder).
  async function processFiles(corpusId: string, mode: 'missing' | 'all') {
    const activeFileIds = new Set(detail.jobs.filter(isJobActive).map((job) => job.file_id))
    const targets = detail.files.filter((file) => {
      if (activeFileIds.has(file.file_id)) return false
      return mode === 'all' || !isFileReady(file)
    })
    if (targets.length === 0) return

    setProcessing(true)
    setProcessError(null)
    try {
      for (const file of targets) {
        await api.post(`/corpora/${corpusId}/ingest`, { file_id: file.file_id })
      }
      await loadCorpusDetail(corpusId)
    } catch (err) {
      setProcessError(err instanceof ApiError ? err.message : 'Unable to queue some files for processing.')
    } finally {
      setProcessing(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void runSearch(query)
  }

  function scrollToResult(n: number) {
    const index = n - 1
    const el = resultRefs.current[index]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedIndex(index)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightedIndex(null), 1600)
  }

  function resetSearch() {
    setQuery('')
    setSubmittedQuery('')
    setRawResults([])
    setRawError(null)
    setSessionError(null)
    setPendingPrompt(null)
    setHighlightedIndex(null)
  }

  return (
    <div className="k-root">
      <style>{KNOWLEDGE_CSS}</style>
      <style>{PLANNED_FEATURE_CARD_CSS}</style>
      <input
        ref={fileRef}
        type="file"
        className="k-hidden-file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void uploadFile(file)
        }}
      />
      <main className="k-content">
        <section className="k-toolbar">
          <div className="k-toolbar-heading">
            <button type="button" className="k-title-reset" onClick={resetSearch}>
              Knowledge
            </button>
          </div>
          <div className="k-view-switch" role="tablist" aria-label="Knowledge views">
            <button type="button" className={view === 'search' ? 'active' : ''} onClick={() => setView('search')}>
              <Search size={13} /> Search
            </button>
            <button type="button" className={view === 'collections' ? 'active' : ''} onClick={() => setView('collections')}>
              <Book size={13} /> Collections
            </button>
            <button type="button" className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}>
              <MessageIcon size={13} /> Chat
            </button>
          </div>
          <div className="k-toolbar-actions">
            <button type="button" className="k-settings-btn" onClick={() => setPublicLibraryOpen(true)}>
              <Book size={13} /> Public
            </button>
            <button type="button" className="k-settings-btn" onClick={() => setAdvancedOpen(true)}>
              <Setting size={13} /> Advanced
            </button>
          </div>
        </section>

        <section className={`k-dashboard ${view === 'search' ? 'search-only' : ''} ${view === 'chat' ? 'chat-only' : ''}`}>
          <section className="k-workspace">
            {view === 'collections' ? (
              <CollectionsWorkspace
                corpora={corpora}
                selectedCorpus={selectedCorpus}
                selectedScope={selectedScope}
                detail={detail}
                readyFiles={readyFiles}
                activeJobs={activeJobs}
                totalChunks={totalChunks}
                uploading={uploading}
                uploadError={uploadError}
                processing={processing}
                processError={processError}
                newCorpusName={newCorpusName}
                creatingCorpus={creatingCorpus}
                corporaError={corporaError}
                onNewCorpusNameChange={setNewCorpusName}
                onCreateCorpus={createCorpus}
                onBrowsePublic={() => setPublicLibraryOpen(true)}
                onUpload={() => fileRef.current?.click()}
                onSelectCorpus={setSelectedCorpusId}
                onTestSearch={testSearch}
                onProcessMissing={(corpusId) => void processFiles(corpusId, 'missing')}
                onProcessAll={(corpusId) => void processFiles(corpusId, 'all')}
                onRetryDetail={(corpusId) => void loadCorpusDetail(corpusId)}
              />
            ) : view === 'chat' ? (
              <KnowledgeChatWorkspace
                messages={chatMessages}
                prompt={chatPrompt}
                isStreaming={isStreaming}
                selectedCorpus={selectedCorpus}
                selectedCorpusId={selectedCorpusId}
                scrollRef={chatScrollRef}
                onPromptChange={setChatPrompt}
                onSend={handleSendChatPrompt}
                onStop={() => { void stopMessage() }}
                onApproveTool={approveKnowledgeTool}
                onDenyTool={denyKnowledgeTool}
                onSubmitToolPrompt={submitKnowledgeToolPrompt}
                providers={providers}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                selectedModels={selectedModels}
                hasLoadedSelectedProviderModels={hasLoadedSelectedProviderModels}
                loadingModelsFor={loadingModelsFor}
                onProviderSelect={(id) => { setSelectedProviderId(id); setSelectedModelId(null) }}
                onModelSelect={setSelectedModelId}
              />
            ) : (
              <SearchWorkspace
                query={query}
                submittedQuery={submittedQuery}
                rawResults={rawResults}
                rawLoading={rawLoading}
                rawError={rawError}
                isStreaming={isStreaming}
                sessionError={sessionError}
                pendingPrompt={pendingPrompt}
                assistantText={assistantText}
                answerParts={answerParts}
                highlightedIndex={highlightedIndex}
                resultRefs={resultRefs}
                sessionId={sessionId}
                onQueryChange={setQuery}
                onReset={resetSearch}
                onSubmit={handleSubmit}
                onScrollToResult={scrollToResult}
                onContinue={handleContinueInChat}
              />
            )}
          </section>
        </section>
      </main>
      {publicLibraryOpen && (
        <PublicLibraryModal onClose={() => setPublicLibraryOpen(false)} />
      )}
      {advancedOpen && (
        <KnowledgeAdvancedPanel
          corpora={corpora}
          selectedCorpusId={selectedCorpusId}
          embedder={embedder}
          docling={docling}
          topK={topK}
          minChunkSize={minChunkSize}
          onTopKChange={setTopK}
          onMinChunkSizeChange={setMinChunkSize}
          onSelectCorpus={setSelectedCorpusId}
          onClose={() => setAdvancedOpen(false)}
        />
      )}
    </div>
  )
}

function SearchWorkspace({
  query,
  submittedQuery,
  rawResults,
  rawLoading,
  rawError,
  isStreaming,
  sessionError,
  pendingPrompt,
  assistantText,
  answerParts,
  highlightedIndex,
  resultRefs,
  sessionId,
  onQueryChange,
  onReset,
  onSubmit,
  onScrollToResult,
  onContinue,
}: {
  query: string
  submittedQuery: string
  rawResults: TaggedSearchResult[]
  rawLoading: boolean
  rawError: string | null
  isStreaming: boolean
  sessionError: string | null
  pendingPrompt: string | null
  assistantText: string
  answerParts: AnswerPart[]
  highlightedIndex: number | null
  resultRefs: React.MutableRefObject<Array<HTMLElement | null>>
  sessionId: string | null
  onQueryChange: (value: string) => void
  onReset: () => void
  onSubmit: (e: React.FormEvent) => void
  onScrollToResult: (n: number) => void
  onContinue: () => void
}) {
  const hasSearch = Boolean(submittedQuery)

  return (
    <div className={`k-search-page ${hasSearch ? 'has-results' : ''}`}>
      <section className="k-search-stage">
        {!hasSearch && (
          <div className="k-search-brand">
            <Book size={34} />
            <h2>Seshat Knowledge</h2>
          </div>
        )}
        <form className="k-page-searchbar" onSubmit={onSubmit}>
          {hasSearch && (
            <button type="button" className="k-search-home" onClick={onReset} aria-label="Reset knowledge search">
              <Home size={15} />
            </button>
          )}
          <Search size={18} />
          <input
            type="text"
            placeholder="Search your indexed knowledge"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
          {query && (
            <button type="button" className="k-clear-query" onClick={() => onQueryChange('')} aria-label="Clear search">
              <CloseOne size={13} />
            </button>
          )}
          <button type="submit" className="k-search-submit" disabled={!query.trim() || rawLoading || isStreaming}>
            <Search size={15} />
          </button>
        </form>
      </section>

      {hasSearch && (
        <section className="k-search-results-page">
          <main className="k-search-main">
            <div className="k-search-tabs">
              <button type="button" className="active">All</button>
              <button type="button" disabled>Documents</button>
              <button type="button" disabled>Collections</button>
            </div>

            <article className="k-ai-overview">
              <div className="k-ai-label">
                <Book size={15} />
                <span>Knowledge overview</span>
                {isStreaming && <LoadingOne size={13} className="spin" />}
              </div>
              {sessionError && <div className="k-inline-error"><Caution size={13} />{sessionError}</div>}
              {!sessionError && !assistantText && (isStreaming || pendingPrompt) && (
                <div className="k-inline-empty"><LoadingOne size={13} className="spin" /> Searching knowledge</div>
              )}
              {answerParts.length > 0 ? (
                <div className="k-ai-answer">
                  {answerParts.map((part, i) =>
                    part.type === 'citation' ? (
                      <button
                        key={i}
                        type="button"
                        className="k-citation-chip"
                        onClick={() => onScrollToResult(part.n)}
                        disabled={part.n - 1 >= rawResults.length}
                      >
                        [{part.n}]
                      </button>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </div>
              ) : !rawLoading && !sessionError ? (
                <p className="k-ai-placeholder">Ask from indexed documents and Seshat will cite the matching chunks.</p>
              ) : null}
              {(assistantText || sessionId) && (
                <button type="button" className="k-continue-chat" onClick={onContinue}>
                  <MessageIcon size={13} />
                  Continue in chat
                </button>
              )}
            </article>

            <div className="k-result-count">
              {rawLoading ? 'Searching...' : `${rawResults.length} matching chunks for "${submittedQuery}"`}
            </div>
            {rawError && <div className="k-inline-error"><Caution size={13} />{rawError}</div>}
            {!rawLoading && !rawError && rawResults.length === 0 && (
              <div className="k-inline-empty">No results found for "{submittedQuery}".</div>
            )}
            <div className="k-search-result-list">
              {rawResults.map((r, i) => (
                <article
                  key={`${r.corpus_id}-${r.key}-${i}`}
                  ref={(el) => { resultRefs.current[i] = el }}
                  className={`k-search-result ${highlightedIndex === i ? 'highlighted' : ''}`}
                >
                  <div className="k-search-source">
                    <FileText size={15} />
                    <span>{r.metadata?.filename ?? r.corpus_name}</span>
                    <small>{r.corpus_name}</small>
                  </div>
                  <h3>{r.metadata?.filename ?? r.corpus_name}</h3>
                  <p>{r.text}</p>
                  <div className="k-search-meta">
                    <span>[{i + 1}]</span>
                    <span>score {r.score.toFixed(3)}</span>
                  </div>
                </article>
              ))}
            </div>
          </main>

          <aside className="k-search-side">
            <div className="k-side-card">
              <h3>Search scope</h3>
              <strong>Included knowledge</strong>
              <span>Personal and organization collections available to this account.</span>
            </div>
          </aside>
        </section>
      )}
    </div>
  )
}

function KnowledgeChatWorkspace({
  messages,
  prompt,
  isStreaming,
  selectedCorpus,
  selectedCorpusId,
  scrollRef,
  onPromptChange,
  onSend,
  onStop,
  onApproveTool,
  onDenyTool,
  onSubmitToolPrompt,
  providers,
  selectedProviderId,
  selectedModelId,
  selectedModels,
  hasLoadedSelectedProviderModels,
  loadingModelsFor,
  onProviderSelect,
  onModelSelect,
}: {
  messages: ApiMessage[]
  prompt: string
  isStreaming: boolean
  selectedCorpus: Corpus | null
  selectedCorpusId: string
  scrollRef: React.MutableRefObject<HTMLDivElement | null>
  onPromptChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onApproveTool: (toolUseId: string, remember?: boolean) => void
  onDenyTool: (toolUseId: string) => void
  onSubmitToolPrompt: (promptId: string, value: unknown) => void
  providers: ProviderSetting[]
  selectedProviderId: string | null
  selectedModelId: string | null
  selectedModels: ProviderModel[]
  hasLoadedSelectedProviderModels: boolean
  loadingModelsFor: string | null
  onProviderSelect: (id: string) => void
  onModelSelect: (id: string) => void
}) {
  const scopeLabel = selectedCorpusId === 'all' ? 'All included knowledge' : selectedCorpus?.name ?? 'Selected collection'
  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null
  const selectedModel = selectedModels.find((m) => m.model_id === selectedModelId) ?? null

  return (
    <div className="k-chat-page">
      <section className="k-chat-main">
        <header className="k-chat-head">
          <div className="k-chat-title">
            <Robot size={17} />
            <div>
              <span>Knowledge Agent</span>
              <strong>Chat</strong>
            </div>
          </div>
          <div className="k-chat-scope">
            <Book size={13} />
            {scopeLabel}
          </div>
        </header>

        <div className="k-chat-transcript" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="k-chat-empty">
              <Book size={34} />
              <h2>Ask the Knowledge Agent</h2>
              <p>Use this chat for deeper work around internal knowledge, cited analysis, and follow-up questions.</p>
            </div>
          ) : (
            <div className="k-chat-message-list">
              {messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  onApproveTool={onApproveTool}
                  onDenyTool={onDenyTool}
                  onSubmitToolPrompt={onSubmitToolPrompt}
                />
              ))}
            </div>
          )}
        </div>

        <ChatInput
          value={prompt}
          onChange={onPromptChange}
          onSend={onSend}
          onStop={onStop}
          isStreaming={isStreaming}
          placeholder="Ask the Knowledge Agent..."
          providerLabel={selectedProvider?.name ?? 'Provider'}
          modelLabel={selectedModel?.display_name || selectedModel?.model_id || 'Model'}
          providerOptions={providers.map((provider) => ({ id: provider.id, label: provider.name }))}
          modelOptions={
            selectedProviderId && hasLoadedSelectedProviderModels
              ? selectedModels.map((model) => ({ id: model.model_id, label: model.display_name || model.model_id }))
              : undefined
          }
          selectedProviderId={selectedProviderId}
          selectedModelId={selectedModelId}
          onProviderSelect={onProviderSelect}
          onModelSelect={onModelSelect}
          providerDisabled={providers.length === 0}
          modelDisabled={
            !selectedProviderId ||
            loadingModelsFor === selectedProviderId ||
            selectedModels.length === 0
          }
        />
      </section>

      <aside className="k-chat-side">
        <div className="k-chat-card">
          <span>Mode</span>
          <strong>Knowledge-first</strong>
          <p>Answers should prioritize indexed corpora and cite sources when available.</p>
        </div>
        <div className="k-chat-card muted">
          <span>Future tools</span>
          <strong>Reports, decks, browser workflows</strong>
          <p>Curated tools and skills can be attached here without changing the general assistant.</p>
        </div>
      </aside>
    </div>
  )
}

function CollectionsWorkspace({
  corpora,
  selectedCorpus,
  selectedScope,
  detail,
  readyFiles,
  activeJobs,
  totalChunks,
  uploading,
  uploadError,
  processing,
  processError,
  newCorpusName,
  creatingCorpus,
  corporaError,
  onNewCorpusNameChange,
  onCreateCorpus,
  onBrowsePublic,
  onUpload,
  onSelectCorpus,
  onTestSearch,
  onProcessMissing,
  onProcessAll,
  onRetryDetail,
}: {
  corpora: Corpus[]
  selectedCorpus: Corpus | null
  selectedScope: string
  detail: CorpusDetail
  readyFiles: number
  activeJobs: number
  totalChunks: number
  uploading: boolean
  uploadError: string | null
  processing: boolean
  processError: string | null
  newCorpusName: string
  creatingCorpus: boolean
  corporaError: string | null
  onNewCorpusNameChange: (value: string) => void
  onCreateCorpus: () => void
  onBrowsePublic: () => void
  onUpload: () => void
  onSelectCorpus: (id: string) => void
  onTestSearch: (query: string, corpusId: string) => void
  onProcessMissing: (corpusId: string) => void
  onProcessAll: (corpusId: string) => void
  onRetryDetail: (corpusId: string) => void
}) {
  const [openedCorpusId, setOpenedCorpusId] = useState<string | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [testQuery, setTestQuery] = useState('')
  const openedCorpus = openedCorpusId ? corpora.find((corpus) => corpus.id === openedCorpusId) ?? null : null
  const selectedFile = selectedFileId ? detail.files.find((file) => file.file_id === selectedFileId) ?? null : null

  useEffect(() => {
    if (!openedCorpus || detail.loading) return
    setSelectedFileId((current) => {
      if (current && detail.files.some((file) => file.file_id === current)) return current
      return null
    })
  }, [detail.files, detail.loading, openedCorpus])

  if (openedCorpus) {
    return (
      <div className="k-collections-page detail">
        {uploadError && <div className="k-page-error">{uploadError}</div>}
        {processError && <div className="k-page-error">{processError}</div>}

        <section className="k-collection-detail-grid">
          <main className="k-hub-panel">
            <div className="k-panel-title">
              <span className="k-file-heading">
                <button type="button" className="k-back-action" onClick={() => setOpenedCorpusId(null)} aria-label="Back to collections">
                  <Left size={14} />
                </button>
                Files
              </span>
              <div className="k-panel-actions">
                <button type="button" className="k-mini-action" onClick={onUpload} disabled={uploading}>
                  <Upload size={13} /> {uploading ? 'Uploading...' : 'Import files'}
                </button>
                <button
                  type="button"
                  className="k-mini-action"
                  onClick={() => onProcessMissing(openedCorpus.id)}
                  disabled={processing}
                >
                  <LoadingOne size={13} className={processing ? 'spin' : undefined} /> Process missing
                </button>
                <button
                  type="button"
                  className="k-mini-action primary"
                  onClick={() => onProcessAll(openedCorpus.id)}
                  disabled={processing}
                >
                  <LoadingOne size={13} className={processing ? 'spin' : undefined} /> Process all
                </button>
              </div>
            </div>
            <div className="k-detail-files">
              {detail.loading ? (
                <div className="k-preview-empty">
                  <LoadingOne size={18} className="spin" />
                  <span>Loading files…</span>
                </div>
              ) : detail.error ? (
                <div className="k-preview-empty error">
                  <Caution size={20} />
                  <span>{detail.error}</span>
                  <button type="button" className="k-mini-action" onClick={() => onRetryDetail(openedCorpus.id)}>
                    Retry
                  </button>
                </div>
              ) : detail.files.length === 0 ? (
                <button type="button" className="k-upload-drop large" onClick={onUpload} disabled={uploading}>
                  <Upload size={20} />
                  <span>{uploading ? 'Uploading...' : 'Import documents into this collection'}</span>
                </button>
              ) : detail.files.map((file) => (
                <button
                  key={file.file_id}
                  type="button"
                  className={`k-detail-file-row${selectedFile?.file_id === file.file_id ? ' active' : ''}`}
                  onClick={() => setSelectedFileId(file.file_id)}
                >
                  <KnowledgeFileIcon filename={file.filename} />
                  <span>
                    <strong>{file.filename}</strong>
                    <small>{file.chunk_count} chunks</small>
                  </span>
                  <StatusBadge status={file.status} />
                </button>
              ))}
            </div>
          </main>

          <aside className="k-detail-side">
            <section className="k-hub-panel k-preview-panel">
              <div className="k-panel-title">
                {selectedFile ? (
                  <>
                    <strong>{fileExtension(selectedFile.filename).toUpperCase() || 'FILE'}</strong>
                    <button type="button" className="k-preview-close" onClick={() => setSelectedFileId(null)} aria-label="Close preview">
                      <WindowCloseIcon />
                    </button>
                  </>
                ) : (
                  <>
                    <span>Test Search</span>
                    <strong>{openedCorpus.chunk_count} chunks</strong>
                  </>
                )}
              </div>
              <div className="k-preview-body">
                {selectedFile ? (
                  <KnowledgeDocumentPreview file={selectedFile} />
                ) : (
                  <form
                    className="k-test-search k-test-search-full"
                    onSubmit={(e) => {
                      e.preventDefault()
                      onTestSearch(testQuery, openedCorpus.id)
                    }}
                  >
                    <Search size={14} />
                    <input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Try a query..." />
                    <button type="submit" disabled={!testQuery.trim()}>Test</button>
                  </form>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    )
  }

  return (
    <div className="k-collections-page">
      <section className="k-collections-top">
        <div>
          <h2>Manage knowledge bases</h2>
        </div>
        <div className="k-hero-actions">
          <div className="k-inline-create">
            <input
              value={newCorpusName}
              onChange={(e) => onNewCorpusNameChange(e.target.value)}
              placeholder="New collection name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onCreateCorpus()
                }
              }}
            />
          </div>
          <button type="button" className="k-secondary-action" onClick={onBrowsePublic}>
            <Search size={14} /> Public library
          </button>
          <button type="button" className="k-primary-action" onClick={onCreateCorpus} disabled={!newCorpusName.trim() || creatingCorpus}>
            <Plus size={14} /> New collection
          </button>
        </div>
      </section>
      {corporaError && <div className="k-page-error">{corporaError}</div>}

      <section className="k-management-grid">
        <div className="k-hub-panel">
          <div className="k-panel-title">
            <span>Collections</span>
            <strong>{corpora.length} · {totalChunks} chunks</strong>
          </div>
          {corpora.length === 0 ? (
            <div className="k-dashboard-empty">Create your first collection.</div>
          ) : (
            <div className="k-collection-table">
              {corpora.map((corpus) => (
                <button
                  key={corpus.id}
                  type="button"
                  className={`k-collection-row ${selectedCorpus?.id === corpus.id ? 'active' : ''}`}
                  onClick={() => onSelectCorpus(corpus.id)}
                  onDoubleClick={() => {
                    onSelectCorpus(corpus.id)
                    setOpenedCorpusId(corpus.id)
                  }}
                >
                  <FileText size={15} />
                  <span>
                    <strong>{corpus.name}</strong>
                    <small>{corpus.workspace_id ? 'Organization' : 'Personal'} · updated {formatDate(corpus.updated_at)}</small>
                  </span>
                  <em>{corpus.chunk_count} chunks</em>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="k-hub-panel k-collection-summary">
          <div className="k-panel-title">
            <span>{selectedCorpus ? selectedCorpus.name : 'Selection'}</span>
            <strong>{selectedCorpus ? selectedScope : 'None'}</strong>
          </div>
          {!selectedCorpus ? (
            <div className="k-dashboard-empty">Select a collection, double-click to open.</div>
          ) : (
            <div className="k-detail-card-body">
              <div className="k-summary-lines">
                <div><span>Files</span><strong>{readyFiles}/{detail.files.length} ready</strong></div>
                <div><span>Jobs</span><strong>{activeJobs} active</strong></div>
                <div><span>Chunks</span><strong>{selectedCorpus.chunk_count}</strong></div>
              </div>
              <form
                className="k-test-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  onTestSearch(testQuery, selectedCorpus.id)
                }}
              >
                <Search size={14} />
                <input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Test this collection..." />
                <button type="submit" disabled={!testQuery.trim()}>Test</button>
              </form>
              <button type="button" className="k-secondary-action k-wide-action" onClick={() => setOpenedCorpusId(selectedCorpus.id)}>
                Open collection
              </button>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}

function KnowledgeFileIcon({ filename }: { filename: string }) {
  switch (previewKind(filename)) {
    case 'pdf':
      return <FilePdf size={14} />
    case 'docx':
      return <FileWord size={14} />
    case 'xlsx':
      return <FileExcel size={14} />
    case 'pptx':
      return <DocDetail size={14} />
    default:
      return <FileText size={14} />
  }
}

function KnowledgeDocumentPreview({ file }: { file: CorpusFile | null }) {
  const [text, setText] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')

  const kind = file ? previewKind(file.filename) : 'unsupported'

  useEffect(() => {
    let cancelled = false
    setText('')
    setMediaUrl('')
    setError('')

    if (!file || !['markdown', 'csv', 'text', 'image', 'audio'].includes(kind)) {
      setStatus(file ? 'ready' : 'idle')
      return
    }

    if (kind === 'image' || kind === 'audio') {
      setStatus('loading')
      void api.getFileDataURL(`/files/${file.file_id}/content`)
        .then((dataUrl) => {
          if (cancelled) return
          setMediaUrl(dataUrl)
          setStatus('ready')
        })
        .catch((err) => {
          if (cancelled) return
          setError(err instanceof ApiError ? err.message : 'Unable to load this document.')
          setStatus('error')
        })
      return () => {
        cancelled = true
      }
    }

    setStatus('loading')
    void api.getFileDataURL(textPreviewEndpoint(file, kind))
      .then((dataUrl) => {
        if (cancelled) return
        setText(decodeDataUrlText(dataUrl))
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Unable to load this document.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [file, kind])

  if (!file) {
    return (
      <div className="k-preview-empty">
        <FileText size={22} />
        <span>Select a file to preview it.</span>
      </div>
    )
  }

  if (kind === 'pdf') return <PDFViewerPanel fileId={file.file_id} filename={file.filename} />
  if (kind === 'docx') return <DocxPreviewPanel fileId={file.file_id} filename={file.filename} />
  if (kind === 'xlsx') return <XlsxPreviewPanel fileId={file.file_id} filename={file.filename} />
  if (kind === 'pptx') return <PptxPreviewPanel fileId={file.file_id} filename={file.filename} />

  if (status === 'loading') {
    return (
      <div className="k-preview-empty">
        <LoadingOne size={18} className="spin" />
        <span>Loading {file.filename}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="k-preview-empty error">
        <Caution size={20} />
        <span>{error}</span>
      </div>
    )
  }

  if (kind === 'markdown') {
    return (
      <div className="k-markdown-preview">
        <MarkdownView>{text || '*Empty document*'}</MarkdownView>
      </div>
    )
  }

  if (kind === 'csv') {
    return <CsvPreview text={text} delimiter={fileExtension(file.filename) === 'tsv' ? '\t' : ','} />
  }

  if (kind === 'text') {
    return <pre className="k-text-preview">{text || 'Empty document'}</pre>
  }

  if (kind === 'image') {
    return (
      <div className="k-image-preview">
        {mediaUrl && <img src={mediaUrl} alt={file.filename} />}
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <div className="k-audio-preview">
        {mediaUrl && <audio src={mediaUrl} controls />}
      </div>
    )
  }

  return (
    <div className="k-preview-empty">
      <FileText size={22} />
      <span>Preview is not available for this file type yet.</span>
    </div>
  )
}

function CsvPreview({ text, delimiter }: { text: string; delimiter: string }) {
  const rows = useMemo(() => parseDelimitedRows(text, delimiter).slice(0, 400), [delimiter, text])
  if (rows.length === 0) return <div className="k-preview-empty"><FileText size={22} /><span>Empty table.</span></div>
  return (
    <div className="k-csv-preview">
      <table>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => rowIndex === 0 ? (
                <th key={cellIndex}>{cell}</th>
              ) : (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let cell = ''
  let row: string[] = []
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        i++
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += char
  }

  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function PublicLibraryModal({ onClose }: { onClose: () => void }) {
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
          note="Requires an organization server with a shared knowledge catalog — see Settings → Cloud Automation."
        />
      </section>
    </div>
  )
}

function KnowledgeAdvancedPanel({
  corpora,
  selectedCorpusId,
  embedder,
  docling,
  topK,
  minChunkSize,
  onTopKChange,
  onMinChunkSizeChange,
  onSelectCorpus,
  onClose,
}: {
  corpora: Corpus[]
  selectedCorpusId: string
  embedder: EmbedderConfig | null
  docling: DoclingConfig | null
  topK: number
  minChunkSize: number
  onTopKChange: (value: number) => void
  onMinChunkSizeChange: (value: number) => void
  onSelectCorpus: (value: string) => void
  onClose: () => void
}) {
  const embedderReady = Boolean(embedder?.is_configured && embedder.enabled)
  const doclingReady = docling?.enabled !== false

  return (
    <div className="k-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="k-advanced-drawer" role="dialog" aria-modal="true" aria-label="Knowledge advanced settings" onMouseDown={(e) => e.stopPropagation()}>
        <header className="k-drawer-head">
          <div>
            <h2>Advanced</h2>
            <span>Knowledge search settings</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close advanced settings">
            <WindowCloseIcon size={14} />
          </button>
        </header>

        <section className="k-drawer-section">
          <h3>Search Scope</h3>
          <label className="k-field">
            <span>Collection</span>
            <select value={selectedCorpusId} onChange={(e) => onSelectCorpus(e.target.value)}>
              <option value="all">All included knowledge</option>
              {corpora.map((corpus) => (
                <option key={corpus.id} value={corpus.id}>{corpus.name}</option>
              ))}
            </select>
          </label>
          <p>Use one collection for focused answers, or all included knowledge for broader search.</p>
        </section>

        <section className="k-drawer-section">
          <h3>Retrieval</h3>
          <label className="k-field">
            <span>Matching chunks</span>
            <input
              type="range"
              min="3"
              max="20"
              value={topK}
              onChange={(e) => onTopKChange(Number(e.target.value))}
            />
          </label>
          <div className="k-range-value">{topK} results</div>
        </section>

        <section className="k-drawer-section">
          <h3>Chunking</h3>
          <label className="k-field">
            <span>Minimum chunk size</span>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={minChunkSize}
              onChange={(e) => onMinChunkSizeChange(Number(e.target.value))}
            />
          </label>
          <div className="k-range-value">{minChunkSize} characters</div>
          <p>This is ready for the UI, but needs a backend setting before it can affect future ingestion.</p>
        </section>

        <section className="k-drawer-section">
          <h3>Pipeline</h3>
          <div className="k-setting-row">
            <span>Embedding</span>
            <strong className={embedderReady ? 'ok' : 'warn'}>{embedderReady ? 'Ready' : 'Setup required'}</strong>
          </div>
          <div className="k-setting-row">
            <span>Docling</span>
            <strong className={doclingReady ? 'ok' : 'warn'}>{doclingReady ? 'On' : 'Off'}</strong>
          </div>
        </section>

        <section className="k-drawer-section muted">
          <h3>Coming Next</h3>
          <div className="k-setting-row">
            <span>Public sources</span>
            <strong>Opt-in</strong>
          </div>
          <div className="k-setting-row">
            <span>Company defaults</span>
            <strong>Server policy</strong>
          </div>
        </section>
      </aside>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'ingested' || status === 'completed'
    ? 'ok'
    : status === 'failed'
      ? 'bad'
      : 'wait'
  return <span className={`k-badge ${tone}`}>{status}</span>
}

type AnswerPart = { type: 'text'; text: string } | { type: 'citation'; n: number }

function splitCitations(text: string): AnswerPart[] {
  if (!text) return []
  const parts: AnswerPart[] = []
  const re = /\[(\d+)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    parts.push({ type: 'citation', n: Number(match[1]) })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', text: text.slice(lastIndex) })
  return parts
}

const KNOWLEDGE_CSS = `
${CHAT_INPUT_CSS}
${MESSAGE_ITEM_CSS}

.k-root {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
  position: relative;
}

.k-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.k-toolbar {
  min-height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-7);
  padding: 0 var(--space-8);
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  position: relative;
}

.k-toolbar-heading {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  flex-shrink: 0;
  margin-right: auto;
}

.k-title-reset {
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-base);
  line-height: 1.2;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.k-title-reset:hover {
  color: var(--color-cta);
}

.k-settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 9px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.k-settings-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.k-toolbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
}

.k-view-switch {
  display: inline-flex;
  align-items: center;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  gap: 20px;
  flex-shrink: 0;
}

.k-view-switch button {
  height: 30px;
  min-width: 0;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.k-view-switch button:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.k-view-switch button.active {
  background: rgba(239, 124, 47, 0.12);
  color: var(--color-text);
  border-color: rgba(239, 124, 47, 0.45);
}

.k-searchbar {
  flex: 1;
  min-width: 220px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.k-searchbar input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  outline: none;
}

.k-searchbar button {
  flex-shrink: 0;
  height: 28px;
  padding: 0 var(--space-5);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--color-cta);
  color: white;
  font-size: var(--font-size-sm);
  font-weight: 750;
  cursor: pointer;
}

.k-searchbar button:disabled {
  opacity: 0.45;
  cursor: default;
}

.k-dashboard {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  overflow: hidden;
}

.k-dashboard.search-only {
  grid-template-columns: minmax(0, 1fr);
}

.k-dashboard.chat-only {
  grid-template-columns: minmax(0, 1fr);
}

.k-manager {
  display: none;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
  padding: var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.k-workspace {
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.k-dashboard.chat-only .k-workspace {
  padding: var(--space-7) var(--space-8);
}

.k-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.k-status-tile {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 10px;
}

.k-status-tile span {
  display: block;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.k-status-tile strong {
  display: block;
  margin-top: 4px;
  font-size: var(--font-size-lg);
}

.k-status-tile.ok strong { color: var(--color-success); }
.k-status-tile.warn strong { color: var(--color-warning, #d97706); }

.k-setup {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(217,119,6,0.3);
  background: rgba(217,119,6,0.08);
  color: var(--color-text-secondary);
  border-radius: 8px;
  padding: 10px;
}

.k-setup strong,
.k-setup span {
  display: block;
  font-size: 11px;
}

.k-setup span {
  color: var(--color-text-muted);
  margin-top: 2px;
  line-height: 1.35;
}

.k-setup button {
  border: 0;
  border-radius: 6px;
  background: var(--color-cta);
  color: white;
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.k-manager-section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.k-section-head {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.k-section-head button,
.k-create-row button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.k-section-head button:hover,
.k-create-row button:hover:not(:disabled) {
  background: var(--color-hover);
}

.k-create-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-create-row input {
  min-width: 0;
  height: 30px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 9px;
  font-size: 12px;
  outline: none;
}

.k-corpus-list,
.k-file-list,
.k-job-list {
  display: flex;
  flex-direction: column;
}

.k-corpus-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 52px;
  border: 0;
  border-bottom: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  padding: 9px 12px;
  text-align: left;
  cursor: pointer;
}

.k-corpus-item:last-child { border-bottom: 0; }
.k-corpus-item:hover { background: var(--color-hover); }
.k-corpus-item.active {
  background: rgba(239, 124, 47, 0.1);
  color: var(--color-text);
}

.k-corpus-item span,
.k-file-row span {
  min-width: 0;
}

.k-corpus-item strong,
.k-file-row strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.k-corpus-item small,
.k-file-row small {
  display: block;
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 10px;
}

.k-detail-summary {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-detail-summary span {
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.k-upload-drop {
  margin: 10px;
  min-height: 88px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 800;
  cursor: pointer;
}

.k-file-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  min-height: 44px;
  padding: 8px 10px;
  border-top: 1px solid var(--color-border-subtle);
}

.k-job-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 32px;
  padding: 6px 10px;
  border-top: 1px solid var(--color-border-subtle);
  color: var(--color-text-muted);
  font-size: 11px;
}

.k-badge {
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 800;
}

.k-badge.ok {
  color: var(--color-success);
  background: rgba(111,175,123,0.14);
}

.k-badge.bad {
  color: var(--color-error);
  background: rgba(201,107,92,0.12);
}

.k-badge.wait {
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.k-mini-error {
  margin: 10px;
  border: 1px solid rgba(201,107,92,0.3);
  border-radius: 6px;
  background: rgba(201,107,92,0.08);
  color: var(--color-error);
  padding: 8px;
  font-size: 11px;
}

.k-hidden-file {
  display: none;
}

.k-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-muted);
  padding: 40px;
  text-align: center;
}

.k-empty h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 20px;
}

.k-empty p {
  max-width: 440px;
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

.k-home {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.k-hero-panel,
.k-hub-panel {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.k-hero-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.k-hero-copy {
  min-width: 0;
}

.k-eyebrow {
  display: block;
  color: var(--color-cta);
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.k-hero-copy h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.25;
}

.k-hero-copy p {
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
}

.k-hero-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.k-primary-action,
.k-secondary-action,
.k-public-head button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
}

.k-primary-action {
  border: 0;
  background: var(--color-cta);
  color: white;
}

.k-secondary-action,
.k-public-head button {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.k-hub-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.k-hub-card {
  min-width: 0;
  min-height: 96px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  padding: 16px;
  text-align: left;
  cursor: pointer;
}

.k-hub-card:hover,
.k-secondary-action:hover,
.k-public-head button:hover {
  background: var(--color-hover);
}

.k-hub-card.active {
  border-color: rgba(239, 124, 47, 0.42);
  background: rgba(239, 124, 47, 0.08);
}

.k-hub-card.muted {
  opacity: 0.78;
}

.k-hub-card strong,
.k-collection-card strong,
.k-status-stack strong {
  display: block;
  color: var(--color-text);
  font-size: 13px;
}

.k-hub-card small,
.k-collection-card small,
.k-status-stack span {
  display: block;
  margin-top: 4px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.k-hub-split {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
  gap: 12px;
}

.k-panel-title {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-panel-title span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 850;
}

.k-panel-title strong {
  color: var(--color-text-muted);
  font-size: 12px;
}

.k-panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  min-width: 0;
}

.k-mini-action {
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
}

.k-mini-action.primary {
  border-color: var(--color-cta);
  background: var(--color-cta);
  color: white;
}

.k-mini-action:hover:not(:disabled) {
  border-color: rgba(239, 124, 47, 0.45);
  color: var(--color-text);
}

.k-mini-action:disabled {
  opacity: 0.6;
  cursor: default;
}

.k-preview-close {
  width: auto;
  height: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  font-size: 13px;
  font-weight: 850;
  line-height: 1;
}

.k-preview-close:hover {
  color: var(--color-text);
  background: transparent;
}

.k-collection-grid,
.k-status-stack {
  padding: 14px;
}

.k-collection-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.k-collection-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
  padding: 12px;
  min-width: 0;
}

.k-collection-card span {
  min-width: 0;
}

.k-collection-card strong,
.k-collection-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.k-status-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.k-status-stack div {
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
  padding: 11px 12px;
}

.k-dashboard-empty {
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 12px;
}

.k-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(0, 0, 0, 0.45);
}

.k-public-modal {
  width: min(760px, 100%);
  max-height: min(620px, 100%);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
}

.k-public-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-public-head h2 {
  margin: 0;
  font-size: 16px;
}

.k-public-head p {
  margin: 5px 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
}


.k-drawer-backdrop {
  position: absolute;
  top: 56px;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 35;
  display: flex;
  justify-content: flex-end;
  background: transparent;
}

.k-advanced-drawer {
  width: min(390px, 100%);
  height: 100%;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg);
  box-shadow: -18px 0 60px rgba(0, 0, 0, 0.26);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.k-drawer-head {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0 18px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-drawer-head h2 {
  margin: 0;
  font-size: 16px;
}

.k-drawer-head span {
  display: block;
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.k-drawer-head button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.k-drawer-section {
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-drawer-section.muted {
  opacity: 0.78;
}

.k-drawer-section h3 {
  margin: 0 0 12px;
  color: var(--color-text);
  font-size: 13px;
}

.k-drawer-section p {
  margin: 10px 0 0;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.k-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.k-field span {
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 800;
}

.k-field select,
.k-field input[type="range"] {
  width: 100%;
}

.k-field select {
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0 9px;
  outline: none;
}

.k-range-value {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.k-setting-row {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
  padding: 0 10px;
  margin-top: 8px;
}

.k-setting-row span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 750;
}

.k-setting-row strong {
  color: var(--color-text-muted);
  font-size: 11px;
}

.k-setting-row strong.ok {
  color: var(--color-success);
}

.k-setting-row strong.warn {
  color: var(--color-warning, #f59e0b);
}

.k-search-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.k-search-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 44px 24px;
}

.k-search-page.has-results .k-search-stage {
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 24px 7vw 14px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-search-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-secondary);
}

.k-search-brand h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 32px;
  line-height: 1.1;
  font-weight: 750;
}

.k-page-searchbar {
  width: min(760px, 100%);
  height: 54px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  padding: 0 10px 0 18px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}

.k-search-page.has-results .k-page-searchbar {
  width: min(900px, 68vw);
  height: 46px;
  box-shadow: none;
}

.k-page-searchbar input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 16px;
  outline: none;
}

.k-search-page.has-results .k-page-searchbar input {
  font-size: 14px;
}

.k-search-home,
.k-clear-query,
.k-search-submit {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  color: var(--color-text-muted);
  cursor: pointer;
}

.k-search-home {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--color-border-subtle);
}

.k-search-home:hover,
.k-clear-query:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.k-clear-query {
  background: transparent;
}

.k-search-submit {
  background: var(--color-cta);
  color: white;
}

.k-search-submit:disabled {
  opacity: 0.45;
  cursor: default;
}

.k-search-results-page {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 880px) minmax(260px, 360px);
  gap: 48px;
  overflow-y: auto;
  padding: 0 7vw 48px;
}

.k-search-main {
  min-width: 0;
}

.k-search-tabs {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 24px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-search-tabs button {
  height: 100%;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 750;
}

.k-search-tabs button.active {
  border-bottom-color: var(--color-text-secondary);
  color: var(--color-text);
}

.k-search-tabs button:disabled {
  opacity: 0.52;
}

.k-ai-overview {
  padding: 26px 0 18px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-ai-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 800;
}

.k-ai-answer {
  max-width: 760px;
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.62;
  white-space: pre-wrap;
}

.k-ai-placeholder {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.k-continue-link.inline {
  width: fit-content;
  height: 32px;
  margin-top: 14px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
}

.k-continue-chat {
  width: fit-content;
  height: 32px;
  margin-top: 16px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 750;
  cursor: pointer;
}

.k-continue-chat:hover {
  background: var(--color-hover);
  color: var(--color-text);
  border-color: rgba(239, 124, 47, 0.45);
}

.k-result-count {
  padding: 16px 0 6px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.k-search-result-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 10px;
}

.k-search-result {
  max-width: 780px;
  border-radius: 8px;
  padding: 4px 0 10px;
  transition: background 0.25s ease, box-shadow 0.25s ease;
}

.k-search-result.highlighted {
  background: rgba(239, 124, 47, 0.08);
  box-shadow: 0 0 0 10px rgba(239, 124, 47, 0.08);
}

.k-search-source {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.k-search-source small {
  color: var(--color-text-muted);
}

.k-search-result h3 {
  margin: 7px 0 5px;
  color: #9ec5ff;
  font-size: 18px;
  line-height: 1.25;
  font-weight: 650;
}

.k-search-result p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.55;
}

.k-search-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.k-search-side {
  min-width: 0;
  padding-top: 96px;
}

.k-side-card {
  position: sticky;
  top: 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg);
  padding: 20px;
}

.k-side-card h3 {
  margin: 0 0 14px;
  color: var(--color-text);
  font-size: 18px;
}

.k-side-card strong,
.k-side-card span {
  display: block;
}

.k-side-card strong {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.k-side-card span {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.k-chat-page {
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--space-7);
}

.k-chat-main,
.k-chat-side {
  min-width: 0;
  min-height: 0;
}

.k-chat-main {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  overflow: hidden;
}

.k-chat-head {
  min-height: 58px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: 0 var(--space-7);
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-chat-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.k-chat-title > svg {
  color: var(--color-cta);
}

.k-chat-title div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.k-chat-title span {
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.k-chat-title strong {
  color: var(--color-text);
  font-size: var(--font-size-lg);
}

.k-chat-scope {
  max-width: 340px;
  height: 30px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.k-chat-transcript {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-8);
}

.k-chat-message-list {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.k-chat-empty {
  height: 100%;
  min-height: 360px;
  display: grid;
  place-content: center;
  justify-items: center;
  text-align: center;
  color: var(--color-text-muted);
}

.k-chat-empty svg {
  margin-bottom: var(--space-5);
  color: var(--color-text-muted);
}

.k-chat-empty h2 {
  margin: 0 0 8px;
  color: var(--color-text);
  font-size: 24px;
  line-height: 1.2;
}

.k-chat-empty p {
  max-width: 520px;
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.k-chat-main .chat-input-wrapper {
  margin: 0 var(--space-8) var(--space-8);
  flex-shrink: 0;
}

.k-chat-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.k-chat-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: var(--space-6);
}

.k-chat-card span {
  display: block;
  margin-bottom: 8px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.k-chat-card strong {
  display: block;
  margin-bottom: 8px;
  color: var(--color-text);
  font-size: var(--font-size-base);
}

.k-chat-card p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.45;
}

.k-chat-card.muted {
  opacity: 0.72;
}

.k-collections-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.k-collections-page.detail {
  overflow: hidden;
}

.k-collections-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 14px 18px;
}

.k-collections-top.compact {
  flex-shrink: 0;
}

.k-collections-top h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1.25;
}

.k-breadcrumb-btn {
  border: 0;
  background: transparent;
  color: var(--color-cta);
  padding: 0;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.k-detail-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.k-detail-title > div {
  min-width: 0;
}

.k-file-heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.k-back-action {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
}

.k-back-action:hover {
  color: var(--color-text);
  background: rgba(239, 124, 47, 0.08);
}

.k-inline-create {
  width: min(260px, 28vw);
}

.k-inline-create input {
  width: 100%;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0 10px;
  font-size: 12px;
  outline: none;
}

.k-page-error {
  border: 1px solid rgba(201,107,92,0.28);
  border-radius: 8px;
  background: rgba(201,107,92,0.08);
  color: var(--color-error);
  padding: 10px 12px;
  font-size: 12px;
}

.k-management-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.5fr);
  gap: 12px;
}

.k-collection-table {
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 7px;
}

.k-collection-row {
  min-width: 0;
  min-height: 52px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  padding: 9px 12px;
  text-align: left;
  cursor: pointer;
}

.k-collection-row:hover {
  background: var(--color-hover);
}

.k-collection-row.active {
  border-color: rgba(239, 124, 47, 0.48);
  background: rgba(239, 124, 47, 0.08);
}

.k-collection-row span {
  min-width: 0;
}

.k-collection-row strong,
.k-collection-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.k-collection-row strong {
  color: var(--color-text);
  font-size: 13px;
}

.k-collection-row small,
.k-collection-row em {
  color: var(--color-text-muted);
  font-size: 11px;
  font-style: normal;
}

.k-detail-card-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.k-summary-lines {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.k-summary-lines div {
  min-height: 42px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
  padding: 8px 10px;
}

.k-summary-lines span,
.k-summary-lines strong {
  display: block;
}

.k-summary-lines span {
  color: var(--color-text-muted);
  font-size: 11px;
}

.k-summary-lines strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 13px;
}

.k-collection-detail-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 0.95fr) minmax(460px, 1.05fr);
  gap: 12px;
  overflow: hidden;
}

.k-detail-side {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.k-preview-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.k-detail-files {
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.k-detail-file-row {
  min-height: 46px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.k-detail-file-row:hover {
  background: var(--color-hover);
}

.k-detail-file-row.active {
  border-color: rgba(239, 124, 47, 0.48);
  background: rgba(239, 124, 47, 0.08);
}

.k-detail-file-row span {
  min-width: 0;
}

.k-detail-file-row strong,
.k-detail-file-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.k-detail-file-row strong {
  color: var(--color-text);
  font-size: 12px;
}

.k-detail-file-row small {
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.k-upload-drop.large {
  margin: 0;
  min-height: 180px;
}

.k-side-body {
  padding: 12px;
}

.k-side-body p {
  margin: 10px 0 0;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.k-preview-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg);
}

.k-preview-body .pdf-viewer-panel,
.k-preview-body .docx-preview-panel,
.k-preview-body .xlsx-preview-panel,
.k-preview-body .pptx-preview-panel {
  height: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.k-preview-empty {
  height: 100%;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: center;
}

.k-preview-empty.error {
  color: var(--color-danger, #ef4444);
}

.k-markdown-preview,
.k-text-preview,
.k-csv-preview {
  height: 100%;
  overflow: auto;
  padding: 16px;
}

.k-text-preview {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.k-image-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
}
.k-image-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
}

.k-audio-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
}
.k-audio-preview audio { width: 100%; max-width: 420px; }

.k-csv-preview table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.k-csv-preview th,
.k-csv-preview td {
  max-width: 320px;
  border: 1px solid var(--color-border-subtle);
  padding: 7px 9px;
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.k-csv-preview th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface);
  color: var(--color-text);
}

.k-test-search {
  margin: 12px;
  min-height: 38px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  padding: 0 6px 0 10px;
  color: var(--color-text-muted);
}

.k-test-search input {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  outline: none;
  font-size: 12px;
}

.k-test-search button {
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: var(--color-cta);
  color: white;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 850;
}

.k-test-search button:disabled {
  opacity: 0.45;
}

.k-test-search-full {
  margin: 14px;
}

.k-status-stack.compact {
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
}

.k-wide-action {
  width: 100%;
}

.k-mini-file-list {
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.k-mini-file-list > span {
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 12px;
}

.k-mini-file-list div {
  min-height: 38px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.k-mini-file-list div:last-child {
  border-bottom: 0;
}

.k-mini-file-list strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.k-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
  padding: 16px;
}

.k-results,
.k-answer {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  overflow: hidden;
}

.k-pane-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.k-pane-header small {
  margin-left: auto;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 700;
}

.k-results-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.k-result {
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  padding: 10px 12px;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.k-result.highlighted {
  background: rgba(239, 124, 47, 0.1);
  border-color: rgba(239, 124, 47, 0.4);
}

.k-result-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.k-result-index {
  font-weight: 850;
  color: var(--color-text-secondary);
}

.k-result-corpus,
.k-result-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.k-result-score {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.k-result-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}

.k-answer-text {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.k-citation-chip {
  display: inline-flex;
  align-items: center;
  border: 0;
  border-radius: 5px;
  padding: 0 5px;
  margin: 0 1px;
  background: rgba(239, 124, 47, 0.16);
  color: var(--color-cta);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  vertical-align: baseline;
}

.k-citation-chip:disabled {
  opacity: 0.5;
  cursor: default;
}

.k-inline-error,
.k-inline-empty {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 16px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.k-inline-error {
  color: var(--color-danger, #ef4444);
}

.k-continue-link {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  border: 0;
  border-top: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.k-continue-link:hover {
  color: var(--color-text);
  background: var(--color-hover);
}

.spin {
  animation: k-spin 1s linear infinite;
}

@keyframes k-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 1120px) {
  .k-dashboard {
    grid-template-columns: 320px minmax(0, 1fr);
  }
  .k-dashboard.search-only,
  .k-dashboard.chat-only {
    grid-template-columns: minmax(0, 1fr);
  }
  .k-chat-page {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .k-chat-side {
    display: none;
  }
  .k-hero-panel,
  .k-hub-split {
    grid-template-columns: 1fr;
  }
  .k-hero-panel {
    align-items: flex-start;
    flex-direction: column;
  }
  .k-hub-grid,
  .k-collection-grid,
  .k-management-grid {
    grid-template-columns: 1fr;
  }
  .k-collections-top {
    align-items: flex-start;
    flex-direction: column;
  }
  .k-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .k-results,
  .k-answer {
    min-height: 320px;
  }
}
`
