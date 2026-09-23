// Pasting a wall of text into the composer (a log, a long doc, a transcript)
// almost never means "put this in my message" - it means "here's context for
// the model to read." Past this length it attaches as a .txt file instead of
// filling the textarea, matching Claude.ai/ChatGPT. Short pastes (a
// paragraph, a code snippet) still insert normally.
export const PASTE_AS_FILE_THRESHOLD = 2000

export function nextPastedTextFilename(existing: { filename: string }[]): string {
  const base = 'Pasted text'
  const used = new Set(existing.map((file) => file.filename))
  if (!used.has(`${base}.txt`)) return `${base}.txt`
  let n = 2
  while (used.has(`${base} ${n}.txt`)) n++
  return `${base} ${n}.txt`
}
