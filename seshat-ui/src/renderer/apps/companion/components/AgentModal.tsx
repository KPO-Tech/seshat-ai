import { useState } from 'react'
import { CheckOne, Close, LoadingOne } from '@icon-park/react'
import {
  AvatarPicker,
  encodeAvatarIcon,
  parseAvatarIcon,
  randomSeed,
} from '@/components/agents/avatar'
import {
  BLANK_AGENT_FORM,
  PERMISSION_OPTIONS,
  toSlug,
  type AgentForm,
} from '../lib/companionForm'

type AgentModalProps = {
  initial: AgentForm | null
  onSave: (form: AgentForm) => void
  onClose: () => void
  saving: boolean
}

export function AgentModal({ initial, onSave, onClose, saving }: AgentModalProps) {
  const isNew = initial === null
  const [form, setForm] = useState<AgentForm>(initial ?? BLANK_AGENT_FORM)

  const update = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const onNameChange = (name: string) => {
    setForm((current) => ({
      ...current,
      name,
      slug: isNew ? toSlug(name) : current.slug,
    }))
  }

  const baseSeed = form.slug || 'new-agent'
  const { styleId: avatarStyleId, seed: avatarSeed } = parseAvatarIcon(form.icon, baseSeed)

  return (
    <div className="cmp-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="cmp-modal">
        <div className="cmp-modal-header">
          <h2>{isNew ? 'New companion' : 'Edit companion'}</h2>
          <button className="cmp-modal-close" onClick={onClose}><Close size={18} /></button>
        </div>

        <div className="cmp-modal-body">
          <div className="cmp-form-row cmp-form-row--icon">
            <AvatarPicker
              styleId={avatarStyleId}
              seed={avatarSeed}
              baseSeed={baseSeed}
              onPick={(styleId, seed) => update('icon', encodeAvatarIcon(styleId, seed))}
              onReroll={() => update('icon', encodeAvatarIcon(avatarStyleId, randomSeed()))}
              size={64}
            />
            <div className="cmp-field cmp-field--fill">
              <label>Name <span className="cmp-required">*</span></label>
              <input className="cmp-input" placeholder="My companion" value={form.name} onChange={(event) => onNameChange(event.target.value)} />
            </div>
          </div>

          <div className="cmp-field">
            <label>Slug <span className="cmp-required">*</span></label>
            <input className="cmp-input cmp-input--mono" placeholder="my-companion" value={form.slug} onChange={(event) => update('slug', event.target.value)} />
          </div>

          <div className="cmp-field">
            <label>When to use</label>
            <input className="cmp-input" placeholder="Use this agent when..." value={form.when_to_use} onChange={(event) => update('when_to_use', event.target.value)} />
          </div>

          <div className="cmp-field">
            <label>System prompt</label>
            <textarea
              className="cmp-textarea"
              rows={7}
              placeholder={'You are a helpful assistant specialized in...\n\nYour role is to...'}
              value={form.system_prompt}
              onChange={(event) => update('system_prompt', event.target.value)}
            />
          </div>

          <div className="cmp-field">
            <label>Model <span className="cmp-hint">(optional, overrides default)</span></label>
            <input className="cmp-input cmp-input--mono" placeholder="anthropic:claude-sonnet-5" value={form.model} onChange={(event) => update('model', event.target.value)} />
          </div>

          <div className="cmp-field">
            <label>Tools</label>
            <div className="cmp-radio-group">
              <label className="cmp-radio">
                <input type="radio" checked={form.tools_mode === 'all'} onChange={() => update('tools_mode', 'all')} />
                All tools
              </label>
              <label className="cmp-radio">
                <input type="radio" checked={form.tools_mode === 'custom'} onChange={() => update('tools_mode', 'custom')} />
                Custom list
              </label>
            </div>
            {form.tools_mode === 'custom' && (
              <input className="cmp-input cmp-input--mono" placeholder="web_search, bash, read_file" value={form.tools_custom} onChange={(event) => update('tools_custom', event.target.value)} />
            )}
          </div>

          <div className="cmp-field">
            <label>Disallowed tools <span className="cmp-hint">(comma-separated)</span></label>
            <input className="cmp-input cmp-input--mono" placeholder="bash, delete_file" value={form.disallowed_tools} onChange={(event) => update('disallowed_tools', event.target.value)} />
          </div>

          <div className="cmp-form-row">
            <div className="cmp-field cmp-field--fill">
              <label>Max turns</label>
              <input className="cmp-input" type="number" min={1} max={500} value={form.max_turns} onChange={(event) => update('max_turns', parseInt(event.target.value) || 50)} />
            </div>
            <div className="cmp-field cmp-field--fill">
              <label>Permission mode</label>
              <select className="cmp-select" value={form.permission_mode} onChange={(event) => update('permission_mode', event.target.value)}>
                {PERMISSION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cmp-field cmp-field--inline">
            <label className="cmp-toggle">
              <input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />
              <span className="cmp-toggle-track" />
              <span>Enabled</span>
            </label>
          </div>
        </div>

        <div className="cmp-modal-footer">
          <button className="cmp-btn cmp-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cmp-btn cmp-btn--primary" onClick={() => onSave(form)} disabled={saving || !form.slug.trim()}>
            {saving ? <LoadingOne size={14} className="spin" /> : <CheckOne size={14} />}
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
