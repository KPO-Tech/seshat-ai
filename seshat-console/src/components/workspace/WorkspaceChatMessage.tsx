import { Typography } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, DatabaseOutlined, FileSearchOutlined, GlobalOutlined, LoadingOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { WorkspaceChatMessage as WorkspaceChatMessageModel, WorkspaceTraceStep } from '@/features/workspaceChat/types'

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

function getRoleLabel(role: WorkspaceChatMessageModel['role']) {
  switch (role) {
    case 'assistant':
      return 'Assistant'
    case 'system':
      return 'System'
    default:
      return 'You'
  }
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function toolIcon(toolName: string | undefined) {
  switch (toolName) {
    case 'web_search':
      return <GlobalOutlined />
    case 'rag_search':
    case 'rag_ingest':
      return <DatabaseOutlined />
    case 'read_document_url':
      return <FileSearchOutlined />
    default:
      return <DatabaseOutlined />
  }
}

function TraceStepRow({ step }: { step: WorkspaceTraceStep }) {
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

  return (
    <div className="workspace-trace-step">
      <span className="workspace-trace-step__icon">{isRunning ? <LoadingOutlined /> : toolIcon(step.toolName)}</span>
      <div className="workspace-trace-step__body">
        <div className="workspace-trace-step__header">
          <span className="workspace-trace-step__text">{step.query || step.summary || step.toolName}</span>
          {step.webSearch && resultCount > 0 ? (
            <span className="workspace-trace-step__count">{resultCount} results</span>
          ) : null}
        </div>
        {step.webSearch && step.webSearch.results && step.webSearch.results.length > 0 ? (
          <div className="workspace-trace-results">
            {step.webSearch.results.slice(0, 6).map((result, index) => {
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
      </div>
    </div>
  )
}

export function WorkspaceChatMessage({ message }: { message: WorkspaceChatMessageModel }) {
  const content = sealOpenFences(message.content)
  const role = getRoleLabel(message.role)
  const timeLabel = formatMessageTime(message.createdAt)
  const showEyebrow = message.role !== 'user'
  const trace = message.trace ?? []
  const showDoneMarker = trace.length > 0 && (message.content.length > 0 || message.status !== 'draft')

  return (
    <article className={`workspace-thread-message workspace-thread-message--${message.role}`}>
      <div className="workspace-thread-message__surface">
        {showEyebrow ? (
          <div className="workspace-thread-message__eyebrow">
            <Typography.Text type="secondary">
              {role}
              {timeLabel ? ` · ${timeLabel}` : ''}
            </Typography.Text>
          </div>
        ) : null}

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
                <span className="workspace-trace-step__text">Done</span>
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
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : null}
      </div>
    </article>
  )
}
