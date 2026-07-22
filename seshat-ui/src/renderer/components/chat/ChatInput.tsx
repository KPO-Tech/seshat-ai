import { useRef, useEffect, useState, useCallback } from 'react'
import { Plus, FolderClose, AtSign, Voice, Send, CheckCorrect, LoadingOne, CloseSmall, Close } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import type { Corpus } from '@/api/types'
import { startWavRecording, type WavRecording } from '@/lib/wavRecorder'

type SkillOption = { Name: string; DisplayName: string; Description: string; Source: string; UserInvocable?: boolean; IsHidden?: boolean }
export type ChatAttachment = {
  id: string
  filename: string
  content_type?: string
  size?: number
  category?: 'images' | 'documents' | 'other'
  local_path?: string
}

type UIExecutionMode = 'execute' | 'plan'

type Props = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  placeholder?: string
  maxHeight?: number
  showAutoButton?: boolean
  isStreaming?: boolean
  statusText?: string
  selectedCorpusId?: string | null
  onCorpusChange?: (id: string | null) => void
  executionMode?: UIExecutionMode
  onExecutionModeChange?: (mode: UIExecutionMode) => void
  projectPath?: string
  onProjectChange?: (path: string) => void
  attachments?: ChatAttachment[]
  onAttachFiles?: (files: FileList) => void | Promise<void>
  onRemoveAttachment?: (id: string) => void
  isUploadingAttachments?: boolean
}

// This button used to hold the permission-mode (Smart/Auto) toggle; that
// one stays put in the chat top bar's shield button (ChatTopBar.tsx),
// untouched. This slot is now a host-triggered execution-mode control:
// forces the session into Plan mode (or back to Execute) independent of
// whether the model itself decides to call enter_plan_mode. See
// seshat-backend's Session.ForcePlanMode()/ClearPlanMode().
const EXECUTION_CYCLE: UIExecutionMode[] = ['execute', 'plan']
const EXECUTION_LABEL: Record<UIExecutionMode, string> = { execute: 'Execute', plan: 'Plan' }

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  placeholder = 'Send a message...',
  maxHeight = 160,
  showAutoButton = false,
  isStreaming = false,
  statusText,
  selectedCorpusId,
  onCorpusChange,
  executionMode,
  onExecutionModeChange,
  projectPath,
  onProjectChange,
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
  isUploadingAttachments = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [slashIdx, setSlashIdx] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [corpusDropdownOpen, setCorpusDropdownOpen] = useState(false)
  const corpusDropdownRef = useRef<HTMLDivElement>(null)
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [recordError, setRecordError] = useState<string | null>(null)
  const wavRecordingRef = useRef<WavRecording | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    api.get<{ skills: SkillOption[] }>('/skills')
      .then(d => setSkills((d.skills ?? []).filter(s => s.Source !== 'mcp' && s.UserInvocable !== false && !s.IsHidden)))
      .catch(() => {})
    api.get<{ corpora: Corpus[] }>('/corpora')
      .then(d => setCorpora(d.corpora ?? []))
      .catch(() => {})
  }, [])

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function handleMicClick() {
    if (recordingState === 'transcribing') return

    if (recordingState === 'recording') {
      setRecordingState('transcribing')
      const blob = await wavRecordingRef.current?.stop()
      wavRecordingRef.current = null
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null

      if (!blob || blob.size <= 44) {
        // Nothing but the WAV header was captured.
        setRecordingState('idle')
        return
      }
      try {
        const form = new FormData()
        form.append('audio', blob, 'recording.wav')
        const result = await api.upload<{ text: string }>('/transcribe', form)
        if (result.text) {
          onChange(value.trim() ? `${value.trim()} ${result.text}` : result.text)
        }
      } catch (err) {
        setRecordError(err instanceof ApiError ? err.message : 'Transcription failed.')
      } finally {
        setRecordingState('idle')
      }
      return
    }

    setRecordError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      wavRecordingRef.current = startWavRecording(stream)
      setRecordingState('recording')
    } catch {
      setRecordError('Microphone access was denied.')
    }
  }

  // Close corpus dropdown on outside click
  useEffect(() => {
    if (!corpusDropdownOpen) return
    function onDown(e: MouseEvent) {
      if (!corpusDropdownRef.current?.contains(e.target as Node)) setCorpusDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [corpusDropdownOpen])

  const selectedCorpus = corpora.find(c => c.id === selectedCorpusId) ?? null
  const projectLabel = projectPath ? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath : null

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (!value) el.style.height = 'auto'
  }, [value])

  // Slash autocomplete state
  const slashMatch = /^\/(\S*)$/.exec(value.trimStart())
  const slashQuery = slashMatch ? slashMatch[1].toLowerCase() : null
  const showSlash = slashQuery !== null
  const filtered = showSlash
    ? skills.filter(s =>
        (s.Name || '').toLowerCase().startsWith(slashQuery) ||
        (s.DisplayName || '').toLowerCase().startsWith(slashQuery)
      ).slice(0, 8)
    : []

  const selectSkill = useCallback((skill: SkillOption) => {
    onChange(`/${skill.Name} `)
    setSlashIdx(0)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [onChange])

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlash && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIdx(i => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && filtered.length > 0 && !e.shiftKey)) {
        e.preventDefault()
        selectSkill(filtered[slashIdx])
        return
      }
      if (e.key === 'Escape') { onChange(''); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isStreaming) return
      if (value.trim()) onSend()
    }
  }

  // Reset selected index when filter changes
  useEffect(() => { setSlashIdx(0) }, [slashQuery])

  return (
    <div className="chat-input-wrapper">
      {showSlash && filtered.length > 0 && (
        <div className="chat-slash-dropdown" ref={dropdownRef}>
          {filtered.map((sk, i) => (
            <button
              key={sk.Name}
              className={`chat-slash-item${i === slashIdx ? ' selected' : ''}`}
              onMouseDown={e => { e.preventDefault(); selectSkill(sk) }}
              onMouseEnter={() => setSlashIdx(i)}
            >
              <span className="chat-slash-name">/{sk.Name}</span>
              {sk.Description && <span className="chat-slash-desc">{sk.Description}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Corpus chip */}
      {selectedCorpus && onCorpusChange && (
        <div className="chat-corpus-chip">
          <span className="chat-corpus-chip-icon">📚</span>
          <span className="chat-corpus-chip-name">{selectedCorpus.name}</span>
          <button
            className="chat-corpus-chip-remove"
            onMouseDown={e => { e.preventDefault(); onCorpusChange(null) }}
            title="Remove knowledge base"
          >
            <Close size={11} />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="chat-attachment-row">
          {attachments.map(file => (
            <div key={file.id} className={`chat-attachment-chip chat-attachment-chip--${file.category ?? 'other'}`} title={file.local_path ?? file.filename}>
              <span className="chat-attachment-icon" aria-hidden>
                {file.category === 'images' ? '🖼' : file.category === 'documents' ? '📄' : '📎'}
              </span>
              <span className="chat-attachment-name">{file.filename}</span>
              <button
                className="chat-attachment-remove"
                onMouseDown={e => { e.preventDefault(); onRemoveAttachment?.(file.id) }}
                title="Remove attachment"
              >
                <Close size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="chat-input-textarea"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        rows={1}
      />

      <div className="chat-input-footer">
        <div className="chat-input-tools-left">
          <button
            className={`chat-tool-circle${isUploadingAttachments ? ' chat-tool-circle-loading' : ''}`}
            type="button"
            title="Attach files"
            disabled={isUploadingAttachments}
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={15} />
          </button>
          <input
            ref={fileInputRef}
            className="chat-file-input"
            type="file"
            multiple
            onChange={e => {
              const files = e.currentTarget.files
              if (files && files.length > 0) void onAttachFiles?.(files)
              e.currentTarget.value = ''
            }}
          />
          <div className="chat-workspace-control">
            <button
              className={`chat-tool-icon${projectPath ? ' chat-tool-icon-active' : ''}`}
              title={projectPath ? `Project: ${projectPath}` : 'Set project folder'}
              onClick={async () => {
                const result = await window.nexus?.dialog?.openDirectory?.()
                if (result && !result.canceled && result.filePaths?.length) {
                  onProjectChange?.(result.filePaths[0])
                }
              }}
            >
              <FolderClose size={15} />
            </button>
            {projectLabel && (
              <>
                <span className="chat-workspace-label" title={projectPath}>{projectLabel}</span>
                <button
                  className="chat-workspace-clear"
                  title="Clear project folder"
                  onMouseDown={(e) => { e.preventDefault(); onProjectChange?.('') }}
                >
                  <Close size={11} />
                </button>
              </>
            )}
          </div>
          <div className="chat-corpus-wrap" ref={corpusDropdownRef}>
            <button
              className={`chat-tool-icon${selectedCorpusId ? ' chat-tool-icon-active' : ''}`}
              title="Attach knowledge base"
              onClick={() => setCorpusDropdownOpen(v => !v)}
            >
              <AtSign size={15} />
            </button>
            {corpusDropdownOpen && (
              <div className="chat-corpus-dropdown">
                <div className="chat-corpus-dropdown-header">Knowledge bases</div>
                {corpora.length === 0 ? (
                  <div className="chat-corpus-empty">No knowledge bases found</div>
                ) : corpora.map(c => (
                  <button
                    key={c.id}
                    className={`chat-corpus-item${c.id === selectedCorpusId ? ' selected' : ''}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      onCorpusChange?.(c.id === selectedCorpusId ? null : c.id)
                      setCorpusDropdownOpen(false)
                    }}
                  >
                    <span className="chat-corpus-item-name">{c.name}</span>
                    {c.chunk_count > 0 && <span className="chat-corpus-item-count">{c.chunk_count} chunks</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className={`chat-tool-icon${recordingState === 'recording' ? ' chat-tool-icon-recording' : ''}`}
            type="button"
            title={
              recordingState === 'recording'
                ? 'Stop recording'
                : recordingState === 'transcribing'
                  ? 'Transcribing…'
                  : 'Record a voice message'
            }
            disabled={recordingState === 'transcribing'}
            onClick={() => void handleMicClick()}
          >
            {recordingState === 'transcribing'
              ? <LoadingOne size={15} className="chat-status-spin" />
              : <Voice size={15} />}
          </button>
          {recordError && <span className="chat-record-error">{recordError}</span>}
          {isStreaming && (
            <div className="chat-status-inline" aria-live="polite">
              <LoadingOne size={14} className="chat-status-spin" />
              <span>{statusText || 'Running…'}</span>
            </div>
          )}
        </div>

        <div className="chat-input-tools-right">
          {showAutoButton && (
            <button
              className="chat-auto-btn"
              onClick={() => {
                if (!onExecutionModeChange) return
                const current = executionMode ?? 'execute'
                const currentIndex = EXECUTION_CYCLE.indexOf(current)
                const next = EXECUTION_CYCLE[(currentIndex + 1) % EXECUTION_CYCLE.length]
                onExecutionModeChange(next)
              }}
              title={`Mode: ${EXECUTION_LABEL[executionMode ?? 'execute']} (click to toggle)`}
              data-mode={executionMode ?? 'execute'}
            >
              <span className="chat-auto-dot" />
              <span>{EXECUTION_LABEL[executionMode ?? 'execute']}</span>
            </button>
          )}
          {isStreaming ? (
            <button className="chat-stop-btn" onClick={onStop} type="button" title="Stop">
              <CloseSmall size={16} />
            </button>
          ) : (
            <button
              className={`chat-send-btn${value.trim() ? ' active' : ''}`}
              onClick={() => value.trim() && onSend()}
              type="button"
            >
              <Send size={16} theme={value.trim() ? 'filled' : 'outline'} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export const CHAT_INPUT_CSS = `
/* ── Slash-command dropdown ── */
.chat-slash-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0; right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  overflow: hidden;
  z-index: 200;
  max-height: 280px;
  overflow-y: auto;
}

.chat-slash-item {
  width: 100%; text-align: left;
  background: none; border: none; cursor: pointer;
  padding: 10px 16px;
  display: flex; align-items: baseline; gap: 10px;
  transition: background 0.1s;
}
.chat-slash-item:hover, .chat-slash-item.selected {
  background: var(--color-surface);
}
.chat-slash-name {
  font-size: 13px; font-weight: 700; color: var(--color-cta);
  flex-shrink: 0; font-family: var(--font-mono, monospace);
}
.chat-slash-desc {
  font-size: 12px; color: var(--color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.chat-input-wrapper {
  background: var(--color-bg);
  border-radius: 20px;
  padding: 16px;
  position: relative; /* anchors slash dropdown */
  border: 1.5px solid transparent;
  background-image: linear-gradient(var(--color-bg), var(--color-bg)),
                    linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 50%, var(--color-surface-elevated) 100%);
  background-origin: border-box;
  background-clip: padding-box, border-box;
}

.chat-input-textarea {
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.6;
  outline: none;
  resize: none;
  width: 100%;
  min-height: 24px;
  font-family: inherit;
}

.chat-input-textarea::placeholder {
  color: var(--color-text-muted);
  font-style: italic;
}

.chat-attachment-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.chat-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  border-radius: 12px;
  padding: 4px 7px 4px 8px;
  font-size: 12px;
}

.chat-attachment-icon {
  font-size: 13px;
  line-height: 1;
  flex-shrink: 0;
}

.chat-attachment-chip--images {
  border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.chat-attachment-chip--documents {
  border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
}

.chat-attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-attachment-remove {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 1px;
}

.chat-attachment-remove:hover {
  color: var(--color-text-secondary);
}

.chat-file-input {
  display: none;
}

.chat-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.chat-input-tools-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.chat-input-tools-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-tool-circle {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.chat-tool-circle:disabled {
  opacity: 0.55;
  cursor: progress;
}

.chat-tool-circle:hover:not(:disabled) {
  background: var(--color-hover);
  transform: scale(1.05);
}

.chat-tool-icon {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.chat-tool-icon:disabled {
  opacity: 0.55;
  cursor: progress;
}

.chat-tool-icon-recording {
  color: #f87171 !important;
  animation: chat-mic-pulse 1.2s ease-in-out infinite;
}

@keyframes chat-mic-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.chat-record-error {
  font-size: 11px;
  color: #f87171;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.chat-tool-icon:hover {
  color: var(--color-text-secondary);
}

.chat-workspace-control {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 180px;
}

.chat-workspace-label {
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-workspace-clear {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
}

.chat-workspace-clear:hover {
  color: var(--color-text-secondary);
}

.chat-send-btn {
  background: var(--color-surface);
  color: var(--color-text-muted);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.2s;
}

.chat-send-btn.active {
  background: var(--color-text);
  color: var(--color-bg);
  cursor: pointer;
}

.chat-stop-btn {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--color-primary-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.chat-stop-btn:hover {
  background: var(--color-primary-hover);
}

.chat-auto-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.chat-auto-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.15s;
}

.chat-auto-btn[data-mode="execute"] {
  border-color: color-mix(in srgb, var(--color-primary) 32%, transparent);
  color: var(--color-primary);
}

.chat-auto-btn[data-mode="execute"] .chat-auto-dot {
  background: var(--color-primary);
}

.chat-auto-btn[data-mode="plan"] {
  border-color: color-mix(in srgb, #60a5fa 32%, transparent);
  color: #60a5fa;
}

.chat-auto-btn[data-mode="plan"] .chat-auto-dot {
  background: #60a5fa;
}

.chat-status-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  min-width: 0;
  max-width: 320px;
}

.chat-status-inline span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-status-spin {
  animation: chat-input-spin 0.9s linear infinite;
}

@keyframes chat-input-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Corpus chip ── */
.chat-corpus-chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(239,124,47,0.1); border: 1px solid rgba(239,124,47,0.3);
  border-radius: 6px; padding: 3px 8px 3px 6px;
  margin-bottom: 8px; font-size: 12px; font-weight: 600;
  color: var(--color-primary);
}
.chat-corpus-chip-icon { font-size: 13px; line-height: 1; }
.chat-corpus-chip-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-corpus-chip-remove {
  background: none; border: none; color: inherit; cursor: pointer;
  padding: 1px; display: flex; align-items: center; opacity: 0.7;
  border-radius: 3px;
}
.chat-corpus-chip-remove:hover { opacity: 1; }

/* ── Corpus dropdown ── */
.chat-corpus-wrap { position: relative; }
.chat-tool-icon-active { color: var(--color-primary) !important; }
.chat-corpus-dropdown {
  position: absolute; bottom: calc(100% + 8px); left: 0;
  min-width: 220px; max-width: 280px;
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,0.18);
  overflow: hidden; z-index: 200;
  display: flex; flex-direction: column;
}
.chat-corpus-dropdown-header {
  padding: 8px 14px 6px; font-size: 11px; font-weight: 800;
  color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em;
  border-bottom: 1px solid var(--color-border-subtle);
}
.chat-corpus-item {
  width: 100%; text-align: left; background: none; border: none;
  padding: 9px 14px; cursor: pointer; display: flex;
  align-items: center; justify-content: space-between; gap: 8px;
  font-size: 13px; color: var(--color-text); transition: background 0.1s;
}
.chat-corpus-item:hover, .chat-corpus-item.selected { background: var(--color-surface); }
.chat-corpus-item.selected .chat-corpus-item-name { color: var(--color-primary); font-weight: 700; }
.chat-corpus-item-count { font-size: 11px; color: var(--color-text-muted); white-space: nowrap; }
.chat-corpus-empty { padding: 12px 14px; font-size: 13px; color: var(--color-text-muted); }
`
