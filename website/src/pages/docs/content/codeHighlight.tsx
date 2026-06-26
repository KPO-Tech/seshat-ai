import type { ReactNode } from 'react'
import styles from './DocArticle.module.css'

export type CodeLanguage = 'bash' | 'go' | 'python' | 'js' | 'ts' | 'text'

type Token = {
  text: string
  className: string
}

type Rule = {
  pattern: RegExp
  className: string
}

const GO_RULES: Rule[] = [
  { pattern: /^\/\/.*$/, className: styles.tokenComment },
  { pattern: /^"(?:[^"\\]|\\.)*"/, className: styles.tokenString },
  { pattern: /^`[^`]*`/, className: styles.tokenString },
  { pattern: /^(?:package|import|func|return|type|struct|interface|var|const|if|else|for|range|switch|case|default|defer|go|select|map|chan|break|continue)\b/, className: styles.tokenKeyword },
  { pattern: /^(?:context|sdk|log|main|nil|err|client|resp)\b/, className: styles.tokenIdentifier },
  { pattern: /^\d+/, className: styles.tokenNumber },
  { pattern: /^[{}()[\].,:]/, className: styles.tokenPunctuation },
  { pattern: /^(?::=|==|!=|<=|>=|=|\+|\-|\*|\/)/, className: styles.tokenOperator },
]

const SCRIPT_RULES: Rule[] = [
  { pattern: /^#.*$/, className: styles.tokenComment },
  { pattern: /^"(?:[^"\\]|\\.)*"/, className: styles.tokenString },
  { pattern: /^'(?:[^'\\]|\\.)*'/, className: styles.tokenString },
  { pattern: /^\$[A-Za-z_][A-Za-z0-9_]*/, className: styles.tokenEnv },
  { pattern: /^(?:export|cd|go|npm|npx|node|python|python3|pip|pip3|uv|curl|bash|ollama|seshat|jupyter)\b/, className: styles.tokenCommand },
  { pattern: /^--?[A-Za-z0-9:-]+/, className: styles.tokenFlag },
  { pattern: /^\d+/, className: styles.tokenNumber },
  { pattern: /^(?:\|\||&&|\|)/, className: styles.tokenOperator },
]

function pushPlain(tokens: Token[], text: string) {
  if (!text) return
  tokens.push({ text, className: styles.tokenPlain })
}

function tokenizeScriptLine(line: string): Token[] {
  if (line.trim() === '') return [{ text: '', className: styles.tokenPlain }]
  if (line.trimStart().startsWith('#')) return [{ text: line, className: styles.tokenComment }]

  const tokens: Token[] = []
  const pieces = line.split(/(\s+|\|\||&&|\|)/).filter(piece => piece.length > 0)
  let commandAllowed = true

  for (const piece of pieces) {
    if (/^\s+$/.test(piece)) {
      pushPlain(tokens, piece)
      continue
    }

    if (piece === '||' || piece === '&&' || piece === '|') {
      tokens.push({ text: piece, className: styles.tokenOperator })
      commandAllowed = true
      continue
    }

    const assignment = piece.match(/^([A-Z_][A-Z0-9_]*)(=)(.*)$/)
    if (assignment) {
      tokens.push({ text: assignment[1], className: styles.tokenEnv })
      tokens.push({ text: assignment[2], className: styles.tokenOperator })
      tokens.push({ text: assignment[3], className: assignment[3].startsWith('"') || assignment[3].startsWith("'") ? styles.tokenString : styles.tokenPlain })
      commandAllowed = false
      continue
    }

    if (commandAllowed && /^[A-Za-z0-9_.:/-]+$/.test(piece)) {
      tokens.push({ text: piece, className: styles.tokenCommand })
      commandAllowed = false
      continue
    }

    let matched = false
    for (const rule of SCRIPT_RULES) {
      const match = piece.match(rule.pattern)
      if (match && match.index === 0 && match[0].length === piece.length) {
        tokens.push({ text: piece, className: rule.className })
        matched = true
        break
      }
    }

    if (!matched) {
      tokens.push({ text: piece, className: styles.tokenPlain })
    }
  }

  return tokens
}

function tokenizeByRules(line: string, rules: Rule[]): Token[] {
  if (line === '') return [{ text: '', className: styles.tokenPlain }]

  const tokens: Token[] = []
  let rest = line

  while (rest.length > 0) {
    const ws = rest.match(/^\s+/)
    if (ws) {
      pushPlain(tokens, ws[0])
      rest = rest.slice(ws[0].length)
      continue
    }

    let matched = false
    for (const rule of rules) {
      const match = rest.match(rule.pattern)
      if (match && match.index === 0) {
        tokens.push({ text: match[0], className: rule.className })
        rest = rest.slice(match[0].length)
        matched = true
        break
      }
    }

    if (!matched) {
      tokens.push({ text: rest[0], className: styles.tokenPlain })
      rest = rest.slice(1)
    }
  }

  return tokens
}

function lineTokens(line: string, language: CodeLanguage): Token[] {
  switch (language) {
    case 'bash':
      return tokenizeScriptLine(line)
    case 'go':
      return tokenizeByRules(line, GO_RULES)
    case 'python':
    case 'js':
    case 'ts':
      return tokenizeByRules(line, SCRIPT_RULES)
    default:
      return [{ text: line, className: styles.tokenPlain }]
  }
}

export function renderHighlightedCode(code: string, language: CodeLanguage): ReactNode {
  const lines = code.split('\n')

  return lines.map((line, lineIndex) => (
    <span key={`${language}-${lineIndex}`}>
      {lineTokens(line, language).map((token, tokenIndex) => (
        <span key={`${lineIndex}-${tokenIndex}`} className={token.className}>{token.text}</span>
      ))}
      {lineIndex < lines.length - 1 ? '\n' : null}
    </span>
  ))
}
