import type { CorpusFile, IngestionJob } from '@/api/types'

export function formatDate(ts?: number): string {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function isJobActive(job: IngestionJob): boolean {
  return job.status === 'pending' || job.status === 'running'
}

export function isFileReady(file: CorpusFile): boolean {
  return file.status === 'ingested' || file.status === 'completed'
}
