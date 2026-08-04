import { useRef, useEffect, useState, useCallback } from 'react'
import { Plus, FolderClose, AtSign, Voice, Send, CheckCorrect, LoadingOne, CloseSmall, Close, Browser } from '@icon-park/react'
import { AttachmentTypeIcon } from '@/components/AttachmentTypeIcon'
import { api, ApiError } from '@/api/client'
import type { Corpus } from '@/api/types'
import { startWavRecording, type WavRecording } from '@/lib/wavRecorder'
import { SelectorPill, SelectorMenu, SELECTOR_PILL_CSS, type SelectorOption } from '@/components/ui/SelectorPill'
import { useUIStore } from '@/stores/ui'

type SkillOption = { Name: string; DisplayName: string; Description: string; Source: string; UserInvocable?: boolean; IsHidden?: boolean }
export type ChatAttachment = {
  id: string
  filename: string
  content_type?: string
  size?: number
  category?: 'images' | 'documents' | 'other'
  local_path?: string
  preview_url?: string
  page_preview_urls?: string[]
  upload_status?: 'uploading' | 'uploaded' | 'failed'
  error?: string
}

function filePathToURL(path?: string): string | null {
  if (!path) return null
  if (/^(file|https?):\/\//i.test(path)) return path
  const normalized = path.replace(/\\/g, '/')
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${prefixed.split('/').map((part, index) => (
    index === 0 || /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)
  )).join('/')}`
}

function formatAttachmentSize(size?: number): string | null {
  if (!size || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// Files that are already plain text - preview their own bytes directly.
// PDF has its own real page-1 thumbnail pipeline (isPDFFile/
// renderPDFPagePreviews, unrelated to this text-preview mechanism). Every
// other type - CSV/TSV/JSON/YAML/LOG included - falls to the file type
// icon (see AttachmentTypeIcon) at this card's small size instead: even a
// legitimately-plain-text format like JSON reads as illegible noise
// shrunk to 6px in a ~52px card, and it's a stronger, more consistent
// signal than a wall of tiny characters no one can actually read here.
const TEXT_PREVIEW_EXTENSIONS = new Set(['md', 'markdown', 'txt'])
// The backend's docling-markdown conversion (used by MessageItem.tsx's own
// copy of this preview, where there's more room) isn't used for this card
// at all - DOCX/PPTX/XLSX/HTML/TEX all fall to the icon fallback here
// instead, same reasoning as the comment on TEXT_PREVIEW_EXTENSIONS above.
function isTextPreviewable(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_PREVIEW_EXTENSIONS.has(ext)
}

async function fetchTextPreview(fileId: string): Promise<string> {
  const dataUrl = await api.getFileDataURL(`/files/${fileId}/content`)
  // Decode the base64 payload directly rather than fetch(dataUrl) - the
  // renderer's CSP connect-src doesn't (and shouldn't need to) allow data:,
  // and this avoids a pointless extra network-stack round-trip anyway.
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

type Props = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  placeholder?: string
  maxHeight?: number
  isStreaming?: boolean
  statusText?: string
  selectedCorpusId?: string | null
  onCorpusChange?: (id: string | null) => void
  projectPath?: string
  onProjectChange?: (path: string) => void
  attachments?: ChatAttachment[]
  onAttachFiles?: (files: FileList) => void | Promise<void>
  onRemoveAttachment?: (id: string) => void
  isUploadingAttachments?: boolean
  attachmentError?: string | null
  // Relocated here from ChatTopBar - Provider/Model live next to where the
  // user actually types. Everything else (mode, permission, agent monitor)
  // stays in ChatTopBar's top-right cluster.
  providerLabel?: string
  modelLabel?: string
  onProviderClick?: () => void
  onModelClick?: () => void
  providerOptions?: SelectorOption[]
  modelOptions?: SelectorOption[]
  selectedProviderId?: string | null
  selectedModelId?: string | null
  onProviderSelect?: (id: string) => void
  onModelSelect?: (id: string) => void
  providerDisabled?: boolean
  modelDisabled?: boolean
  modelError?: string | null
  onModelRetry?: () => void
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  placeholder = 'Send a message...',
  maxHeight = 160,
  isStreaming = false,
  statusText,
  selectedCorpusId,
  onCorpusChange,
  projectPath,
  onProjectChange,
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
  isUploadingAttachments = false,
  attachmentError,
  providerLabel = 'Provider',
  modelLabel = 'Model',
  onProviderClick,
  onModelClick,
  providerOptions,
  modelOptions,
  selectedProviderId,
  selectedModelId,
  onProviderSelect,
  onModelSelect,
  providerDisabled = false,
  modelDisabled = false,
  modelError,
  onModelRetry,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectorsRef = useRef<HTMLDivElement>(null)
  const [openSelector, setOpenSelector] = useState<'provider' | 'model' | null>(null)
  const hasProviderMenu = !!providerOptions?.length && !!onProviderSelect
  const hasModelMenu = !!modelOptions?.length && !!onModelSelect
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [slashIdx, setSlashIdx] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [corpusDropdownOpen, setCorpusDropdownOpen] = useState(false)
  const corpusDropdownRef = useRef<HTMLDivElement>(null)
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [recordError, setRecordError] = useState<string | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null)
  const [attachmentPreviewURLs, setAttachmentPreviewURLs] = useState<Record<string, string>>({})
  const openLightbox = useUIStore((s) => s.openLightbox)
  const wavRecordingRef = useRef<WavRecording | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const canSend = value.trim().length > 0 || attachments.length > 0

  useEffect(() => {
    let cancelled = false
    const imageAttachments = attachments.filter(file =>
      (file.category === 'images' || file.content_type?.startsWith('image/')) &&
      file.local_path &&
      !attachmentPreviewURLs[file.id]
    )
    if (imageAttachments.length === 0) return

    for (const file of imageAttachments) {
      const fallbackURL = filePathToURL(file.local_path) ?? ''
      if (!window.nexus?.readFileDataURL) {
        setAttachmentPreviewURLs(current => ({ ...current, [file.id]: fallbackURL }))
        continue
      }
      void window.nexus.readFileDataURL(file.local_path ?? '')
        .then((url) => {
          if (!cancelled) setAttachmentPreviewURLs(current => ({ ...current, [file.id]: url }))
        })
        .catch(() => {
          if (!cancelled) setAttachmentPreviewURLs(current => ({ ...current, [file.id]: fallbackURL }))
        })
    }

    return () => { cancelled = true }
  }, [attachments, attachmentPreviewURLs])

  // Text preview for types with no client-side visual render (MD/TXT/CSV/... -
  // their own content; DOCX/PPTX/XLSX/HTML/TEX - the docling markdown
  // conversion the backend already generated at upload time). Only attempted
  // once a file has a real server ID (upload_status 'uploaded'), and only once
  // per file (textPreviewFetchedRef) - a 404 (no conversion available, e.g.
  // docling not configured) just leaves the extension-badge fallback in place.
  const textPreviewFetchedRef = useRef<Set<string>>(new Set())
  const [textPreviews, setTextPreviews] = useState<Record<string, string>>({})
  useEffect(() => {
    for (const file of attachments) {
      if (file.upload_status !== 'uploaded') continue
      if (!isTextPreviewable(file.filename) || textPreviewFetchedRef.current.has(file.id)) continue
      textPreviewFetchedRef.current.add(file.id)
      void fetchTextPreview(file.id)
        .then(text => setTextPreviews(current => ({ ...current, [file.id]: text })))
        .catch(() => {})
    }
  })

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

  // Close provider/model dropdown on outside click
  useEffect(() => {
    if (!openSelector) return
    function onDown(e: MouseEvent) {
      if (!selectorsRef.current?.contains(e.target as Node)) setOpenSelector(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openSelector])

  function handleProviderTrigger() {
    if (providerDisabled) return
    if (hasProviderMenu) {
      setOpenSelector((current) => (current === 'provider' ? null : 'provider'))
      return
    }
    onProviderClick?.()
  }

  function handleModelTrigger() {
    if (modelDisabled) return
    if (hasModelMenu) {
      setOpenSelector((current) => (current === 'model' ? null : 'model'))
      return
    }
    onModelClick?.()
  }

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
      if (canSend) onSend()
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
          <span className="chat-corpus-chip-icon">@</span>
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
          {attachments.map(file => {
            const isImage = file.category === 'images' || file.content_type?.startsWith('image/')
            const pagePreviewURL = file.page_preview_urls?.[0]
            // filePathToURL is only a valid preview for images - for DOCX/PPTX/MD (no
            // page-preview generation, see the useEffect above) it would otherwise
            // point <img> at a non-image file and render a broken-image glyph.
            const previewURL = pagePreviewURL ?? file.preview_url ?? attachmentPreviewURLs[file.id] ?? (isImage ? filePathToURL(file.local_path) : undefined)
            const textPreview = !previewURL ? textPreviews[file.id] : undefined
            const sizeLabel = formatAttachmentSize(file.size)
            const extLabel = file.filename.split('.').pop()?.toUpperCase() ?? ''
            const statusLabel = file.upload_status === 'uploading'
              ? 'Uploading...'
              : file.upload_status === 'failed'
                ? file.error || 'Upload failed'
                : sizeLabel
            const tooltip = [file.filename, statusLabel].filter(Boolean).join(' - ')
            return (
              <div
                key={file.id}
                className={[
                  'chat-attachment-card',
                  `chat-attachment-card--${isImage ? 'image' : file.category ?? 'other'}`,
                  file.upload_status ? `chat-attachment-card--${file.upload_status}` : '',
                ].filter(Boolean).join(' ')}
              >
                {previewURL ? (
                  <button
                    type="button"
                    className="chat-attachment-thumb"
                    onClick={() => (isImage ? openLightbox({ url: previewURL, filename: file.filename }) : setPreviewAttachment(file))}
                    title={tooltip}
                  >
                    <img src={previewURL} alt={file.filename} />
                  </button>
                ) : textPreview ? (
                  <button
                    type="button"
                    className="chat-attachment-thumb chat-attachment-thumb--text"
                    onClick={() => setPreviewAttachment(file)}
                    title={tooltip}
                  >
                    <span className="chat-attachment-text-preview">{textPreview}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chat-attachment-file-icon"
                    onClick={() => file.local_path && void window.nexus?.openPath?.(file.local_path)}
                    title={tooltip}
                  >
                    <span className="chat-attachment-file-icon-name">{file.filename}</span>
                    <AttachmentTypeIcon filename={file.filename} size={18} />
                  </button>
                )}
                {extLabel && <span className="chat-attachment-thumb-badge">{extLabel}</span>}
                {file.upload_status === 'uploading' && (
                  <span className="chat-attachment-spinner"><LoadingOne size={14} className="chat-status-spin" /></span>
                )}
                <button
                  className="chat-attachment-remove"
                  onMouseDown={e => { e.preventDefault(); onRemoveAttachment?.(file.id) }}
                  title="Remove attachment"
                >
                  <Close size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {previewAttachment && (
        <div
          className="chat-attachment-preview"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setPreviewAttachment(null)}
        >
          <div className="chat-attachment-preview-shell" onMouseDown={(event) => event.stopPropagation()}>
            <div className="chat-attachment-preview-header">
              <span>{previewAttachment.filename}</span>
              <button type="button" onClick={() => setPreviewAttachment(null)} title="Close preview">
                <Close size={14} />
              </button>
            </div>
            {previewAttachment.page_preview_urls?.length ? (
              <div className="chat-attachment-preview-pages">
                {previewAttachment.page_preview_urls.map((url, index) => (
                  <img key={`${previewAttachment.id}-page-${index}`} src={url} alt={`${previewAttachment.filename} page ${index + 1}`} />
                ))}
              </div>
            ) : (previewAttachment.preview_url ?? attachmentPreviewURLs[previewAttachment.id] ?? filePathToURL(previewAttachment.local_path)) ? (
              <img
                src={previewAttachment.preview_url ?? attachmentPreviewURLs[previewAttachment.id] ?? filePathToURL(previewAttachment.local_path) ?? undefined}
                alt={previewAttachment.filename}
              />
            ) : textPreviews[previewAttachment.id] ? (
              <pre className="chat-attachment-preview-text">{textPreviews[previewAttachment.id]}</pre>
            ) : null}
          </div>
        </div>
      )}

      {(attachmentError || modelError) && (
        <div className="chat-input-notices" aria-live="polite">
          {attachmentError && <div className="chat-input-notice">{attachmentError}</div>}
          {modelError && (
            <div className="chat-input-notice">
              <span>{modelError}</span>
              {onModelRetry && (
                <button type="button" className="chat-input-notice-action" onClick={onModelRetry}>
                  Retry
                </button>
              )}
            </div>
          )}
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
            <Plus size={18} />
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
              <FolderClose size={13} />
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
              <AtSign size={13} />
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
                  ? 'Transcribing...'
                  : 'Record a voice message'
            }
            disabled={recordingState === 'transcribing'}
            onClick={() => void handleMicClick()}
          >
            {recordingState === 'transcribing'
              ? <LoadingOne size={13} className="chat-status-spin" />
              : <Voice size={13} />}
          </button>
          {recordError && <span className="chat-record-error">{recordError}</span>}
          {isStreaming && (
            <div className="chat-status-inline" aria-live="polite">
              <LoadingOne size={14} className="chat-status-spin" />
              <span>{statusText || 'Running...'}</span>
            </div>
          )}
        </div>

        <div className="chat-input-tools-right" ref={selectorsRef}>
          <div className="chat-selector-wrap">
            <SelectorPill
              label={providerLabel}
              icon={<Browser size={12} />}
              onClick={handleProviderTrigger}
              disabled={providerDisabled}
            />
            {openSelector === 'provider' && providerOptions && onProviderSelect && (
              <SelectorMenu
                placement="up"
                options={providerOptions}
                selectedId={selectedProviderId}
                onSelect={(id) => {
                  setOpenSelector(null)
                  onProviderSelect(id)
                }}
              />
            )}
          </div>
          <div className="chat-selector-wrap">
            <SelectorPill
              label={modelLabel}
              icon={<CheckCorrect size={12} />}
              onClick={handleModelTrigger}
              disabled={modelDisabled}
            />
            {openSelector === 'model' && modelOptions && onModelSelect && (
              <SelectorMenu
                placement="up"
                options={modelOptions}
                selectedId={selectedModelId}
                onSelect={(id) => {
                  setOpenSelector(null)
                  onModelSelect(id)
                }}
              />
            )}
          </div>
          {isStreaming ? (
            <button className="chat-stop-btn" onClick={onStop} type="button" title="Stop">
              <CloseSmall size={14} />
            </button>
          ) : (
            <button
              className={`chat-send-btn${canSend ? ' active' : ''}`}
              onClick={() => canSend && onSend()}
              type="button"
            >
              <Send size={14} theme={canSend ? 'filled' : 'outline'} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export const CHAT_INPUT_CSS = `
${SELECTOR_PILL_CSS}

.chat-selector-wrap {
  position: relative;
}

/* Slash-command dropdown */
.chat-slash-dropdown {
  position: absolute;
  bottom: calc(100% + var(--space-4));
  left: 0; right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2xl);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  overflow: hidden;
  z-index: 200;
  max-height: 280px;
  overflow-y: auto;
}

.chat-slash-item {
  width: 100%; text-align: left;
  background: none; border: none; cursor: pointer;
  padding: var(--space-5) var(--space-7);
  display: flex; align-items: baseline; gap: var(--space-5);
  transition: background 0.1s;
}
.chat-slash-item:hover, .chat-slash-item.selected {
  background: var(--color-surface);
}
.chat-slash-name {
  font-size: var(--font-size-base); font-weight: 700; color: var(--color-cta);
  flex-shrink: 0; font-family: var(--font-mono, monospace);
}
.chat-slash-desc {
  font-size: var(--font-size-sm); color: var(--color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.chat-input-wrapper {
  background: var(--color-bg);
  border-radius: var(--radius-2xl);
  padding: var(--space-5) var(--space-6);
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
  font-size: var(--font-size-base);
  line-height: 1.5;
  outline: none;
  resize: none;
  width: 100%;
  min-height: 20px;
  font-family: inherit;
}

.chat-input-textarea::placeholder {
  color: var(--color-text-muted);
  font-style: italic;
}

.chat-attachment-row {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  padding: 5px 2px;
}

.chat-attachment-card {
  position: relative;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
}

.chat-attachment-card--uploading .chat-attachment-thumb,
.chat-attachment-card--uploading .chat-attachment-file-icon {
  opacity: 0.6;
}

.chat-attachment-card--failed .chat-attachment-thumb,
.chat-attachment-card--failed .chat-attachment-file-icon {
  border-color: rgba(var(--color-error-rgb), 0.5);
}

.chat-attachment-thumb,
.chat-attachment-file-icon {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  overflow: hidden;
  cursor: pointer;
  padding: 0;
}

.chat-attachment-file-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 4px 2px;
}

.chat-attachment-file-icon-name {
  width: 100%;
  font-size: 7px;
  line-height: 1.15;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.chat-attachment-card--image .chat-attachment-thumb,
.chat-attachment-card--image .chat-attachment-file-icon {
  border-color: color-mix(in srgb, var(--color-primary) 36%, transparent);
}

.chat-attachment-card--documents .chat-attachment-thumb,
.chat-attachment-card--documents .chat-attachment-file-icon {
  border-color: color-mix(in srgb, var(--color-success) 34%, transparent);
}

.chat-attachment-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.chat-attachment-thumb--text {
  padding: 4px 5px;
  text-align: left;
}

.chat-attachment-text-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 7;
  overflow: hidden;
  font-family: var(--font-mono, monospace);
  font-size: 6px;
  line-height: 1.3;
  color: var(--color-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-attachment-thumb-badge {
  position: absolute;
  left: 3px;
  bottom: 3px;
  background: rgba(0, 0, 0, 0.72);
  color: white;
  border-radius: var(--radius-xs);
  padding: 1px var(--space-2);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.02em;
  pointer-events: none;
}

.chat-attachment-spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  pointer-events: none;
}

.chat-attachment-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  z-index: 2;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.chat-attachment-remove:hover {
  color: var(--color-text-secondary);
  background: var(--color-hover);
}

.chat-attachment-preview {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(0, 0, 0, 0.72);
}

.chat-attachment-preview-shell {
  max-width: min(92vw, 980px);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.chat-attachment-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: white;
  font-size: var(--font-size-base);
  font-weight: 700;
}

.chat-attachment-preview-header span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-attachment-preview-header button {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-attachment-preview-shell > img {
  max-width: 100%;
  max-height: calc(88vh - 48px);
  object-fit: contain;
  border-radius: var(--radius-md);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.36);
}

.chat-attachment-preview-pages {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  max-height: calc(88vh - 48px);
  padding-right: 4px;
}

.chat-attachment-preview-pages img {
  max-width: min(78vw, 760px);
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.36);
}

.chat-attachment-preview-text {
  width: min(78vw, 760px);
  max-height: calc(88vh - 48px);
  overflow-y: auto;
  margin: 0;
  padding: 16px 18px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-sm);
  line-height: 1.55;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-input-notices {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.chat-input-notice {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-4);
  color: var(--color-error);
  font-size: var(--font-size-xs);
  line-height: 1.4;
  background: rgba(var(--color-error-rgb), 0.08);
  border: 1px solid rgba(var(--color-error-rgb), 0.16);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.chat-input-notice-action {
  margin-left: auto;
  flex-shrink: 0;
  border: 1px solid rgba(var(--color-error-rgb), 0.2);
  background: transparent;
  color: var(--color-error);
  border-radius: var(--radius-sm);
  padding: 2px 7px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.chat-input-notice-action:hover {
  background: rgba(var(--color-error-rgb), 0.08);
}

.chat-file-input {
  display: none;
}

.chat-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-4);
}

.chat-input-tools-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
}

.chat-input-tools-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.chat-tool-circle {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s, transform 0.15s;
}

.chat-tool-circle:disabled {
  opacity: 0.55;
  cursor: progress;
}

.chat-tool-circle:hover:not(:disabled) {
  color: var(--color-text-secondary);
  transform: scale(1.06);
}

.chat-tool-icon {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: var(--space-2);
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.chat-tool-icon:disabled {
  opacity: 0.55;
  cursor: progress;
}

.chat-tool-icon-recording {
  color: var(--color-error) !important;
  animation: chat-mic-pulse 1.2s ease-in-out infinite;
}

@keyframes chat-mic-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.chat-record-error {
  font-size: var(--font-size-2xs);
  color: var(--color-error);
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
  gap: var(--space-3);
  min-width: 0;
  max-width: 180px;
}

.chat-workspace-label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
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
  padding: var(--space-1);
}

.chat-workspace-clear:hover {
  color: var(--color-text-secondary);
}

.chat-send-btn {
  background: var(--color-surface);
  color: var(--color-text-muted);
  width: 28px;
  height: 28px;
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
  width: 28px;
  height: 28px;
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

.chat-status-inline {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
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

/* Corpus chip */
.chat-corpus-chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(239,124,47,0.1); border: 1px solid rgba(239,124,47,0.3);
  border-radius: var(--radius-sm); padding: 3px 8px 3px 6px;
  margin-bottom: 8px; font-size: var(--font-size-sm); font-weight: 600;
  color: var(--color-primary);
}
.chat-corpus-chip-icon { font-size: var(--font-size-base); line-height: 1; }
.chat-corpus-chip-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-corpus-chip-remove {
  background: none; border: none; color: inherit; cursor: pointer;
  padding: 1px; display: flex; align-items: center; opacity: 0.7;
  border-radius: 3px;
}
.chat-corpus-chip-remove:hover { opacity: 1; }

/* Corpus dropdown */
.chat-corpus-wrap { position: relative; }
.chat-tool-icon-active { color: var(--color-primary) !important; }
.chat-corpus-dropdown {
  position: absolute; bottom: calc(100% + var(--space-4)); left: 0;
  min-width: 220px; max-width: 280px;
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: var(--radius-xl); box-shadow: 0 8px 28px rgba(0,0,0,0.18);
  overflow: hidden; z-index: 200;
  display: flex; flex-direction: column;
}
.chat-corpus-dropdown-header {
  padding: 8px 14px 6px; font-size: var(--font-size-xs); font-weight: 800;
  color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em;
  border-bottom: 1px solid var(--color-border-subtle);
}
.chat-corpus-item {
  width: 100%; text-align: left; background: none; border: none;
  padding: 9px 14px; cursor: pointer; display: flex;
  align-items: center; justify-content: space-between; gap: var(--space-4);
  font-size: var(--font-size-base); color: var(--color-text); transition: background 0.1s;
}
.chat-corpus-item:hover, .chat-corpus-item.selected { background: var(--color-surface); }
.chat-corpus-item.selected .chat-corpus-item-name { color: var(--color-primary); font-weight: 700; }
.chat-corpus-item-count { font-size: var(--font-size-xs); color: var(--color-text-muted); white-space: nowrap; }
.chat-corpus-empty { padding: var(--space-6) 14px; font-size: var(--font-size-base); color: var(--color-text-muted); }
`
