import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Compass,
  Dashboard,
  DatabaseSearch,
  Book,
  Down,
  FileText,
  Left,
  LoadingOne,
  Message as MessageIcon,
  RelationalGraph,
  Search,
  Setting,
  Shield,
  Upload,
} from '@icon-park/react'
import { NexusLogo } from '@/components/NexusLogo'
import { useSettingsMenu } from '@/components/layout/useSettingsMenu'
import { api, ApiError } from '@/api/client'
import { streamingToContentBlocks, useSessionStore } from '@/stores/session'
import { useChat } from '@/hooks/useChat'
import { useProviders, fetchProviderModels } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { isRenderableMessage } from '@/components/chat/MessageItem'
import type { Corpus, CorpusFile, DoclingConfig, EmbedderConfig, FileItem, IngestionJob, ProviderModel } from '@/api/types'
import type { CorpusDetail, KnowledgeSearchResponse, KnowledgeView, TaggedSearchResult } from '../api/types'
import { CollectionsWorkspace } from '../components/CollectionsWorkspace'
import { KnowledgeChatWorkspace } from '../components/KnowledgeChatWorkspace'
import { OverviewWorkspace } from '../components/OverviewWorkspace'
import { PublicLibraryModal } from '../components/PublicLibraryModal'
import { SearchWorkspace } from '../components/SearchWorkspace'
import { SourcesWorkspace } from '../components/SourcesWorkspace'
import { buildAgentInstruction } from '../lib/agentInstruction'
import { splitCitations } from '../lib/citations'
import { isFileReady, isJobActive } from '../lib/status'
import { loadChatModelPreference, saveChatModelPreference } from '../hooks/chatPreference'
import { loadSearchDefaults } from '../hooks/searchDefaults'
import '../styles/knowledge.css'

const EMPTY_DETAIL: CorpusDetail = { files: [], jobs: [], loading: false, error: null }

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
  const [selectedCorpusId, setSelectedCorpusId] = useState<string>(() => loadSearchDefaults().corpusId)
  const [openedCorpusId, setOpenedCorpusId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CorpusDetail>(EMPTY_DETAIL)
  const [corporaError, setCorporaError] = useState<string | null>(null)
  const [creatingCorpus, setCreatingCorpus] = useState(false)
  const [createCorpusOpen, setCreateCorpusOpen] = useState(false)
  const [newCorpusName, setNewCorpusName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [fileDeleteError, setFileDeleteError] = useState<string | null>(null)
  const [processingFileId, setProcessingFileId] = useState<string | null>(null)
  const [publicLibraryOpen, setPublicLibraryOpen] = useState(false)
  const [view, setView] = useState<KnowledgeView>('overview')
  // Account-level Settings/Feedback/Admin, in this nav's own footer.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const { isAdmin, connected, go: goAccountMenu } = useSettingsMenu()
  // Default collection scope and result count are configured once from
  // Settings > Knowledge (see searchDefaults.ts) - read here only as this
  // session's starting point, not re-synced afterward, so picking a
  // different corpus mid-session (e.g. from Collections) doesn't silently
  // overwrite the user's configured default.
  const [topK] = useState(() => loadSearchDefaults().topK)

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
  const openedCorpus = openedCorpusId ? corpora.find((c) => c.id === openedCorpusId) ?? null : null
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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('.k-settings-menu-wrap')) return
      setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const selectedModels = useMemo(
    () => (selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []),
    [selectedProviderId, modelsByProvider],
  )
  const hasLoadedSelectedProviderModels = selectedProviderId
    ? Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)
    : false

  // Apply a stored preference once providers have loaded; otherwise fall
  // back to the organization default.
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
    if (openedCorpusId && !corpora.some((corpus) => corpus.id === openedCorpusId)) {
      setOpenedCorpusId(null)
    }
  }, [corpora, openedCorpusId])

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

  // Entry point for CollectionsWorkspace's "Test" forms - stays on the
  // Collections view and renders results inline there (rawResults/rawLoading/
  // rawError are already view-independent state), rather than jumping to the
  // Search page like the real search bar's handleSubmit does. This is meant
  // as a quick "does retrieval actually surface the right chunks" probe for
  // one collection, not a full chat/agent turn, so it only runs the raw
  // search - no session/agent instruction.
  function testSearch(q: string, corpusId: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setSelectedCorpusId(corpusId)
    setSubmittedQuery(trimmed)
    void runRawSearch(trimmed, corpusId)
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
      setCreateCorpusOpen(false)
    } catch (err) {
      setCorporaError(err instanceof ApiError ? err.message : 'Unable to create the knowledge base.')
    } finally {
      setCreatingCorpus(false)
    }
  }

  async function renameCorpus(corpusId: string, name: string) {
    const nextName = name.trim()
    if (!nextName) return
    setCorporaError(null)
    try {
      const corpus = await api.put<Corpus>(`/corpora/${corpusId}`, { name: nextName })
      setCorpora((current) => current.map((item) => (item.id === corpus.id ? corpus : item)))
    } catch (err) {
      setCorporaError(err instanceof ApiError ? err.message : 'Unable to rename the collection.')
      throw err
    }
  }

  async function deleteCorpus(corpusId: string) {
    setCorporaError(null)
    try {
      await api.delete<void>(`/corpora/${corpusId}`)
      setCorpora((current) => current.filter((item) => item.id !== corpusId))
      if (selectedCorpusId === corpusId) {
        setSelectedCorpusId('all')
        setDetail(EMPTY_DETAIL)
      }
      if (openedCorpusId === corpusId) setOpenedCorpusId(null)
    } catch (err) {
      setCorporaError(err instanceof ApiError ? err.message : 'Unable to delete the collection.')
      throw err
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

  // Reprocesses one file - same /ingest call processFiles loops over, just
  // for a single row's icon button instead of the corpus-wide bulk actions.
  async function processFile(corpusId: string, fileId: string) {
    setProcessingFileId(fileId)
    setProcessError(null)
    try {
      await api.post(`/corpora/${corpusId}/ingest`, { file_id: fileId })
      await loadCorpusDetail(corpusId)
    } catch (err) {
      setProcessError(err instanceof ApiError ? err.message : 'Unable to queue this file for processing.')
    } finally {
      setProcessingFileId(null)
    }
  }

  // Removes one file from a corpus - the only way to get rid of a file
  // stuck permanently `failed` (ingestion exhausted its retries), since
  // Reprocess only re-queues, it never removes. Detach also deletes the
  // file's indexed chunks server-side (see knowledge.Service.DetachFile),
  // so this isn't just a listing change.
  async function deleteFile(corpusId: string, fileId: string) {
    setDeletingFileId(fileId)
    setFileDeleteError(null)
    try {
      await api.delete<void>(`/corpora/${corpusId}/files/${fileId}`)
      await loadCorpusDetail(corpusId)
      await loadCorpora()
    } catch (err) {
      setFileDeleteError(err instanceof ApiError ? err.message : 'Unable to remove this file.')
      throw err
    } finally {
      setDeletingFileId(null)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setView('search')
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

  const navGroups: Array<{ label: string; items: Array<{ id: KnowledgeView; label: string; icon: ReactNode }> }> = [
    {
      label: 'Discover',
      items: [
        { id: 'overview', label: 'Overview', icon: <Dashboard size={14} /> },
        { id: 'discover', label: 'Discover', icon: <Compass size={14} /> },
        { id: 'graph', label: 'Knowledge Graph', icon: <RelationalGraph size={14} /> },
      ],
    },
    {
      label: 'Ask',
      items: [
        { id: 'search', label: 'Search', icon: <Search size={14} /> },
        { id: 'chat', label: 'Chat Knowledge', icon: <MessageIcon size={14} /> },
      ],
    },
    {
      label: 'Act',
      items: [
        { id: 'actions', label: 'Actions', icon: <Shield size={14} /> },
        { id: 'sources', label: 'Sources', icon: <DatabaseSearch size={14} /> },
        { id: 'collections', label: 'Collections', icon: <Book size={14} /> },
      ],
    },
  ]

  return (
    <div className="k-root">
      <input
        ref={fileRef}
        type="file"
        className="k-hidden-file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void uploadFile(file)
        }}
      />
      <aside className="k-product-nav">
        <div className="k-product-brand">
          <span className="k-product-logo">
            <Book size={20} />
          </span>
          <div>
            <strong>Knowledge</strong>
          </div>
        </div>
        <nav className="k-product-menu" aria-label="Knowledge navigation">
          {navGroups.map((group) => (
            <section key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <button key={item.id} type="button" className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="k-product-footer">
          <div className="k-settings-menu-wrap">
            <button
              type="button"
              className={accountMenuOpen ? 'active' : ''}
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <NexusLogo size={14} />
              <span>SeshatOS</span>
              <Down size={11} />
            </button>
            {accountMenuOpen && (
              <div className="k-settings-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); goAccountMenu('settings') }}>
                  <Setting size={14} />
                  <span>Settings</span>
                </button>
                <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); goAccountMenu('feedback') }}>
                  <MessageIcon size={14} />
                  <span>Feedback</span>
                </button>
                {connected && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!isAdmin}
                    onClick={() => { setAccountMenuOpen(false); goAccountMenu('admin') }}
                  >
                    <Shield size={14} />
                    <span>Admin</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="k-content">
        {view !== 'overview' && (
          <section className="k-toolbar">
            {view === 'collections' ? (
              <div className="k-toolbar-page-title">
                {openedCorpus ? (
                  <>
                    <button type="button" className="k-toolbar-back" onClick={() => setOpenedCorpusId(null)} aria-label="Back to collections">
                      <Left size={15} />
                    </button>
                    <Book size={16} />
                    <span>{openedCorpus.name}</span>
                  </>
                ) : (
                  <>
                    <Book size={16} />
                    <span>Collections</span>
                  </>
                )}
              </div>
            ) : (
              <form className="k-global-search" onSubmit={handleSubmit}>
                <Search size={15} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search knowledge entities, facts, sources..."
                />
                <button type="submit" disabled={!query.trim() || rawLoading || isStreaming}>Search</button>
              </form>
            )}
            <div className="k-toolbar-actions">
              {view === 'collections' ? (
                openedCorpus ? (
                  <>
                    <button
                      type="button"
                      className="k-settings-btn"
                      onClick={() => {
                        setSelectedCorpusId(openedCorpus.id)
                        fileRef.current?.click()
                      }}
                      disabled={uploading}
                    >
                      <Upload size={13} /> {uploading ? 'Importing...' : 'Import'}
                    </button>
                    <button
                      type="button"
                      className="k-settings-btn"
                      onClick={() => { void processFiles(openedCorpus.id, 'missing') }}
                      disabled={processing}
                    >
                      <LoadingOne size={13} className={processing ? 'spin' : undefined} /> Missing
                    </button>
                    <button
                      type="button"
                      className="k-settings-btn primary"
                      onClick={() => { void processFiles(openedCorpus.id, 'all') }}
                      disabled={processing}
                    >
                      <LoadingOne size={13} className={processing ? 'spin' : undefined} /> Reprocess
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="k-settings-btn" onClick={() => setPublicLibraryOpen(true)}>
                      <Search size={13} /> Public library
                    </button>
                    <button
                      type="button"
                      className="k-settings-btn primary"
                      onClick={() => {
                        setNewCorpusName('')
                        setCreateCorpusOpen(true)
                      }}
                      disabled={creatingCorpus}
                    >
                      <FileText size={13} /> New collection
                    </button>
                  </>
                )
              ) : (
                <button type="button" className="k-settings-btn" onClick={() => setPublicLibraryOpen(true)}>
                  <Book size={13} /> Public
                </button>
              )}
            </div>
          </section>
        )}

        <section className={`k-dashboard ${view === 'search' ? 'search-only' : ''} ${view === 'chat' ? 'chat-only' : ''}`}>
          <section className="k-workspace">
            {view === 'overview' ? (
              <OverviewWorkspace
                corpora={corpora}
                selectedCorpus={selectedCorpus}
                selectedCorpusId={selectedCorpusId}
                selectedJobs={detail.jobs}
                totalChunks={totalChunks}
                embedder={embedder}
                docling={docling}
                corporaError={corporaError}
                onNavigate={setView}
                onRefresh={() => {
                  void loadCorpora()
                  void loadCorpusDetail(selectedCorpusId)
                }}
              />
            ) : view === 'collections' ? (
              <CollectionsWorkspace
                corpora={corpora}
                selectedCorpus={selectedCorpus}
                openedCorpusId={openedCorpusId}
                selectedScope={selectedScope}
                detail={detail}
                readyFiles={readyFiles}
                activeJobs={activeJobs}
                totalChunks={totalChunks}
                uploading={uploading}
                uploadError={uploadError}
                processing={processing}
                processError={processError}
                corporaError={corporaError}
                deletingFileId={deletingFileId}
                fileDeleteError={fileDeleteError}
                processingFileId={processingFileId}
                onUpload={() => fileRef.current?.click()}
                onSelectCorpus={setSelectedCorpusId}
                onOpenCorpus={(corpusId) => {
                  setSelectedCorpusId(corpusId)
                  setOpenedCorpusId(corpusId)
                }}
                onTestSearch={testSearch}
                onRenameCorpus={renameCorpus}
                onDeleteCorpus={deleteCorpus}
                onProcessAll={(corpusId) => void processFiles(corpusId, 'all')}
                onProcessFile={(corpusId, fileId) => void processFile(corpusId, fileId)}
                onRetryDetail={(corpusId) => void loadCorpusDetail(corpusId)}
                onDeleteFile={deleteFile}
                submittedQuery={submittedQuery}
                rawResults={rawResults}
                rawLoading={rawLoading}
                rawError={rawError}
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
            ) : view === 'search' ? (
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
            ) : view === 'sources' ? (
              <SourcesWorkspace corpora={corpora} selectedCorpusId={selectedCorpusId} onSelectCorpus={setSelectedCorpusId} />
            ) : (
              <section className="k-planned-view">
                <div>
                  {view === 'graph' ? <RelationalGraph size={24} /> : view === 'discover' ? <Compass size={24} /> : <FileText size={24} />}
                  <span>{view}</span>
                </div>
                <h1>{view === 'graph' ? 'Knowledge Graph' : view === 'discover' ? 'Discover' : 'Actions'}</h1>
                <p>This section is now part of the Knowledge platform shell and will be transformed in the next pass.</p>
              </section>
            )}
          </section>
        </section>
      </main>
      {publicLibraryOpen && (
        <PublicLibraryModal onClose={() => setPublicLibraryOpen(false)} />
      )}
      {createCorpusOpen && (
        <div
          className="k-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!creatingCorpus) setCreateCorpusOpen(false)
          }}
        >
          <form
            className="k-create-collection-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create collection"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              void createCorpus()
            }}
          >
            <div className="k-create-collection-head">
              <span className="k-create-collection-icon">
                <FileText size={18} />
              </span>
              <div>
                <h2>New collection</h2>
                <p>Create a corpus to group documents, permissions, and retrieval scope.</p>
              </div>
            </div>
            <label className="k-create-collection-field">
              <span>Collection name</span>
              <input
                autoFocus
                value={newCorpusName}
                onChange={(e) => setNewCorpusName(e.target.value)}
                placeholder="e.g. Legal policies, Product docs..."
              />
            </label>
            {corporaError && <div className="k-page-error compact">{corporaError}</div>}
            <div className="k-create-collection-actions">
              <button type="button" className="k-settings-btn" onClick={() => setCreateCorpusOpen(false)} disabled={creatingCorpus}>
                Cancel
              </button>
              <button type="submit" className="k-settings-btn primary" disabled={!newCorpusName.trim() || creatingCorpus}>
                {creatingCorpus ? 'Creating...' : 'Create collection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
