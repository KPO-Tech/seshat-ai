import type { CodeToken, TokenKind } from './tokenizeCode'
import { tokenizeCodeLines } from './tokenizeCode'
import styles from './BashLine.module.css'

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

type BashLineProps = {
  code: string
  prompt?: string
  className?: string
}

export default function BashLine({ code, prompt = '$', className = '' }: BashLineProps) {
  const lines = tokenizeCodeLines(code, 'bash')

  return (
    <div className={`${styles.line} ${className}`.trim()}>
      <span className={styles.prompt}>{prompt}</span>
      <code className={styles.code}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {renderTokens(line, lineIndex)}
            {lineIndex < lines.length - 1 ? '\n' : null}
          </span>
        ))}
      </code>
    </div>
  )
}
