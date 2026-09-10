import { useEffect, useId, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Copy, Check, Down } from '@icon-park/react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'
import { openInAppBrowser, shouldOpenInAppBrowser } from '@/lib/openInAppBrowser'

// Short language tags read poorly as headers ("md", "js", "py") - a small
// display-name map for the common ones, falling back to just capitalizing
// whatever Prism's own language id is for anything not listed.
const LANGUAGE_LABELS: Record<string, string> = {
  md: 'Md', markdown: 'Md',
  js: 'JS', jsx: 'JSX', ts: 'TS', tsx: 'TSX', javascript: 'JS', typescript: 'TS',
  py: 'Python', python: 'Python',
  sh: 'Bash', bash: 'Bash', shell: 'Bash', zsh: 'Bash',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
  html: 'HTML', xml: 'XML', css: 'CSS', scss: 'SCSS', less: 'LESS',
  sql: 'SQL', go: 'Go', rust: 'Rust', rs: 'Rust', java: 'Java', kotlin: 'Kotlin',
  c: 'C', cpp: 'C++', cs: 'C#', php: 'PHP', ruby: 'Ruby', rb: 'Ruby', swift: 'Swift',
  docker: 'Docker', dockerfile: 'Docker', graphql: 'GraphQL', proto: 'Protobuf',
}

function languageLabel(lang: string): string {
  return LANGUAGE_LABELS[lang.toLowerCase()] ?? (lang.charAt(0).toUpperCase() + lang.slice(1))
}

// A fenced ```lang code block - header strip (language tag, collapse
// toggle, copy button) over Prism-highlighted content, instead of a bare
// syntax-highlighted block with no way to collapse or copy it.
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="md-code">
      <div className="md-code-header">
        <button
          type="button"
          className="md-code-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <span className={`md-code-chevron${collapsed ? '' : ' md-code-chevron--open'}`}>
            <Down size={11} />
          </span>
          <span className="md-code-lang">{languageLabel(language)}</span>
        </button>
        <button type="button" className="md-code-copy" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {!collapsed && (
        <SyntaxHighlighter
          style={vscDarkPlus as any}
          language={language}
          PreTag="div"
          customStyle={CODE_BLOCK_STYLE}
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  )
}

const CODE_BLOCK_STYLE = {
  margin: 0,
  padding: '12px 14px',
  fontSize: '12.5px',
  lineHeight: 1.6,
  background: 'transparent',
  borderRadius: 0,
}

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

// Renders a ```chart fenced block (a JSON Chart.js config: {type, data,
// options}) as an interactive chart - JSON.parse can't execute code, so
// this is exactly as safe as mermaid's text-based diagram syntax: the model
// supplies a declarative spec, never arbitrary script. Chart.js is loaded
// lazily, same rationale as mermaid.
function ChartBlock({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let chartInstance: { destroy: () => void } | null = null
    setError(null)

    let config: { type?: string; data?: unknown; options?: Record<string, unknown> }
    try {
      config = JSON.parse(code)
    } catch {
      setError('Invalid chart JSON')
      return
    }
    if (!config.type || !config.data) {
      setError('Chart config needs a "type" and "data" field')
      return
    }

    import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled || !canvasRef.current) return
      const isLight = document.documentElement.getAttribute('data-theme') === 'light'
      const tickColor = isLight ? '#44403c' : '#d6d3d1'
      const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
      // The chart type/shape only exists at runtime (parsed from the
      // model's JSON output) - Chart.js's constructor overloads need a
      // statically-known `type` to pick the right config shape, which
      // doesn't apply here by design, hence the escape hatch.
      chartInstance = new Chart(canvasRef.current, {
        type: config.type,
        data: config.data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          color: tickColor,
          plugins: { legend: { labels: { color: tickColor } } },
          scales: config.type === 'pie' || config.type === 'doughnut' ? undefined : {
            x: { ticks: { color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor }, grid: { color: gridColor } },
          },
          ...config.options,
        },
      } as unknown as ConstructorParameters<typeof Chart>[1])
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render chart')
    })

    return () => {
      cancelled = true
      chartInstance?.destroy()
    }
  }, [code])

  if (error) {
    return (
      <div className="chart-block chart-block--error">
        <div className="mermaid-error-label">Chart failed to render: {error}</div>
        <pre className="mermaid-error-source">{code}</pre>
      </div>
    )
  }
  return (
    <div className="chart-block">
      <canvas ref={canvasRef} />
    </div>
  )
}

type Props = {
  children: string
  className?: string
  streaming?: boolean
  sessionId?: string
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

function normalizeMathDelimiters(text: string): string {
  const segments = text.split(/(^[ \t]*(?:`{3,}|~{3,})[\s\S]*?^[ \t]*(?:`{3,}|~{3,})[ \t]*$)/gm)
  return segments.map((segment) => {
    if (/^[ \t]*(?:`{3,}|~{3,})/.test(segment)) return segment
    return segment
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$\n${math.trim()}\n$$`)
      .replace(/\\\(([^()\n]+?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
  }).join('')
}

export function MarkdownView({ children, className, streaming = false, sessionId }: Props) {
  const content = normalizeMathDelimiters(streaming ? sealOpenFences(children) : children)

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
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            if (!inline && match && !streaming) {
              const code = String(children).replace(/\n$/, '')
              if (match[1] === 'mermaid') {
                return <MermaidBlock code={code} />
              }
              if (match[1] === 'chart') {
                return <ChartBlock code={code} />
              }
              return <CodeBlock language={match[1]} code={code} />
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
          // Plain markdown links otherwise render as a bare <a href> with no
          // target/onClick - in Electron that's a same-frame top-level
          // navigation, replacing the whole app UI with the linked page
          // instead of opening it anywhere sensible. Route through the
          // built-in browser panel instead, same as tool-result citation
          // links (WebSearchToolView.tsx).
          a({ href, children, ...props }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                {...props}
                onClick={(event) => {
                  if (!shouldOpenInAppBrowser(event, href)) return
                  event.preventDefault()
                  openInAppBrowser(href, sessionId)
                }}
              >
                {children}
              </a>
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

/* react-syntax-highlighter wraps a fenced block's whole content in its own
   <code class="language-*">, which inherits the inline-code chip styling
   above. That <code> is still display:inline (never overridden) with
   multi-line, white-space:pre content - the browser paints the inherited
   background/padding as one rounded box per visual line-fragment instead of
   one box around the whole block, reading as a chunk of pre-selected text
   rather than free text. Reset it back to plain inside our own block
   wrapper; CODE_BLOCK_STYLE already supplies the block's real
   background/padding on the container around it. */
.md-code code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

.markdown-body pre {
  margin: 16px 0;
  border-radius: 6px;
  overflow: hidden;
}

.md-code {
  margin: 16px 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e1e;
}

.md-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid var(--color-border-subtle);
}

.md-code-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
}

.md-code-toggle:hover { color: var(--color-text-secondary); }

.md-code-chevron {
  display: inline-flex;
  align-items: center;
  transition: transform 0.15s;
  transform: rotate(-90deg);
}

.md-code-chevron--open { transform: rotate(0deg); }

.md-code-lang {
  letter-spacing: 0.02em;
}

.md-code-copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  padding: 4px 9px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
}

.md-code-copy:hover {
  color: var(--color-text);
  background: var(--color-hover);
  border-color: var(--color-border);
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

.chart-block {
  margin: 16px 0;
  position: relative;
  height: 320px;
}

.chart-block--error {
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
`
