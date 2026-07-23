import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Corpus = components['schemas']['Corpus']
export type CorpusInput = components['schemas']['CorpusInput']
export type CorpusUpdateInput = components['schemas']['CorpusUpdateInput']
export type CorpusFile = components['schemas']['CorpusFile']
export type IngestionJob = components['schemas']['IngestionJob']
export type SearchResponse = components['schemas']['SearchResponse']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const CORPORA_KEY = 'corpora'
const FILES_KEY = 'corpus-files'
const JOBS_KEY = 'ingestion-jobs'

export function useCorporaList(organizationId: string | undefined, params: ListParams) {
  return useQuery({
    queryKey: [CORPORA_KEY, organizationId, params],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/knowledge/corpora', {
        params: { query: { organization_id: organizationId, ...params } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCorpus(corpusId: string | undefined) {
  return useQuery({
    queryKey: [CORPORA_KEY, 'detail', corpusId],
    enabled: Boolean(corpusId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/knowledge/corpora/{corpusID}', {
        params: { path: { corpusID: corpusId! } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useCreateCorpus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CorpusInput) => {
      const { data, error } = await api.POST('/api/v1/knowledge/corpora', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CORPORA_KEY] }),
  })
}

export function useUpdateCorpus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CorpusUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/knowledge/corpora/{corpusID}', {
        params: { path: { corpusID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [CORPORA_KEY] })
      queryClient.invalidateQueries({ queryKey: [CORPORA_KEY, 'detail', variables.id] })
    },
  })
}

export function useDeleteCorpus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/knowledge/corpora/{corpusID}', {
        params: { path: { corpusID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CORPORA_KEY] }),
  })
}

export function useCorpusFiles(corpusId: string | undefined) {
  return useQuery({
    queryKey: [FILES_KEY, corpusId],
    enabled: Boolean(corpusId),
    refetchInterval: 3000, // ingestion runs in the background - poll for status changes
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/knowledge/corpora/{corpusID}/files', {
        params: { path: { corpusID: corpusId! } },
      })
      if (error) throw error
      return data.files ?? []
    },
  })
}

export function useUploadCorpusFile(corpusId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const { data, error } = await api.POST('/api/v1/knowledge/corpora/{corpusID}/files', {
        params: { path: { corpusID: corpusId } },
        // The generated type wants a JSON-shaped { file: string } body, but
        // this is multipart/form-data - openapi-fetch's default serializer
        // passes a FormData body through as-is (no JSON.stringify, no
        // Content-Type override, so the browser sets the multipart
        // boundary itself). The cast is only to satisfy the mismatch
        // between the OpenAPI multipart schema and openapi-fetch's typed
        // JSON-body assumption; the runtime value is real FormData.
        body: formData as unknown as { file: string },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FILES_KEY, corpusId] })
      queryClient.invalidateQueries({ queryKey: [CORPORA_KEY, 'detail', corpusId] })
    },
  })
}

export function useDetachCorpusFile(corpusId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await api.DELETE('/api/v1/knowledge/corpora/{corpusID}/files/{fileID}', {
        params: { path: { corpusID: corpusId, fileID: fileId } },
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FILES_KEY, corpusId] })
      queryClient.invalidateQueries({ queryKey: [CORPORA_KEY, 'detail', corpusId] })
    },
  })
}

export function useIngestionJobs(corpusId: string | undefined) {
  return useQuery({
    queryKey: [JOBS_KEY, corpusId],
    enabled: Boolean(corpusId),
    refetchInterval: 3000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/knowledge/corpora/{corpusID}/ingestion-jobs', {
        params: { path: { corpusID: corpusId! } },
      })
      if (error) throw error
      return data.ingestion_jobs ?? []
    },
  })
}

export function useRetryIngestionJob(corpusId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await api.POST('/api/v1/knowledge/corpora/{corpusID}/ingestion-jobs/{jobID}/retry', {
        params: { path: { corpusID: corpusId, jobID: jobId } },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [JOBS_KEY, corpusId] }),
  })
}

export function useSearchCorpus(corpusId: string) {
  return useMutation({
    mutationFn: async ({ query, topK }: { query: string; topK?: number }) => {
      const { data, error } = await api.POST('/api/v1/knowledge/corpora/{corpusID}/search', {
        params: { path: { corpusID: corpusId } },
        body: { query, top_k: topK },
      })
      if (error) throw error
      return data
    },
  })
}
