import JSZip from 'jszip'

// DOCX/PPTX/XLSX are all OOXML zip packages, and real Word/PowerPoint/Excel
// write a small preview image into the package at docProps/thumbnail.* (used
// by Explorer/Finder file icons) - if it's present, extracting it is a plain
// zip read, no rendering engine involved. Not guaranteed: files written by
// something other than real Office (e.g. an agent's docx_edit/excel_edit
// tool output) generally won't have one, so callers must treat a null
// result as "no thumbnail available", not an error.
const THUMBNAIL_ENTRIES: Array<{ path: string; mime: string }> = [
  { path: 'docProps/thumbnail.jpeg', mime: 'image/jpeg' },
  { path: 'docProps/thumbnail.jpg', mime: 'image/jpeg' },
  { path: 'docProps/thumbnail.png', mime: 'image/png' },
]

// Returns a data: URL (not a blob: object URL) - callers may create several
// of these in short succession (once optimistically at attach time, again
// after upload completes) and a data: URL needs no explicit revocation to
// avoid leaking memory, unlike URL.createObjectURL.
export async function extractOfficeThumbnail(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(bytes)
    for (const { path, mime } of THUMBNAIL_ENTRIES) {
      const entry = zip.file(path)
      if (!entry) continue
      const base64 = await entry.async('base64')
      if (!base64) continue
      return `data:${mime};base64,${base64}`
    }
    return null
  } catch {
    return null
  }
}
