import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCorrect, FileTextOne, Browser, LightMember } from '@icon-park/react'
import { ChatTopBar, CHAT_TOP_BAR_CSS } from '@/components/chat/ChatTopBar'
import { ChatInput, CHAT_INPUT_CSS } from '@/components/chat/ChatInput'
import { api, ApiError } from '@/api/client'
import type { ProviderModel } from '@/api/types'
import { useProviders, fetchProviderModels } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { useSessionStore } from '@/stores/session'
import { useUIStore } from '@/stores/ui'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'

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

  async function handleSend() {
    const prompt = inputValue.trim()
    if (!prompt) return

    if (!hasConfiguredProviders) {
      setErrorMessage('Configure a provider in Settings before starting a chat.')
      return
    }
    if (!selectedProvider) {
      setErrorMessage('Select a provider for this conversation.')
      return
    }
    if (!selectedModel) {
      setErrorMessage('Select a model for this conversation.')
      return
    }

    setErrorMessage(null)
    setIsCreatingSession(true)
    try {
      const response = await api.post<{ session_id: string }>('/sessions', {
        provider_setting_id: selectedProvider.id,
        model_id: selectedModel.model_id,
        permission_mode: permissionMode,
      })

      addSession({
        id: response.session_id,
        title: UNTITLED_SESSION_TITLE,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        providerSettingId: selectedProvider.id,
        providerLabel: selectedProvider.name,
        modelId: selectedModel.model_id,
        modelLabel: selectedModel.display_name || selectedModel.model_id,
        draftPrompt: prompt,
      })
      setInputValue('')
      navigate(`/conversation/${response.session_id}`)
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

      {/* ── Top Bar ── */}
      <div className="home-top-bar">
        <ChatTopBar
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
          onProviderSelect={(providerId) => {
            setSelectedProviderId(providerId)
            setSelectedModelId(null)
            setErrorMessage(null)
          }}
          onModelSelect={(modelId) => {
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
          permissionMode={permissionMode}
          onTogglePermission={togglePermissionMode}
          onPermissionModeSelect={setPermissionMode}
        />
      </div>

      {/* ── Main Content ── */}
      <div className="home-center">
        <h1 className="home-greeting">Hi, what's your plan for today?</h1>

        <div className="home-input-container">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            placeholder="Send a message, upload files, open a folder, or create a scheduled task..."
            maxHeight={200}
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
          <QuickAction icon={<CheckCorrect />} label="Create a task" />
          <QuickAction icon={<FileTextOne />} label="Summarize a file" />
          <QuickAction icon={<Browser />} label="Search the web" />
          <QuickAction icon={<LightMember />} label="Brainstorm ideas" />
        </div>
      </div>
    </div>
  )
}

function QuickAction({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="qa-btn">
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
  padding: 16px 24px;
}

.home-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px 100px;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

.home-greeting {
  font-family: serif;
  font-size: 32px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 24px;
  letter-spacing: -0.01em;
}

.home-input-container {
  width: 100%;
  max-width: 760px;
  margin-bottom: 32px;
}

.home-input-hint {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 12px;
}

.home-input-status {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 10px;
}

.home-input-status.error {
  color: #e59c7b;
}

.home-quick-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.qa-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 14px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
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
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}
`
