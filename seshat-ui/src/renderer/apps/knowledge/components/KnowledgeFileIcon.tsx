import { DocDetail, FileExcel, FilePdf, FileText, FileWord } from '@icon-park/react'
import { previewKind } from '../lib/preview'

export function KnowledgeFileIcon({ filename }: { filename: string }) {
  switch (previewKind(filename)) {
    case 'pdf':
      return <FilePdf size={14} />
    case 'docx':
      return <FileWord size={14} />
    case 'xlsx':
      return <FileExcel size={14} />
    case 'pptx':
      return <DocDetail size={14} />
    default:
      return <FileText size={14} />
  }
}
