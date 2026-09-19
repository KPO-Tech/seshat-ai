import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react'
import { cx, ATTACHMENT_THUMB_CSS, attachmentBorderClass, NOTICE_CSS, TOOL_ICON_CSS } from './chatInputStyles'
import { Plus, FolderClose, AtSign, Voice, Send, CheckCorrect, LoadingOne, Browser, SettingTwo } from '@icon-park/react'
import { AttachmentTypeIcon } from '@renderer/components/AttachmentTypeIcon'
import { api, ApiError } from '@renderer/api/client'
import type { Corpus } from '@renderer/api/types'
import { startWavRecording, type WavRecording } from '@renderer/lib/wavRecorder'
import { SelectorPill, SelectorMenu, type SelectorOption } from '@renderer/components/ui/SelectorPill'
import { WindowCloseIcon } from '@renderer/components/ui/WindowControlIcon'
import { useUIStore } from '@renderer/stores/ui'

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
  showInlineStatus?: boolean
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
  modelIcon?: ReactNode
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
  showInlineStatus = true,
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
  modelIcon,
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
  const showProviderSelector = Boolean(hasProviderMenu || onProviderClick || providerLabel !== 'Provider')
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
    <div className="relative rounded-[18px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-bg))] px-3.5 pb-2.5 pt-3 shadow-[0_14px_34px_rgba(31,27,23,0.09)] transition-[border-color,box-shadow] duration-[180ms] ease-in-out focus-within:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border-subtle))] focus-within:shadow-[0_18px_42px_rgba(31,27,23,0.12),0_0_0_2px_color-mix(in_srgb,var(--color-primary)_14%,transparent)]">
      {showSlash && filtered.length > 0 && (
        <div className="absolute inset-x-0 bottom-[calc(100%+8px)] z-[200] max-h-[280px] overflow-y-auto overflow-x-hidden rounded-[10px] border border-[var(--color-border)] bg-app-bg shadow-[0_8px_32px_rgba(0,0,0,0.18)]" ref={dropdownRef}>
          {filtered.map((sk, i) => (
            <button
              key={sk.Name}
              className={cx(
                'flex w-full cursor-pointer items-baseline gap-2.5 border-0 bg-none px-3 py-[9px] text-left transition-colors duration-100',
                i === slashIdx && 'bg-app-surface',
              )}
              onMouseDown={e => { e.preventDefault(); selectSkill(sk) }}
              onMouseEnter={() => setSlashIdx(i)}
            >
              <span className="shrink-0 font-mono text-[13px] font-bold text-[var(--color-cta)]">/{sk.Name}</span>
              {sk.Description && <span className="truncate text-[12px] text-app-text-muted">{sk.Description}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Corpus chip */}
      {selectedCorpus && onCorpusChange && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-[7px] border border-[rgba(239,124,47,0.3)] bg-[rgba(239,124,47,0.1)] py-[3px] pl-1.5 pr-2 text-[12px] font-semibold text-[var(--color-primary)]">
          <span className="text-[13px] leading-none">@</span>
          <span className="max-w-[200px] truncate">{selectedCorpus.name}</span>
          <button
            className="flex items-center rounded-[3px] border-0 bg-none p-px text-inherit opacity-70 hover:opacity-100"
            onMouseDown={e => { e.preventDefault(); onCorpusChange(null) }}
            aria-label="Remove knowledge base"
          >
            <WindowCloseIcon />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2.5 flex flex-nowrap gap-2 overflow-x-auto px-0.5 py-[5px]">
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
            const category = isImage ? 'image' : file.category ?? 'other'
            const borderClass = attachmentBorderClass(category)
            const isUploading = file.upload_status === 'uploading'
            const isFailed = file.upload_status === 'failed'
            const statusClass = cx(isUploading && 'opacity-60', isFailed && 'border-[rgba(var(--color-error-rgb),0.5)]')
            return (
              <div key={file.id} className="relative size-14 shrink-0">
                {previewURL ? (
                  <button
                    type="button"
                    className={cx(ATTACHMENT_THUMB_CSS, borderClass, statusClass)}
                    onClick={() => (isImage ? openLightbox({ url: previewURL, filename: file.filename }) : setPreviewAttachment(file))}
                    aria-label={tooltip}
                  >
                    <img className="block h-full w-full object-cover" src={previewURL} alt={file.filename} />
                  </button>
                ) : textPreview ? (
                  <button
                    type="button"
                    className={cx(ATTACHMENT_THUMB_CSS, borderClass, statusClass, 'px-[5px] py-1 text-left')}
                    onClick={() => setPreviewAttachment(file)}
                  >
                    <span className="line-clamp-[7] overflow-hidden whitespace-pre-wrap break-words font-mono text-[6px] leading-[1.3] text-app-text-muted">{textPreview}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={cx(ATTACHMENT_THUMB_CSS, borderClass, statusClass, 'flex flex-col items-center justify-center gap-[3px] px-1 pb-0.5 pt-1')}
                    onClick={() => file.local_path && void window.nexus?.openPath?.(file.local_path)}
                  >
                    <span className="w-full truncate text-center text-[7px] leading-[1.15] text-app-text-muted">{file.filename}</span>
                    <AttachmentTypeIcon filename={file.filename} size={18} />
                  </button>
                )}
                {extLabel && (
                  <span className="pointer-events-none absolute bottom-[3px] left-[3px] rounded-app-xs bg-[rgba(0,0,0,0.72)] px-1 py-px text-[8px] font-extrabold tracking-[0.02em] text-white">{extLabel}</span>
                )}
                {isUploading && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"><LoadingOne size={14} className="animate-[spin_0.9s_linear_infinite]" /></span>
                )}
                <button
                  className="absolute -right-1.5 -top-1.5 z-[2] flex size-4 items-center justify-center rounded-full border border-app-border-subtle bg-app-surface p-0 text-app-text-muted hover:bg-[var(--color-hover)] hover:text-app-text-secondary"
                  onMouseDown={e => { e.preventDefault(); onRemoveAttachment?.(file.id) }}
                  aria-label="Remove attachment"
                >
                  <WindowCloseIcon size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {previewAttachment && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(0,0,0,0.72)] p-7"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setPreviewAttachment(null)}
        >
          <div className="flex max-h-[88vh] max-w-[min(92vw,980px)] flex-col gap-2.5" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3.5 text-[13px] font-bold text-white">
              <span className="truncate">{previewAttachment.filename}</span>
              <button
                className="flex size-[30px] items-center justify-center rounded-app-md border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.1)] text-white"
                type="button"
                onClick={() => setPreviewAttachment(null)}
                aria-label="Close preview"
              >
                <WindowCloseIcon size={14} />
              </button>
            </div>
            {previewAttachment.page_preview_urls?.length ? (
              <div className="flex max-h-[calc(88vh-48px)] flex-col gap-3.5 overflow-y-auto pr-1">
                {previewAttachment.page_preview_urls.map((url, index) => (
                  <img
                    key={`${previewAttachment.id}-page-${index}`}
                    className="h-auto w-full max-w-[min(78vw,760px)] rounded-app-md shadow-[0_18px_60px_rgba(0,0,0,0.36)]"
                    src={url}
                    alt={`${previewAttachment.filename} page ${index + 1}`}
                  />
                ))}
              </div>
            ) : (previewAttachment.preview_url ?? attachmentPreviewURLs[previewAttachment.id] ?? filePathToURL(previewAttachment.local_path)) ? (
              <img
                className="max-h-[calc(88vh-48px)] max-w-full rounded-app-md object-contain shadow-[0_18px_60px_rgba(0,0,0,0.36)]"
                src={previewAttachment.preview_url ?? attachmentPreviewURLs[previewAttachment.id] ?? filePathToURL(previewAttachment.local_path) ?? undefined}
                alt={previewAttachment.filename}
              />
            ) : textPreviews[previewAttachment.id] ? (
              <pre className="m-0 max-h-[calc(88vh-48px)] w-[min(78vw,760px)] overflow-y-auto whitespace-pre-wrap break-words rounded-app-md border border-app-border-subtle bg-app-surface px-[18px] py-4 font-mono text-[12px] leading-[1.55] text-app-text">{textPreviews[previewAttachment.id]}</pre>
            ) : null}
          </div>
        </div>
      )}

      {(attachmentError || modelError || recordError) && (
        <div className="mb-2 flex flex-col gap-1" aria-live="polite">
          {attachmentError && <div className={NOTICE_CSS}>{attachmentError}</div>}
          {recordError && <div className={NOTICE_CSS}>{recordError}</div>}
          {modelError && (
            <div className={NOTICE_CSS}>
              <span>{modelError}</span>
              {onModelRetry && (
                <button
                  type="button"
                  className="ml-auto shrink-0 cursor-pointer rounded-app-sm border border-[rgba(var(--color-error-rgb),0.2)] bg-transparent px-[7px] py-0.5 font-bold text-app-error [font-family:inherit] [font-size:inherit] [line-height:inherit] hover:bg-[rgba(var(--color-error-rgb),0.08)]"
                  onClick={onModelRetry}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="min-h-5 w-full resize-none border-0 bg-transparent text-[13px] leading-[1.55] text-app-text outline-none [font-family:inherit] placeholder:text-app-text-muted"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        rows={1}
      />

      <div className="mt-2.5 flex items-center justify-between gap-2.5" ref={selectorsRef}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            className="flex size-7 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-app-text-muted transition-[color,transform] duration-150 hover:bg-[var(--color-hover)] hover:text-app-text-secondary disabled:cursor-progress disabled:opacity-55"
            type="button"
            aria-label="Attach files"
            disabled={isUploadingAttachments}
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={18} />
          </button>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            multiple
            onChange={e => {
              const files = e.currentTarget.files
              if (files && files.length > 0) void onAttachFiles?.(files)
              e.currentTarget.value = ''
            }}
          />
          <div className="flex min-w-0 max-w-[180px] items-center gap-1">
            <button
              className={cx(TOOL_ICON_CSS, projectPath && '!text-[var(--color-primary)]')}
              aria-label={projectPath ? `Project: ${projectPath}` : 'Set project folder'}
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
                <span className="truncate text-[12px] text-app-text-secondary" title={projectPath}>{projectLabel}</span>
                <button
                  className="flex items-center border-0 bg-transparent p-0.5 text-app-text-muted hover:text-app-text-secondary"
                  aria-label="Clear project folder"
                  onMouseDown={(e) => { e.preventDefault(); onProjectChange?.('') }}
                >
                  <WindowCloseIcon />
                </button>
              </>
            )}
          </div>
          <div className="relative" ref={corpusDropdownRef}>
            <button
              className={cx(TOOL_ICON_CSS, selectedCorpusId && '!text-[var(--color-primary)]')}
              aria-label="Attach knowledge base"
              onClick={() => setCorpusDropdownOpen(v => !v)}
            >
              <AtSign size={13} />
            </button>
            {corpusDropdownOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 z-[200] flex max-w-[280px] min-w-[220px] flex-col overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-app-bg shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                <div className="border-b border-app-border-subtle px-3.5 pb-1.5 pt-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-app-text-muted">Knowledge bases</div>
                {corpora.length === 0 ? (
                  <div className="p-3.5 text-[13px] text-app-text-muted">No knowledge bases found</div>
                ) : corpora.map(c => {
                  const selected = c.id === selectedCorpusId
                  return (
                    <button
                      key={c.id}
                      className={cx(
                        'flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-none px-3.5 py-[9px] text-left text-[13px] text-app-text transition-colors duration-100 hover:bg-app-surface',
                        selected && 'bg-app-surface',
                      )}
                      onMouseDown={e => {
                        e.preventDefault()
                        onCorpusChange?.(c.id === selectedCorpusId ? null : c.id)
                        setCorpusDropdownOpen(false)
                      }}
                    >
                      <span className={cx(selected && 'font-bold text-[var(--color-primary)]')}>{c.name}</span>
                      {c.chunk_count > 0 && <span className="whitespace-nowrap text-[11px] text-app-text-muted">{c.chunk_count} chunks</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="relative min-w-0 max-w-[min(240px,32vw)]">
            <SelectorPill
              label={modelLabel}
              icon={modelIcon ?? (hasModelMenu ? <CheckCorrect size={12} /> : <SettingTwo size={12} />)}
              onClick={handleModelTrigger}
              disabled={modelDisabled}
              className="h-7 max-w-full rounded-lg bg-[color-mix(in_srgb,var(--color-surface)_74%,var(--color-bg))] px-[9px] py-0 hover:border-[color-mix(in_srgb,var(--color-primary)_24%,var(--color-border-subtle))] hover:bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-primary)_5%)]"
            />
            {openSelector === 'model' && modelOptions && onModelSelect && (
              <SelectorMenu
                placement="up"
                className="min-w-[330px]"
                options={modelOptions}
                selectedId={selectedModelId}
                onSelect={(id) => {
                  setOpenSelector(null)
                  onModelSelect(id)
                }}
              />
            )}
          </div>
          {showInlineStatus && isStreaming && (
            <div className="flex min-w-0 max-w-[320px] items-center gap-[7px] text-[12px] text-app-text-secondary" aria-live="polite">
              <LoadingOne size={14} className="animate-[spin_0.9s_linear_infinite]" />
              <span className="truncate">{statusText || 'Running...'}</span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {showProviderSelector && (
            <div className="relative">
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
          )}
          <button
            className={cx(
              'flex h-7 w-6 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-app-text-muted transition-colors duration-150 hover:text-app-text-secondary disabled:cursor-progress disabled:opacity-55',
              recordingState === 'recording' && '![animation:pulse-opacity_1.2s_ease-in-out_infinite] !text-app-error',
            )}
            type="button"
            aria-label={
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
              ? <LoadingOne size={13} className="animate-[spin_0.9s_linear_infinite]" />
              : <Voice size={13} />}
          </button>
          {isStreaming ? (
            <button
              className="flex size-[30px] items-center justify-center rounded-[9px] border border-[var(--color-primary-hover)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary-hover)]"
              onClick={onStop}
              type="button"
              aria-label="Stop"
            >
              <WindowCloseIcon size={14} />
            </button>
          ) : (
            <button
              className={cx(
                'flex size-[30px] items-center justify-center rounded-[9px] border-0 transition-all duration-200',
                canSend
                  ? 'cursor-pointer bg-[var(--color-primary)] text-white hover:-translate-y-px hover:bg-[var(--color-primary-hover)]'
                  : 'cursor-not-allowed bg-[color-mix(in_srgb,var(--color-surface)_82%,var(--color-bg))] text-app-text-muted',
              )}
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
