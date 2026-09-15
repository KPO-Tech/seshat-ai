import { api } from '@renderer/api/client'
import type { Corpus, DoclingConfig, EmbedderConfig, RerankerConfig, StorageStatus, TestResult } from './knowledgeTypes'

export type KnowledgeSnapshot = {
  corpora: Corpus[]
  embedder: EmbedderConfig | null
  reranker: RerankerConfig | null
  docling: DoclingConfig | null
  storage: StorageStatus | null
}

export async function fetchKnowledgeSnapshot(): Promise<KnowledgeSnapshot> {
  const [corporaData, embedder, reranker, docling, storage] = await Promise.all([
    api.get<{ corpora: Corpus[]; count: number }>('/corpora').catch(() => ({ corpora: [], count: 0 })),
    api.get<EmbedderConfig>('/settings/embedder').catch(() => null),
    api.get<RerankerConfig>('/settings/reranker').catch(() => null),
    api.get<DoclingConfig>('/settings/docling').catch(() => null),
    api.get<StorageStatus>('/settings/storage').catch(() => null)
  ])

  return {
    corpora: corporaData?.corpora ?? [],
    embedder,
    reranker,
    docling,
    storage
  }
}

export function saveEmbedderConfig(config: {
  provider: string
  base_url: string
  model: string
  enabled: boolean
  api_key?: string
}) {
  return api.put<EmbedderConfig>('/settings/embedder', config)
}

export function testEmbedderConfig(config: {
  provider: string
  base_url: string
  model: string
  api_key?: string
}) {
  return api.post<TestResult>('/settings/embedder/test', config)
}

export function detectEmbedderModels(config: { provider: string; base_url: string }) {
  return api.post<{ embedding_models: string[]; error?: string }>('/settings/embedder/detect-models', config)
}

export function saveRerankerConfig(config: {
  base_url: string
  model: string
  enabled: boolean
  api_key?: string
}) {
  return api.put<RerankerConfig>('/settings/reranker', config)
}

export function testRerankerConfig(config: {
  base_url: string
  model: string
  api_key?: string
}) {
  return api.post<TestResult>('/settings/reranker/test', config)
}

export function detectRerankerModel(config: { base_url: string }) {
  return api.post<{ model: string; error: string | null }>('/settings/reranker/detect-model', config)
}

export function saveDoclingConfig(config: { base_url: string; enabled: boolean }) {
  return api.put<DoclingConfig>('/settings/docling', config)
}

export function testDoclingConfig(config: { base_url: string }) {
  return api.post<TestResult>('/settings/docling/test', config)
}
