import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { CheckCorrect, FileTextOne, Browser, LightMember } from '@icon-park/react'
import { ChatTopBar } from '@renderer/components/chat/ChatTopBar'
import { ChatInput, type ChatAttachment } from '@renderer/components/chat/ChatInput'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { api, ApiError } from '@renderer/api/client'
import type { ProviderModel, ProviderSetting } from '@renderer/api/types'
import { useProviders, fetchProviderModels } from '@renderer/hooks/useProviders'
import { useProvidersStore } from '@renderer/stores/providers'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { renderPDFPagePreviews } from '@renderer/lib/pdfPreview'
import { extractOfficeThumbnail } from '@renderer/lib/officeThumbnail'

function attachmentCategory(file: File): ChatAttachment['category'] {
  if (file.type.startsWith('image/')) return 'images'
  if (
    file.type.includes('pdf') ||
    file.type.includes('document') ||
    file.type.includes('text') ||
    /\.(pdf|doc|docx|txt|md|csv|xls|xlsx|ppt|pptx)$/i.test(file.name)
  ) {
    return 'documents'
  }
  return 'other'
}

function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

// DOCX/XLSX may carry a real embedded thumbnail (docProps/thumbnail.*, see
// lib/officeThumbnail.ts) - extracted straight from the raw File object
// client-side, same as PDF page previews below, so the attach card doesn't
// have to wait on the upload/server round trip to show something better
// than the tiny raw-text fallback. PPTX is deliberately excluded: a real
// slide deck's embedded media makes JSZip's synchronous decompression slow
// enough to freeze the UI for the better part of a minute, for a thumbnail
// that's usually missing anyway on agent-generated files - the icon
// fallback in ChatInput/MessageItem is instant and always available.
function isOfficeZipFile(file: File): boolean {
  return /\.(docx|xlsx)$/i.test(file.name)
}

type ModelChoice = {
  id: string
  providerId: string
  providerName: string
  providerKind: string
  model: ProviderModel
}

function modelChoiceId(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`
}

function splitModelChoiceId(id: string): { providerId: string; modelId: string } | null {
  const separator = id.indexOf('::')
  if (separator <= 0 || separator === id.length - 2) return null
  return {
    providerId: id.slice(0, separator),
    modelId: id.slice(separator + 2),
  }
}

function providerInitials(name: string, kind: string): string {
  const source = name.trim() || kind.trim() || 'AI'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function providerDisplayName(name: string, kind: string): string {
  const displayName = name.trim()
  const providerKind = kind.trim()
  if (!displayName) return providerKind
  if (!providerKind) return displayName
  if (displayName.toLowerCase() === providerKind.toLowerCase()) return displayName
  return displayName
}

function isChatProviderUsable(provider: ProviderSetting): boolean {
  if (provider.provider === 'ollama') return true
  if (provider.auth_kind === 'oauth') return provider.connection_status === 'connected'
  return provider.has_api_key || provider.connection_status === 'ready'
}

function sentAttachment(file: ChatAttachment) {
  return {
    id: file.id,
    filename: file.filename,
    content_type: file.content_type,
    size: file.size,
    category: file.category,
    local_path: file.local_path,
    preview_url: file.preview_url,
    page_preview_urls: file.page_preview_urls,
  }
}

export function Home() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const addSession = useSessionStore((s) => s.addSession)
  const permissionMode = useUIStore((s) => s.permissionMode)
  const togglePermissionMode = useUIStore((s) => s.togglePermissionMode)
  const setPermissionMode = useUIStore((s) => s.setPermissionMode)
  const [inputValue, setInputValue] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelProviderIds, setLoadingModelProviderIds] = useState<string[]>([])
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [projectPath, setProjectPath] = useState('')
  // A session has to exist for /sessions/:id/files to accept an upload, but
  // Home never sends a message until the user hits Send. So attaching a file
  // lazily creates the session early (reused by handleSend when it fires) -
  // see ensureSessionCreated.
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const chatProviders = useMemo(() => providers.filter(isChatProviderUsable), [providers])
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null
  const selectedModels = selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []
  const selectedModel = selectedModels.find((model) => model.model_id === selectedModelId) ?? null
  const hasConfiguredProviders = chatProviders.length > 0

  const allModelChoices = useMemo<ModelChoice[]>(() => {
    return chatProviders.flatMap((provider) => (modelsByProvider[provider.id] ?? []).map((model) => ({
      id: modelChoiceId(provider.id, model.model_id),
      providerId: provider.id,
      providerName: provider.name,
      providerKind: provider.provider,
      model,
    })))
  }, [chatProviders, modelsByProvider])

  const selectedModelChoiceId = selectedProviderId && selectedModelId
    ? modelChoiceId(selectedProviderId, selectedModelId)
    : null

  const selectedModelChoice = selectedModelChoiceId
    ? allModelChoices.find((choice) => choice.id === selectedModelChoiceId) ?? null
    : null
  const selectedProviderForSend = selectedModelChoice
    ? providers.find((provider) => provider.id === selectedModelChoice.providerId) ?? selectedProvider
    : selectedProvider
  const selectedModelForSend = selectedModelChoice?.model ?? selectedModel

  useEffect(() => {
    const project = searchParams.get('project')
    if (project) setProjectPath(project)
  }, [searchParams])

  // Auto-select default (or first) provider when none is selected and providers are loaded
  useEffect(() => {
    if (selectedProviderId || providersLoading || chatProviders.length === 0) return
    const def = chatProviders.find((p) => p.is_default) ?? chatProviders[0]
    setSelectedProviderId(def.id)
  }, [chatProviders, providersLoading, selectedProviderId])

  useEffect(() => {
    if (!selectedProviderId) return
    if (!chatProviders.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(null)
      setSelectedModelId(null)
    }
  }, [chatProviders, selectedProviderId])

  useEffect(() => {
    const missing = chatProviders.filter((provider) => modelsByProvider[provider.id] === undefined)
    if (missing.length === 0) return
    let cancelled = false
    const missingIds = missing.map((provider) => provider.id)
    setLoadingModelProviderIds((current) => Array.from(new Set([...current, ...missingIds])))

    for (const provider of missing) {
      fetchProviderModels(provider.id)
        .then((models) => {
          if (cancelled) return
          setModelsByProvider((current) => ({ ...current, [provider.id]: models }))
        })
        .catch(() => {
          if (cancelled) return
          setModelsByProvider((current) => ({ ...current, [provider.id]: [] }))
        })
        .finally(() => {
          if (cancelled) return
          setLoadingModelProviderIds((current) => current.filter((id) => id !== provider.id))
        })
    }

    return () => {
      cancelled = true
    }
  }, [chatProviders, modelsByProvider])

  // Auto-select the default (or first) model across every usable provider,
  // matching the in-conversation composer.
  useEffect(() => {
    if (allModelChoices.length === 0) return
    if (selectedModelChoice) return
    const def = allModelChoices.find((choice) => choice.model.is_default) ?? allModelChoices[0]
    setSelectedProviderId(def.providerId)
    setSelectedModelId(def.model.model_id)
  }, [allModelChoices, selectedModelChoice])

  useEffect(() => {
    if (!selectedModelId || allModelChoices.length === 0) return
    if (!selectedModelChoice) {
      setSelectedModelId(null)
    }
  }, [allModelChoices.length, selectedModelChoice, selectedModelId])

  function handleModelSelect(choiceId: string) {
    const choice = splitModelChoiceId(choiceId)
    if (!choice) return
    setSelectedProviderId(choice.providerId)
    setSelectedModelId(choice.modelId)
    setErrorMessage(null)
  }

  // Creates the backend session on first use and reuses it afterward, so
  // attaching a file and then sending don't create two sessions.
  async function ensureSessionCreated(): Promise<string | null> {
    if (pendingSessionId) return pendingSessionId

    if (!hasConfiguredProviders) {
      setErrorMessage('Configure a provider in Settings before starting a chat.')
      return null
    }
    if (!selectedProviderForSend) {
      setErrorMessage('Select a provider for this conversation.')
      return null
    }
    if (!selectedModelForSend) {
      setErrorMessage('Select a model for this conversation.')
      return null
    }

    setErrorMessage(null)
    const response = await api.post<{ session_id: string }>('/sessions', {
      provider_setting_id: selectedProviderForSend.id,
      model_id: selectedModelForSend.model_id,
      permission_mode: permissionMode,
    })
    setPendingSessionId(response.session_id)
    return response.session_id
  }

  const handleAttachFiles = async (files: FileList) => {
    if (!files.length) return
    const selectedFiles = Array.from(files)
    const pending = selectedFiles.map((file, index): ChatAttachment => ({
      id: `local-${Date.now()}-${index}-${file.name}`,
      filename: file.name,
      content_type: file.type,
      size: file.size,
      category: attachmentCategory(file),
      preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      upload_status: 'uploading',
    }))
    setAttachments((current) => [...current, ...pending])
    for (const [index, file] of selectedFiles.entries()) {
      const pendingId = pending[index]?.id
      if (isPDFFile(file)) {
        void renderPDFPagePreviews(file, 10)
          .then((previews) => {
            const urls = previews.map((preview) => preview.dataURL)
            setAttachments((current) => current.map((attachment) => (
              attachment.id === pendingId
                ? { ...attachment, preview_url: urls[0], page_preview_urls: urls }
                : attachment
            )))
          })
          .catch(() => {})
      } else if (isOfficeZipFile(file)) {
        void file.arrayBuffer()
          .then(extractOfficeThumbnail)
          .then((url) => {
            if (!url) return
            setAttachments((current) => current.map((attachment) => (
              attachment.id === pendingId ? { ...attachment, preview_url: url } : attachment
            )))
          })
          .catch(() => {})
      }
    }
    setIsUploadingAttachments(true)
    setAttachmentError(null)
    try {
      const id = await ensureSessionCreated()
      if (!id) {
        setAttachmentError('Select a provider and model before attaching files.')
        setAttachments((current) => current.map((file) => (
          pending.some((item) => item.id === file.id)
            ? { ...file, upload_status: 'failed', error: 'Select a provider and model first.' }
            : file
        )))
        return
      }
      for (const [index, file] of selectedFiles.entries()) {
        const pendingId = pending[index]?.id
        let pagePreviews: string[] = []
        let officeThumbnail: string | null = null
        if (isPDFFile(file)) {
          pagePreviews = (await renderPDFPagePreviews(file, 10).catch(() => [])).map((preview) => preview.dataURL)
        } else if (isOfficeZipFile(file)) {
          officeThumbnail = await file.arrayBuffer().then(extractOfficeThumbnail).catch(() => null)
        }
        const form = new FormData()
        form.append('file', file)
        const item = await api.upload<{
          id: string
          filename: string
          content_type?: string
          size?: number
          category?: 'images' | 'documents' | 'other'
          local_path?: string
        }>(`/sessions/${id}/files`, form)
        setAttachments((current) => current.map((attachment) => (
          attachment.id === pendingId
            ? {
                ...attachment,
                id: item.id,
                filename: item.filename,
                content_type: item.content_type,
                size: item.size,
                category: item.category,
                local_path: item.local_path,
                page_preview_urls: pagePreviews.length > 0 ? pagePreviews : attachment.page_preview_urls,
                preview_url: pagePreviews[0] ?? officeThumbnail ?? attachment.preview_url,
                upload_status: 'uploaded',
              }
            : attachment
        )))
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to attach files.'
      setAttachmentError(`Attachment upload failed: ${message}`)
      setAttachments((current) => current.map((file) => (
        pending.some((item) => item.id === file.id)
          ? { ...file, upload_status: 'failed', error: message }
          : file
      )))
    } finally {
      setIsUploadingAttachments(false)
    }
  }

  function handleRemoveAttachment(fileId: string) {
    setAttachments((current) => current.filter((file) => file.id !== fileId))
    setAttachmentError(null)
    // See Conversation.tsx's handleRemoveAttachment - attachments upload
    // immediately, before any message is sent, so removing one here without
    // deleting it server-side would orphan it forever.
    if (!fileId.startsWith('local-')) {
      void api.delete(`/files/${fileId}`).catch(() => {})
    }
  }

  async function handleSend(promptOverride?: string) {
    if (attachments.some((file) => file.upload_status === 'uploading')) {
      setAttachmentError('Wait for attachments to finish uploading before sending.')
      return
    }
    const prompt = (promptOverride ?? inputValue).trim() || (attachments.length > 0 ? 'Please analyze the attached file(s).' : '')
    if (!prompt) return

    setIsCreatingSession(true)
    try {
      const wasAlreadyCreated = !!pendingSessionId
      const sessionId = await ensureSessionCreated()
      if (!sessionId || !selectedProviderForSend || !selectedModelForSend) return

      // If the session was created earlier (e.g. by attaching a file before
      // typing anything), the provider/model the user ends up sending with
      // may have changed since - sync it now rather than silently keeping
      // whatever was selected at attach time.
      if (wasAlreadyCreated) {
        await api.patch(`/sessions/${sessionId}`, {
          provider_setting_id: selectedProviderForSend.id,
          model_id: selectedModelForSend.model_id,
        }).catch(() => {})
      }

      // Persist the chosen working folder before the conversation mounts and
      // fires its first turn. Creation itself doesn't take project_path, so
      // this has to land before navigate() or the first message could run
      // against the default per-session workspace instead.
      if (projectPath) {
        await api.patch(`/sessions/${sessionId}`, { project_path: projectPath }).catch(() => {})
      }

      const fileIds = attachments
        .filter((file) => file.upload_status !== 'failed' && !file.id.startsWith('local-'))
        .map((file) => file.id)
      const sentAttachments = attachments
        .filter((file) => file.upload_status !== 'failed' && !file.id.startsWith('local-'))
        .map(sentAttachment)
      addSession({
        id: sessionId,
        title: UNTITLED_SESSION_TITLE,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        providerSettingId: selectedProviderForSend.id,
        providerLabel: selectedProviderForSend.name,
        modelId: selectedModelForSend.model_id,
        modelLabel: selectedModelForSend.display_name || selectedModelForSend.model_id,
        draftPrompt: prompt,
        draftFileIds: fileIds.length > 0 ? fileIds : undefined,
        draftAttachments: sentAttachments.length > 0 ? sentAttachments : undefined,
        projectPath: projectPath || undefined,
      })
      setInputValue('')
      setProjectPath('')
      setAttachments([])
      setAttachmentError(null)
      setPendingSessionId(null)
      navigate(`/conversation/${sessionId}`)
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'Unable to create the conversation.'
      )
    } finally {
      setIsCreatingSession(false)
    }
  }

  return (
    <div className="home-root">
      <style>{HOME_CSS}</style>

      {/* Top Bar */}
      <div className="home-top-bar">
        <ChatTopBar
          permissionMode={permissionMode}
          onTogglePermission={togglePermissionMode}
          onPermissionModeSelect={setPermissionMode}
        />
      </div>

      {/* Main Content */}
      <div className="home-center">
        <h1 className="home-greeting">Hi, what's your plan for today?</h1>

        <div className="home-input-container">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            placeholder="Send a message, upload files, open a folder, or create a scheduled task..."
            maxHeight={200}
            projectPath={projectPath}
            onProjectChange={setProjectPath}
            attachments={attachments}
            onAttachFiles={handleAttachFiles}
            onRemoveAttachment={handleRemoveAttachment}
            isUploadingAttachments={isUploadingAttachments}
            attachmentError={attachmentError}
            modelLabel={
              selectedModelChoice?.model.display_name ||
              selectedModelChoice?.model.model_id ||
              selectedModel?.display_name ||
              selectedModel?.model_id ||
              'Model'
            }
            modelIcon={
              selectedModelChoice
                ? <ProviderIcon provider={selectedModelChoice.providerKind} size={13} />
                : undefined
            }
            modelOptions={
              allModelChoices.length > 0
                ? allModelChoices.map((choice) => ({
                    id: choice.id,
                    label: choice.model.display_name || choice.model.model_id,
                    description: providerDisplayName(choice.providerName, choice.providerKind),
                    icon: <ProviderIcon provider={choice.providerKind} size={17} />,
                    prefix: providerInitials(choice.providerName, choice.providerKind),
                  }))
                : undefined
            }
            selectedModelId={selectedModelChoiceId}
            onModelSelect={handleModelSelect}
            modelDisabled={
              isCreatingSession ||
              (loadingModelProviderIds.length > 0 && allModelChoices.length === 0)
            }
          />
          {errorMessage && <div className="home-input-status error">{errorMessage}</div>}
          {!errorMessage && loadingModelProviderIds.length > 0 && allModelChoices.length === 0 && (
            <div className="home-input-status">Loading models...</div>
          )}
          {!errorMessage &&
            !providersLoading &&
            hasConfiguredProviders &&
            loadingModelProviderIds.length === 0 &&
            allModelChoices.length === 0 && (
              <div className="home-input-status">
                No model is available yet.
              </div>
            )}
          {!errorMessage && isCreatingSession && (
            <div className="home-input-status">Creating conversation...</div>
          )}
        </div>

        <div className="home-quick-actions">
          <QuickAction icon={<CheckCorrect size={14} />} label="Create a task" onClick={() => setInputValue('Create a task to ')} />
          <QuickAction icon={<FileTextOne size={14} />} label="Summarize a file" onClick={() => setInputValue('Summarize the file at ')} />
          <QuickAction icon={<Browser size={14} />} label="Search the web" onClick={() => setInputValue('Search the web for ')} />
          <QuickAction icon={<LightMember size={14} />} label="Brainstorm ideas" onClick={() => setInputValue('Help me brainstorm ideas for ')} />
        </div>
      </div>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="qa-btn" type="button" onClick={onClick}>
      <span className="qa-icon">{icon}</span>
      <span className="qa-label">{label}</span>
    </button>
  )
}

const HOME_CSS = `
.home-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg);
  overflow-y: auto;
}

.home-top-bar {
  padding: var(--space-6) 18px;
}

.home-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 18px 60px;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

.home-greeting {
  font-family: serif;
  font-size: var(--font-size-2xl);
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: var(--space-7);
  letter-spacing: -0.01em;
}

.home-input-container {
  width: 100%;
  max-width: 760px;
  margin-bottom: var(--space-8);
}

.home-input-status {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-4);
}

.home-input-status.error {
  color: var(--color-error);
}

.home-quick-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-4);
}

.qa-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 7px var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  cursor: pointer;
  transition: all 0.15s;
}

.qa-btn:hover {
  background: var(--color-bg);
  border-color: var(--color-border);
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  transform: translateY(-1px);
}

.qa-icon {
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
}

.qa-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text);
}
`
