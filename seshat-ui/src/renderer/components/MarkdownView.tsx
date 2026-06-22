import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'

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
        remarkPlugins={streaming ? [remarkGfm] : [remarkGfm, remarkMath]}
        rehypePlugins={streaming ? [] : [rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            if (!inline && match && !streaming) {
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
  font-size: 15px;
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
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}

.markdown-body pre {
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
}

.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  border: 1px solid var(--color-border);
}

.markdown-body th, .markdown-body td {
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body th {
  background: var(--color-surface);
}

.markdown-body ul, .markdown-body ol {
  margin-bottom: 16px;
  padding-left: 20px;
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
  padding-left: 16px;
  border-left: 4px solid var(--color-accent);
  color: var(--color-text-secondary);
}
`
