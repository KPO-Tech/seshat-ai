import { useState } from 'react'
import type { CodeToken, CodeLanguage, TokenKind } from '../../../components/code/tokenizeCode'
import { tokenizeCodeLines } from '../../../components/code/tokenizeCode'
import styles from './DocArticle.module.css'

type DocCodeBlockProps = {
  code: string
  label?: string
  language?: CodeLanguage
}

const tokenClassMap: Record<TokenKind, string> = {
  plain: styles.tokenPlain,
  command: styles.tokenCommand,
  flag: styles.tokenFlag,
  string: styles.tokenString,
  env: styles.tokenEnv,
  keyword: styles.tokenKeyword,
  identifier: styles.tokenIdentifier,
  comment: styles.tokenComment,
  number: styles.tokenNumber,
  operator: styles.tokenOperator,
  punctuation: styles.tokenPunctuation,
}

function renderTokens(tokens: CodeToken[], lineIndex: number) {
  return tokens.map((token, tokenIndex) => (
    <span key={`${lineIndex}-${tokenIndex}`} className={tokenClassMap[token.kind]}>{token.text}</span>
  ))
}

export default function DocCodeBlock({ code, label = 'Terminal', language = 'bash' }: DocCodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const lines = tokenizeCodeLines(code, language)

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLabel}>{label}</span>
        <button
          onClick={copy}
          className={`${styles.copyBtn} ${copied ? styles.copyBtnActive : ''}`}
          title="Copy"
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
      <pre className={styles.codePre}>
        <code className={styles.codeText}>
          {lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              {renderTokens(line, lineIndex)}
              {lineIndex < lines.length - 1 ? '\n' : null}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
