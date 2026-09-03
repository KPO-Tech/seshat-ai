import { memo, useState } from 'react'
import { Typography, Tooltip } from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FolderOutlined,
  GlobalOutlined,
  LoadingOutlined,
  RightOutlined,
  RobotOutlined,
  SearchOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { WorkspaceChatMessage as WorkspaceChatMessageModel, WorkspaceTraceStep } from '@/features/workspaceChat/types'
import { palette } from '@/theme/tokens'

function getDomain(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function sealOpenFences(text: string): string {
  const lines = text.split('\n')
  let inFence = false
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
    }
  }
  return inFence ? `${text}\n\`\`\`` : text
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Category-based, not per-literal-tool-name: an org's MCP servers can add
// arbitrary "mcp__<server>__<tool>" names at runtime (see
// ConnectorsPage.tsx/MCPServersPage.tsx's registry), so anything not
// explicitly known below still gets a sensible icon instead of falling
// through to one generic default for every unrecognized tool.
function toolIcon(toolName: string | undefined) {
  const name = toolName ?? ''
  switch (name) {
    case 'web_search':
      return <GlobalOutlined />
    case 'rag_search':
    case 'rag_ingest':
      return <DatabaseOutlined />
    case 'read_document_url':
      return <FileSearchOutlined />
    case 'bash':
      return <CodeOutlined />
  }
  if (name.startsWith('mcp__')) return <ApiOutlined />
  if (name.startsWith('read') || name === 'glob' || name === 'grep') return <FileTextOutlined />
  if (name.startsWith('write') || name.startsWith('edit') || name.startsWith('patch')) return <EditOutlined />
  if (name.includes('search')) return <SearchOutlined />
  if (name.includes('list') || name.includes('directory')) return <FolderOutlined />
  return <ToolOutlined />
}

// Human label for a tool, favoring the query it ran (web_search, rag_search)
// over its raw wire name - "mcp__slack__send_message" reads as "slack →
// send message", every other tool name has its underscores/casing cleaned
// up ("read_document_url" → "Read document url").
function toolLabel(step: WorkspaceTraceStep): string {
  if (step.query) return step.query
  const name = step.toolName ?? 'tool'
  if (name.startsWith('mcp__')) {
    const parts = name.split('__')
    if (parts.length >= 3) return `${parts[1]} → ${humanizeToolName(parts.slice(2).join('_'))}`
  }
  return humanizeToolName(name)
}

function humanizeToolName(name: string) {
  const spaced = name.replace(/_/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatDuration(ms: number | undefined) {
  if (!ms || ms <= 0) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function CopyIconButton({ content, className }: { content: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
      <button
        type="button"
        className={className}
        onClick={(e) => {
          e.stopPropagation()
          navigator.clipboard.writeText(content)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? <CheckOutlined /> : <CopyOutlined />}
      </button>
    </Tooltip>
  )
}

function prettyPrintInput(input: Record<string, unknown> | undefined): string | null {
  if (!input || Object.keys(input).length === 0) return null
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return null
  }
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const language = className ? className.replace(/language-/, '') : ''
  const codeContent = String(children).replace(/\n$/, '')

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        margin: '16px 0',
        borderRadius: 10,
        background: palette.surfaceElevated,
        border: `1px solid ${palette.border}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          background: palette.surface,
          borderBottom: `1px solid ${palette.borderSubtle}`,
          fontSize: 12,
          color: palette.inkTertiary,
        }}
      >
        <span style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {language || 'code'}
        </span>
        <Tooltip title={copied ? 'Copied!' : 'Copy snippet'}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? palette.success : palette.inkTertiary,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            {copied ? <CheckOutlined /> : <CopyOutlined />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </Tooltip>
      </div>
      <div style={{ padding: '14px 16px', overflowX: 'auto' }}>
        <code style={{ background: 'transparent', border: 'none', padding: 0, color: palette.ink }} className={className}>
          {children}
        </code>
      </div>
    </div>
  )
}

function TraceStepRow({ step }: { step: WorkspaceTraceStep }) {
  const failed = step.status === 'failed'
  const [open, setOpen] = useState(failed)

  if (step.kind === 'thinking') {
    if (!step.content) return null
    return (
      <div className="workspace-trace-step">
        <span className="workspace-trace-step__icon">
          <ClockCircleOutlined />
        </span>
        <span className="workspace-trace-step__text">{step.content}</span>
      </div>
    )
  }

  const isRunning = step.status === 'pending' || step.status === 'running'
  const resultCount = step.webSearch?.count ?? 0
  const hasWebSearchResults = Boolean(step.webSearch?.results?.length)
  const inputJSON = prettyPrintInput(step.input)
  // A tool denied before it ever ran (permission/hook/policy) carries no
  // "content" at all server-side, only a human-readable Message - falling
  // back to summary here is the only way that denial reason ever reaches
  // the user, since the header line no longer echoes raw summary text the
  // way the pre-registry version of this component did.
  const resultText = step.result || (failed ? step.summary : undefined)
  const hasResult = Boolean(resultText)
  const expandable = hasWebSearchResults || Boolean(inputJSON) || hasResult
  const duration = formatDuration(step.durationMs)

  return (
    <div className={`workspace-trace-step${failed ? ' workspace-trace-step--failed' : ''}${expandable ? ' workspace-trace-step--expandable' : ''}`}>
      <span className="workspace-trace-step__icon">
        {isRunning ? <LoadingOutlined /> : failed ? <ExclamationCircleOutlined /> : toolIcon(step.toolName)}
      </span>
      <div className="workspace-trace-step__body">
        <div className="workspace-trace-step__header" onClick={() => expandable && setOpen((v) => !v)}>
          <span className="workspace-trace-step__text">{toolLabel(step)}</span>
          {failed ? <span className="workspace-trace-step__error-badge">failed</span> : null}
          {!isRunning && duration ? <span className="workspace-trace-step__duration">{duration}</span> : null}
          {step.webSearch && resultCount > 0 ? (
            <span className="workspace-trace-step__count">{resultCount} results</span>
          ) : null}
          {expandable ? (
            <RightOutlined className={`workspace-trace-step__chevron${open ? ' workspace-trace-step__chevron--open' : ''}`} />
          ) : null}
        </div>

        {open && hasWebSearchResults ? (
          <div className="workspace-trace-results">
            {step.webSearch!.results!.slice(0, 6).map((result, index) => {
              const domain = getDomain(result.url)
              return (
                <a
                  key={`${result.url}-${index}`}
                  className="workspace-trace-result"
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="workspace-trace-result__favicon">{(domain || result.title || '?').slice(0, 1).toUpperCase()}</span>
                  <span className="workspace-trace-result__title">{result.title}</span>
                  <span className="workspace-trace-result__source">{domain}</span>
                </a>
              )
            })}
          </div>
        ) : null}

        {open && (inputJSON || hasResult) ? (
          <div className="workspace-trace-body">
            {inputJSON ? (
              <div>
                <div className="workspace-trace-section__label">Arguments</div>
                <pre className="workspace-trace-pre">
                  <CopyIconButton content={inputJSON} className="workspace-trace-copy" />
                  {inputJSON}
                </pre>
              </div>
            ) : null}
            {hasResult ? (
              <div>
                <div className="workspace-trace-section__label">{failed ? 'Error' : 'Result'}</div>
                <pre className={`workspace-trace-pre${failed ? ' workspace-trace-pre--error' : ''}`}>
                  <CopyIconButton content={resultText!} className="workspace-trace-copy" />
                  {resultText}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const WorkspaceChatMessage = memo(function WorkspaceChatMessage({ message }: { message: WorkspaceChatMessageModel }) {
  const content = sealOpenFences(message.content)
  const isUser = message.role === 'user'
  const timeLabel = formatMessageTime(message.createdAt)
  const trace = message.trace ?? []
  const showDoneMarker = trace.length > 0 && (message.content.length > 0 || message.status !== 'draft')

  return (
    <article className={`workspace-thread-message workspace-thread-message--${message.role}`}>
      <div className="workspace-thread-message__surface">
        <div className="workspace-thread-message__eyebrow">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: 6,
              background: isUser ? 'rgba(30, 28, 26, 0.06)' : palette.accentSoft,
              color: isUser ? palette.inkSecondary : palette.accentHover,
              fontSize: 12,
            }}
          >
            {isUser ? <UserOutlined /> : <RobotOutlined />}
          </span>
          <Typography.Text style={{ fontWeight: 600, fontSize: 13, color: isUser ? palette.inkSecondary : palette.ink }}>
            {isUser ? 'You' : 'Seshat Assistant'}
          </Typography.Text>
          {timeLabel ? (
            <Typography.Text style={{ fontSize: 11.5, color: palette.inkTertiary }}>
              · {timeLabel}
            </Typography.Text>
          ) : null}
        </div>

        {trace.length > 0 ? (
          <div className="workspace-trace">
            {trace.map((step) => (
              <TraceStepRow key={step.id} step={step} />
            ))}
            {showDoneMarker ? (
              <div className="workspace-trace-step workspace-trace-step--done">
                <span className="workspace-trace-step__icon">
                  <CheckCircleOutlined />
                </span>
                <span className="workspace-trace-step__text">Execution completed</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {content ? (
          <div className="workspace-chat-markdown workspace-chat-markdown--message">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a({ children, href, ...props }) {
                  return (
                    <a href={href} target="_blank" rel="noreferrer" {...props}>
                      {children}
                    </a>
                  )
                },
                table({ children }) {
                  return (
                    <div className="workspace-chat-markdown__table">
                      <table>{children}</table>
                    </div>
                  )
                },
                pre({ children }) {
                  return <>{children}</>
                },
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const isInline = !match && typeof children === 'string' && !children.includes('\n')
                  if (isInline) {
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  }
                  return <CodeBlock className={className}>{children}</CodeBlock>
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : null}
      </div>
    </article>
  )
})

