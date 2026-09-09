export type AnswerPart = { type: 'text'; text: string } | { type: 'citation'; n: number }

export function splitCitations(text: string): AnswerPart[] {
  if (!text) return []
  const parts: AnswerPart[] = []
  const re = /\[(\d+)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    parts.push({ type: 'citation', n: Number(match[1]) })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', text: text.slice(lastIndex) })
  return parts
}
