import { useEffect, useId, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'

// Renders a ```mermaid fenced block as an inline diagram. mermaid is loaded
// lazily (it's a sizeable dependency) and only once a diagram actually
// appears — most conversations never use one.
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // mermaid.render needs an id unique per diagram on the page; useId() is
  // stable and collision-free but contains colons, which aren't valid in an
  // SVG element id.
  const rawId = useId()
  const idRef = useRef(`mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setSvg(null)

    import('mermaid').then(async ({ default: mermaid }) => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light'
      mermaid.initialize({
        startOnLoad: false,
        theme: isLight ? 'default' : 'dark',
        // Diagram source ultimately comes from model output, which may be
        // influenced by untrusted content (web search results, fetched
        // pages, etc.) included earlier in the conversation — keep mermaid's
        // own sanitization on rather than relaxing it for convenience.
        securityLevel: 'strict',
      })
      return mermaid.render(idRef.current, code)
    }).then(({ svg: rendered }) => {
      if (!cancelled) setSvg(rendered)
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
    })

    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <div className="mermaid-block mermaid-block--error">
        <div className="mermaid-error-label">Diagram failed to render: {error}</div>
        <pre className="mermaid-error-source">{code}</pre>
      </div>
    )
  }
  if (!svg) {
    return <div className="mermaid-block mermaid-block--loading">Rendering diagram…</div>
  }
  // svg is mermaid's own sanitized output (securityLevel: 'strict' above),
  // not raw user/model text — see the note on that setting.
  return <div className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />
}

type Props = {
  children: string
  className?: string
  streaming?: boolean
}

// Close any unclosed code fences so the markdown parser never treats the
// rest of the document as a code block mid-stream.
function sealOpenFences(text: string): string {
  const lines = text.split('\n')
  let inFence = false
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
    }
  }
  return inFence ? text + '\n```' : text
}

export function MarkdownView({ children, className, streaming = false }: Props) {
  const content = streaming ? sealOpenFences(children) : children

  return (
    <div className={`markdown-body ${className || ''}`}>
      <style>{MARKDOWN_CSS}</style>
      <ReactMarkdown
        // KaTeX and Prism re-parse their whole input on every render; while
        // streaming, `content` changes on every token, which would mean
        // re-running both on every single chunk. Both are skipped here and
        // only applied once the message is complete (final non-streaming
        // render), trading a plain-text flash for smooth token-by-token
        // rendering during the stream itself.
        remarkPlugins={streaming ? [remarkGfm] : [remarkGfm, remarkMath]}
        rehypePlugins={streaming ? [] : [rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            if (!inline && match && !streaming) {
              if (match[1] === 'mermaid') {
                return <MermaidBlock code={String(children).replace(/\n$/, '')} />
              }
              return (
                <SyntaxHighlighter
                  style={vscDarkPlus as any}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              )
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
          table({ children }) {
            return (
              <div style={{ overflowX: 'auto', margin: '16px 0' }}>
                <table>{children}</table>
              </div>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

const MARKDOWN_CSS = `
.markdown-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}

.markdown-body p {
  margin: 0 0 12px;
}

.markdown-body p:last-child {
  margin-bottom: 0;
}

.markdown-body code {
  background: var(--color-surface);
  padding: 2px 3px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}

.markdown-body pre {
  margin: 16px 0;
  border-radius: 6px;
  overflow: hidden;
}

.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  border: 1px solid var(--color-border);
}

.markdown-body th, .markdown-body td {
  border: 1px solid var(--color-border);
  padding: 6px 8px;
  text-align: left;
}

.markdown-body th {
  background: var(--color-surface);
}

.markdown-body ul, .markdown-body ol {
  margin-bottom: 16px;
  padding-left: 14px;
}

.markdown-body li {
  margin-bottom: 4px;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3 {
  margin: 24px 0 12px;
  font-weight: 600;
  color: var(--color-text);
}

.markdown-body blockquote {
  margin: 16px 0;
  padding-left: 11px;
  border-left: 4px solid var(--color-accent);
  color: var(--color-text-secondary);
}

.mermaid-block {
  margin: 16px 0;
  display: flex;
  justify-content: center;
  overflow-x: auto;
}

.mermaid-block svg {
  max-width: 100%;
}

.mermaid-block--loading {
  padding: 16px;
  font-size: 12px;
  color: var(--color-text-muted);
  justify-content: flex-start;
}

.mermaid-block--error {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.mermaid-error-label {
  font-size: 12px;
  color: var(--color-error, #C96B5C);
}

.mermaid-error-source {
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background: var(--color-surface);
  font-size: 12px;
  overflow-x: auto;
}
`
