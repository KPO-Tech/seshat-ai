import { FileWord, FileExcel, FilePpt, FilePdfOne, FileTextOne as FileGeneric } from '@icon-park/react'

// Shown in place of a real thumbnail/text preview when neither is available
// (no page image, no embedded OOXML thumbnail - see lib/officeThumbnail.ts,
// not every DOCX/PPTX/XLSX has one - no text extraction) - a per-extension
// icon reads as "this is a file" instead of an empty/blank tile or a
// low-signal wall of tiny illegible text.
export function AttachmentTypeIcon({ filename, size = 20 }: { filename: string; size?: number }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'docx':
    case 'doc':
      return <FileWord size={size} />
    case 'xlsx':
    case 'xls':
    case 'csv':
      return <FileExcel size={size} />
    case 'pptx':
    case 'ppt':
      return <FilePpt size={size} />
    case 'pdf':
      return <FilePdfOne size={size} />
    default:
      return <FileGeneric size={size} />
  }
}
