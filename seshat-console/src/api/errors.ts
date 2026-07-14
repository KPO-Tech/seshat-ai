import type { components } from '@/api/schema'

type ApiError = components['schemas']['Error']

/** Extracts the server's error message, falling back to a generic one. */
export function getErrorMessage(error: unknown): string {
  const apiError = error as ApiError | undefined
  return apiError?.error?.message ?? 'Something went wrong. Please try again.'
}
