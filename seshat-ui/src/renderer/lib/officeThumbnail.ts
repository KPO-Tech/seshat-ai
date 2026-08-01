import JSZip from 'jszip'

// DOCX/PPTX/XLSX are all OOXML zip packages, and real Word/PowerPoint/Excel
// write a small preview image into the package at docProps/thumbnail.* (used
// by Explorer/Finder file icons) - if it's present, extracting it is a plain
// zip read, no rendering engine involved. Not guaranteed: files written by
// something other than real Office (e.g. an agent's docx_edit/excel_edit
// tool output) generally won't have one, so callers must treat a null
// result as "no thumbnail available", not an error.
const THUMBNAIL_ENTRIES = ['docProps/thumbnail.jpeg', 'docProps/thumbnail.jpg', 'docProps/thumbnail.png']

export async function extractOfficeThumbnail(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(bytes)
    for (const entryName of THUMBNAIL_ENTRIES) {
      const entry = zip.file(entryName)
      if (!entry) continue
      const blob = await entry.async('blob')
      if (blob.size === 0) continue
      return URL.createObjectURL(blob)
    }
    return null
  } catch {
    return null
  }
}
