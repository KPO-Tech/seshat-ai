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

// A single bordered card with a compact header strip (path, pattern, stat -
// whatever identifies *what* this call was about) directly attached to its
// body, instead of that same information floating as an unstyled line above
// a separately-bordered box. Used wherever a tool's "what" (a path, a
// pattern) and its "result" (a file list, matched lines) belong together as
// one visual unit - see GlobToolView/ListDirectoryToolView/GrepToolView/
// ReadToolView for the pattern. Body content that has its own border
// (CodeBox, a file-list) should pass `bare`/skip its own chrome so there's
// exactly one border around the whole card, never two nested ones.
export function HeaderCard({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="tb-hcard">
      <div className="tb-hcard-header">{header}</div>
      <div className="tb-hcard-body">{children}</div>
    </div>
  )
}

export function CodeBox({
  content,
  variant,
  copyable,
  language,
  lineNumbers,
  startingLineNumber = 1,
  bare,
}: {
  content: string
  variant?: 'error'
  copyable?: boolean
  // Renders with Prism syntax highlighting instead of plain monospace text
  // - used for the bash command itself, which reads far better colored
  // than as a flat grey block.
  language?: string
  // Only meaningful alongside `language` - a plain <pre> has no per-line
  // gutter to render. Off by default: useful for a full file (ReadToolView)
  // or long log-shaped output, noisy for a one-line bash command.
  lineNumbers?: boolean
  // Lets a partial-file read (an `offset` input) show the file's real line
  // numbers instead of always starting the gutter at 1.
  startingLineNumber?: number
  // Drops this box's own border/background - for nesting inside a
  // HeaderCard, which already supplies the one border the two together
  // should have. A standalone CodeBox never sets this.
  bare?: boolean
}) {
  return (
    <div className={`tb-code${bare ? ' tb-code--bare' : ''}${variant ? ` tb-code--${variant}` : ''}`}>
      {language ? (
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus as any}
          customStyle={CODE_HIGHLIGHT_STYLE}
          codeTagProps={{ style: CODE_HIGHLIGHT_CODE_STYLE }}
          className="tb-code-highlight"
          showLineNumbers={lineNumbers}
          startingLineNumber={startingLineNumber}
          lineNumberStyle={LINE_NUMBER_STYLE}
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
          aria-label="Copy"
          onClick={() => void navigator.clipboard.writeText(content)}
        >
          <Copy size={10} />
        </button>
      )}
    </div>
  )
}

// For tools whose result is readable prose/text (a feed of articles, a
// markdown doc, a validation report) rather than code - normal line-height
// and no monospace, so it reads like text instead of looking like a code
// dump that happens to contain sentences.
export function ProseBox({ content, copyable, bare }: { content: string; copyable?: boolean; bare?: boolean }) {
  return (
    <div className={`tb-prose${bare ? ' tb-prose--bare' : ''}`}>
      <div className="tb-prose-text">{content}</div>
      {copyable && (
        <button
          className="tb-copy"
          type="button"
          aria-label="Copy"
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
  padding: '8px 10px',
  fontSize: '11.5px',
  lineHeight: 1.5,
  background: 'transparent',
  maxHeight: 220,
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

const LINE_NUMBER_STYLE: CSSProperties = {
  minWidth: '2.5em',
  paddingRight: '1em',
  textAlign: 'right',
  color: 'var(--color-text-disabled)',
  userSelect: 'none',
}
