// ─── File helpers ─────────────────────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  sh: 'bash', bash: 'bash', py: 'python', js: 'javascript', mjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', json: 'json', yaml: 'yaml', yml: 'yaml',
  go: 'go', rs: 'rust', rb: 'ruby', java: 'java', cpp: 'cpp', c: 'c',
  css: 'css', html: 'html', xml: 'xml', toml: 'toml',
}

export function langForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'text'
}

export function isMarkdownPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'md' || ext === 'markdown'
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseSkillContent(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith('---')) return { frontmatter: '', body: raw }
  const parts = raw.split('---')
  if (parts.length < 3) return { frontmatter: '', body: raw }
  return { frontmatter: parts[1].trim(), body: parts.slice(2).join('---').trim() }
}

