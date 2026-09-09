import { useEffect, useState } from 'react'
import { History, Robot, Send, Setting } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { Agent, ProviderModel, ProviderSetting } from '@/api/types'
import { fetchProviderModels } from '@/hooks/useProviders'
import type { JobDraft, PlannerPreference } from '../api/types'
import { draftAutomation, loadPlannerPreference, savePlannerPreference } from '../lib/schedulingJobs'
export function AutomationPlannerPanel({ disabled, agents, providers, onDraft }: {
  disabled: boolean
  agents: Agent[]
  providers: ProviderSetting[]
  onDraft: (draft: JobDraft) => void
}) {
  const [request, setRequest] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [preference, setPreference] = useState<PlannerPreference | null>(() => loadPlannerPreference())
  const canDraft = request.trim().length > 0 && !disabled
  const suggestions = [
    'Every Monday at 8, send a weekly operations report.',
    'Monitor failures daily and summarize anything urgent.',
    'Summarize new documents every Friday afternoon.',
  ]

  function handleDraft(value = request) {
    if (!value.trim() || disabled) return
    onDraft(draftAutomation(value, agents, providers, preference))
  }

  function handlePreferenceSaved(next: PlannerPreference | null) {
    setPreference(next)
    savePlannerPreference(next)
    setShowSettings(false)
  }

  return (
    <aside className="sch-planner">
      <div className="sch-planner-head">
        <div className="sch-planner-icon"><Robot size={18} /></div>
        <div className="sch-planner-head-copy">
          <h2>Automation Planner</h2>
          <p>Draft scheduled jobs with approval.</p>
        </div>
        <button
          type="button"
          className="sch-planner-settings-btn"
          onClick={() => setShowSettings(true)}
          title="Choose the provider and model used to draft automations"
        >
          <Setting size={15} />
        </button>
      </div>

      <div className="sch-planner-suggestions">
        <div className="sch-planner-section-label">Try a suggestion</div>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="sch-planner-chip"
            disabled={disabled}
            onClick={() => {
              setRequest(suggestion)
              handleDraft(suggestion)
            }}
          >
            <History size={13} />
            <span>{suggestion.split(',')[0]}</span>
          </button>
        ))}
      </div>

      {disabled && (
        <div className="sch-planner-disabled">
          Connect to Seshat Server and make sure you have job permissions to create automations.
        </div>
      )}

      <div className="sch-planner-inputbar">
        <input
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleDraft()
            }
          }}
          disabled={disabled}
          placeholder="Describe the automation..."
        />
        <button type="button" onClick={() => handleDraft()} disabled={!canDraft} title="Draft job">
          <Send size={15} />
        </button>
      </div>

      {showSettings && (
        <PlannerSettingsModal
          providers={providers}
          preference={preference}
          onClose={() => setShowSettings(false)}
          onSaved={handlePreferenceSaved}
        />
      )}
    </aside>
  )
}

function PlannerSettingsModal({ providers, preference, onClose, onSaved }: {
  providers: ProviderSetting[]
  preference: PlannerPreference | null
  onClose: () => void
  onSaved: (next: PlannerPreference | null) => void
}) {
  const [providerId, setProviderId] = useState(preference?.providerSettingId ?? '')
  const [modelId, setModelId] = useState(preference?.modelId ?? '')
  const [models, setModels] = useState<ProviderModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => {
    if (!providerId) { setModels([]); return }
    let cancelled = false
    setLoadingModels(true)
    fetchProviderModels(providerId)
      .then((result) => { if (!cancelled) setModels(result) })
      .catch(() => { if (!cancelled) setModels([]) })
      .finally(() => { if (!cancelled) setLoadingModels(false) })
    return () => { cancelled = true }
  }, [providerId])

  useEffect(() => {
    if (modelId && models.some((model) => model.model_id === modelId)) return
    const def = models.find((model) => model.is_default) ?? models[0]
    setModelId(def?.model_id ?? '')
  }, [modelId, models])

  function handleSave() {
    onSaved(providerId && modelId ? { providerSettingId: providerId, modelId } : null)
  }

  function handleUseDefault() {
    onSaved(null)
  }

  return (
    <div className="sch-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sch-planner-settings-modal" role="dialog" aria-modal="true">
        <div className="sch-modal-header">
          <div>
            <h2>Planner model</h2>
            <p>Provider and model used to draft new automations. Leave unset to use your organization's default.</p>
          </div>
          <button className="sch-modal-close" onClick={onClose}><WindowCloseIcon size={13} /></button>
        </div>
        <div className="sch-planner-settings-body">
          <div className="sch-field">
            <label>Provider</label>
            <select value={providerId} onChange={(e) => { setProviderId(e.target.value); setModelId('') }}>
              <option value="">Organization default</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </div>
          <div className="sch-field">
            <label>Model</label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={!providerId || loadingModels || models.length === 0}
            >
              <option value="" disabled>
                {!providerId ? 'Select a provider first' : loadingModels ? 'Loading models...' : 'Select a model...'}
              </option>
              {models.map((model) => (
                <option key={model.model_id} value={model.model_id}>{model.display_name || model.model_id}</option>
              ))}
            </select>
            {providerId && !loadingModels && models.length === 0 && (
              <div className="sch-field-hint">No models found for this provider.</div>
            )}
          </div>
        </div>
        <div className="sch-modal-footer">
          <button type="button" className="sch-modal-btn-cancel" onClick={handleUseDefault}>Use organization default</button>
          <button type="button" className="sch-modal-btn-submit" disabled={!providerId || !modelId} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

