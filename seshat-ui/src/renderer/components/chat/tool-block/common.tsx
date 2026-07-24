import { Copy } from '@icon-park/react'
import type { CSSProperties, ReactNode } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tb-section">
      <span className="tb-section-label">{label}</span>
      {children}
    </div>
  )
}

export function CodeBox({
  content,
  variant,
  copyable,
  language,
}: {
  content: string
  variant?: 'error'
  copyable?: boolean
  // Renders with Prism syntax highlighting instead of plain monospace text
  // - used for the bash command itself, which reads far better colored
  // than as a flat grey block.
  language?: string
}) {
  return (
    <div className={`tb-code${variant ? ` tb-code--${variant}` : ''}`}>
      {language ? (
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus as any}
          customStyle={CODE_HIGHLIGHT_STYLE}
          codeTagProps={{ style: CODE_HIGHLIGHT_CODE_STYLE }}
          className="tb-code-highlight"
        >
          {content}
        </SyntaxHighlighter>
      ) : (
        <pre className="tb-pre">{content}</pre>
      )}
      {copyable && (
        <button
          className="tb-copy"
          type="button"
          title="Copy"
          onClick={() => void navigator.clipboard.writeText(content)}
        >
          <Copy size={10} />
        </button>
      )}
    </div>
  )
}

const CODE_HIGHLIGHT_STYLE: CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  fontSize: '12.5px',
  lineHeight: 1.55,
  background: 'transparent',
  maxHeight: 260,
  overflowY: 'auto',
  overflowX: 'auto',
}

// Long lines wrap instead of scrolling horizontally out of view - the
// scroll from customStyle above is a safety net for a single unbreakable
// token, not the normal case.
const CODE_HIGHLIGHT_CODE_STYLE: CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
