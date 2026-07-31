import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { CheckCorrect, FileTextOne, Browser, LightMember } from '@icon-park/react'
import { ChatTopBar, CHAT_TOP_BAR_CSS } from '@/components/chat/ChatTopBar'
import { ChatInput, CHAT_INPUT_CSS, type ChatAttachment } from '@/components/chat/ChatInput'
import { api, ApiError } from '@/api/client'
import type { ProviderModel } from '@/api/types'
import { useProviders, fetchProviderModels } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { useSessionStore } from '@/stores/session'
import { useUIStore } from '@/stores/ui'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import { renderPDFPagePreviews } from '@/lib/pdfPreview'

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
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)
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

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null
  // Use useMemo so the empty-array fallback is a stable reference across renders.
  // An inline [] would be a new reference every render, causing effects that depend
  // on selectedModels to re-run on every render when models aren't loaded yet.
  const selectedModels = useMemo(
    () => (selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []),
    [selectedProviderId, modelsByProvider],
  )
  const selectedModel = selectedModels.find((model) => model.model_id === selectedModelId) ?? null
  const hasConfiguredProviders = providers.length > 0
  const hasLoadedSelectedProviderModels = selectedProviderId
    ? Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)
    : false

  // Auto-select default (or first) provider when none is selected and providers are loaded
  useEffect(() => {
    if (selectedProviderId || providersLoading || providers.length === 0) return
    const def = providers.find((p) => p.is_default) ?? providers[0]
    setSelectedProviderId(def.id)
  }, [providers, providersLoading, selectedProviderId])

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
        if (!cancelled) {
          setLoadingModelsFor((current) => (current === selectedProviderId ? null : current))
        }
      })

    return () => {
      cancelled = true
    }
  }, [modelsByProvider, selectedProviderId])

  // Auto-select default (or first) model when models load and none is selected
  useEffect(() => {
    if (!hasLoadedSelectedProviderModels || selectedModelId || selectedModels.length === 0) return
    const def = selectedModels.find((m) => m.is_default) ?? selectedModels[0]
    setSelectedModelId(def.model_id)
  }, [hasLoadedSelectedProviderModels, selectedModelId, selectedModels])

  useEffect(() => {
    if (!selectedModelId || !hasLoadedSelectedProviderModels) return
    if (!selectedModels.some((model) => model.model_id === selectedModelId)) {
      setSelectedModelId(null)
    }
  }, [hasLoadedSelectedProviderModels, selectedModelId, selectedModels])

  // Creates the backend session on first use and reuses it afterward, so
  // attaching a file and then sending don't create two sessions.
  async function ensureSessionCreated(): Promise<string | null> {
    if (pendingSessionId) return pendingSessionId

    if (!hasConfiguredProviders) {
      setErrorMessage('Configure a provider in Settings before starting a chat.')
      return null
    }
    if (!selectedProvider) {
      setErrorMessage('Select a provider for this conversation.')
      return null
    }
    if (!selectedModel) {
      setErrorMessage('Select a model for this conversation.')
      return null
    }

    setErrorMessage(null)
    const response = await api.post<{ session_id: string }>('/sessions', {
      provider_setting_id: selectedProvider.id,
      model_id: selectedModel.model_id,
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
      if (!isPDFFile(file)) continue
      const pendingId = pending[index]?.id
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
        if (isPDFFile(file)) {
          pagePreviews = (await renderPDFPagePreviews(file, 10).catch(() => [])).map((preview) => preview.dataURL)
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
                preview_url: pagePreviews[0] ?? attachment.preview_url,
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

  async function handleSend() {
    if (attachments.some((file) => file.upload_status === 'uploading')) {
      setAttachmentError('Wait for attachments to finish uploading before sending.')
      return
    }
    const prompt = inputValue.trim() || (attachments.length > 0 ? 'Please analyze the attached file(s).' : '')
    if (!prompt) return

    setIsCreatingSession(true)
    try {
      const wasAlreadyCreated = !!pendingSessionId
      const sessionId = await ensureSessionCreated()
      if (!sessionId || !selectedProvider || !selectedModel) return

      // If the session was created earlier (e.g. by attaching a file before
      // typing anything), the provider/model the user ends up sending with
      // may have changed since - sync it now rather than silently keeping
      // whatever was selected at attach time.
      if (wasAlreadyCreated) {
        await api.patch(`/sessions/${sessionId}`, {
          provider_setting_id: selectedProvider.id,
          model_id: selectedModel.model_id,
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
        providerSettingId: selectedProvider.id,
        providerLabel: selectedProvider.name,
        modelId: selectedModel.model_id,
        modelLabel: selectedModel.display_name || selectedModel.model_id,
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
            providerLabel={selectedProvider?.name ?? 'Provider'}
            modelLabel={selectedModel?.display_name || selectedModel?.model_id || 'Model'}
            providerOptions={providers.map((provider) => ({
              id: provider.id,
              label: provider.name,
            }))}
            modelOptions={
              selectedProviderId && hasLoadedSelectedProviderModels
                ? selectedModels.map((model) => ({
                    id: model.model_id,
                    label: model.display_name || model.model_id,
                  }))
                : undefined
            }
            selectedProviderId={selectedProviderId}
            selectedModelId={selectedModelId}
            onProviderSelect={(providerId: string) => {
              setSelectedProviderId(providerId)
              setSelectedModelId(null)
              setErrorMessage(null)
            }}
            onModelSelect={(modelId: string) => {
              setSelectedModelId(modelId)
              setErrorMessage(null)
            }}
            providerDisabled={!hasConfiguredProviders || providersLoading || isCreatingSession}
            modelDisabled={
              !selectedProviderId ||
              isCreatingSession ||
              loadingModelsFor === selectedProviderId ||
              selectedModels.length === 0
            }
          />
          <div className="home-input-hint">
            Press Enter to send, Shift + Enter for new line
          </div>
          {errorMessage && <div className="home-input-status error">{errorMessage}</div>}
          {!errorMessage && selectedProviderId && loadingModelsFor === selectedProviderId && (
            <div className="home-input-status">Loading models for the selected provider...</div>
          )}
          {!errorMessage &&
            selectedProviderId &&
            hasLoadedSelectedProviderModels &&
            selectedModels.length === 0 && (
              <div className="home-input-status">
                No model is available for this provider yet.
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
${CHAT_TOP_BAR_CSS}
${CHAT_INPUT_CSS}

.home-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg);
  overflow-y: auto;
}

.home-top-bar {
  padding: 12px 18px;
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
  font-size: 22px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 16px;
  letter-spacing: -0.01em;
}

.home-input-container {
  width: 100%;
  max-width: 760px;
  margin-bottom: 20px;
}

.home-input-hint {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-top: 8px;
}

.home-input-status {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-top: 8px;
}

.home-input-status.error {
  color: #e59c7b;
}

.home-quick-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.qa-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
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
