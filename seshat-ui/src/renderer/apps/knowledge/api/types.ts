import type { CorpusFile, IngestionJob } from '@/api/types'

export type TaggedSearchResult = {
  key: string
  text: string
  score: number
  metadata?: Record<string, string>
  corpus_id: string
  corpus_name: string
}

export type KnowledgeSearchResponse = {
  results: TaggedSearchResult[]
  corpora_searched: number
}

export type CorpusDetail = {
  files: CorpusFile[]
  jobs: IngestionJob[]
  loading: boolean
  error: string | null
}

export type KnowledgeView = 'search' | 'collections' | 'chat'

export type KnowledgePreviewKind =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'markdown'
  | 'csv'
  | 'text'
  | 'image'
  | 'audio'
  | 'unsupported'
