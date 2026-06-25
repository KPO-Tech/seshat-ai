export type CodeLanguage = 'bash' | 'go' | 'python' | 'js' | 'ts' | 'text'
export type TokenKind =
  | 'plain'
  | 'command'
  | 'flag'
  | 'string'
  | 'env'
  | 'keyword'
  | 'identifier'
  | 'comment'
  | 'number'
  | 'operator'
  | 'punctuation'

export type CodeToken = {
  text: string
  kind: TokenKind
}

type Rule = {
  pattern: RegExp
  kind: TokenKind
}

const GO_RULES: Rule[] = [
  { pattern: /^\/\/.*$/, kind: 'comment' },
  { pattern: /^"(?:[^"\\]|\\.)*"/, kind: 'string' },
  { pattern: /^`[^`]*`/, kind: 'string' },
  { pattern: /^(?:package|import|func|return|type|struct|interface|var|const|if|else|for|range|switch|case|default|defer|go|select|map|chan|break|continue)\b/, kind: 'keyword' },
  { pattern: /^(?:context|sdk|log|main|nil|err|client|resp)\b/, kind: 'identifier' },
  { pattern: /^\d+/, kind: 'number' },
  { pattern: /^[{}()[\].,:]/, kind: 'punctuation' },
  { pattern: /^(?::=|==|!=|<=|>=|=|\+|\-|\*|\/)/, kind: 'operator' },
]

const SCRIPT_RULES: Rule[] = [
  { pattern: /^#.*$/, kind: 'comment' },
  { pattern: /^"(?:[^"\\]|\\.)*"/, kind: 'string' },
  { pattern: /^'(?:[^'\\]|\\.)*'/, kind: 'string' },
  { pattern: /^\$[A-Za-z_][A-Za-z0-9_]*/, kind: 'env' },
  { pattern: /^(?:export|cd|go|npm|npx|node|python|python3|pip|pip3|uv|curl|bash|ollama|seshat|jupyter)\b/, kind: 'command' },
  { pattern: /^--?[A-Za-z0-9:-]+/, kind: 'flag' },
  { pattern: /^\d+/, kind: 'number' },
  { pattern: /^(?:\|\||&&|\|)/, kind: 'operator' },
]

function pushPlain(tokens: CodeToken[], text: string) {
  if (!text) return
  tokens.push({ text, kind: 'plain' })
}

function tokenizeScriptLine(line: string): CodeToken[] {
  if (line.trim() === '') return [{ text: '', kind: 'plain' }]
  if (line.trimStart().startsWith('#')) return [{ text: line, kind: 'comment' }]

  const tokens: CodeToken[] = []
  const pieces = line.split(/(\s+|\|\||&&|\|)/).filter(piece => piece.length > 0)
  let commandAllowed = true

  for (const piece of pieces) {
    if (/^\s+$/.test(piece)) {
      pushPlain(tokens, piece)
      continue
    }

    if (piece === '||' || piece === '&&' || piece === '|') {
      tokens.push({ text: piece, kind: 'operator' })
      commandAllowed = true
      continue
    }

    const assignment = piece.match(/^([A-Z_][A-Z0-9_]*)(=)(.*)$/)
    if (assignment) {
      tokens.push({ text: assignment[1], kind: 'env' })
      tokens.push({ text: assignment[2], kind: 'operator' })
      tokens.push({ text: assignment[3], kind: assignment[3].startsWith('"') || assignment[3].startsWith("'") ? 'string' : 'plain' })
      commandAllowed = false
      continue
    }

    if (commandAllowed && /^[A-Za-z0-9_.:/-]+$/.test(piece)) {
      tokens.push({ text: piece, kind: 'command' })
      commandAllowed = false
      continue
    }

    let matched = false
    for (const rule of SCRIPT_RULES) {
      const match = piece.match(rule.pattern)
      if (match && match.index === 0 && match[0].length === piece.length) {
        tokens.push({ text: piece, kind: rule.kind })
        matched = true
        break
      }
    }

    if (!matched) {
      tokens.push({ text: piece, kind: 'plain' })
    }
  }

  return tokens
}

function tokenizeByRules(line: string, rules: Rule[]): CodeToken[] {
  if (line === '') return [{ text: '', kind: 'plain' }]

  const tokens: CodeToken[] = []
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
        tokens.push({ text: match[0], kind: rule.kind })
        rest = rest.slice(match[0].length)
        matched = true
        break
      }
    }

    if (!matched) {
      tokens.push({ text: rest[0], kind: 'plain' })
      rest = rest.slice(1)
    }
  }

  return tokens
}

function lineTokens(line: string, language: CodeLanguage): CodeToken[] {
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
      return [{ text: line, kind: 'plain' }]
  }
}

export function tokenizeCodeLines(code: string, language: CodeLanguage): CodeToken[][] {
  return code.split('\n').map(line => lineTokens(line, language))
}
