import { api } from '@renderer/api/client'
import type { AutomationJob, AutomationOverview, AutomationRun, AutomationStatus } from './automationTypes'

export function fetchAutomationStatus() {
  return api.get<AutomationStatus>('/automation/status')
}

export async function fetchAutomationRuns() {
  const result = await api.get<{ runs: AutomationRun[]; count: number }>('/automation/runs')
  return result.runs ?? []
}

export async function fetchAutomationJobs() {
  const result = await api.get<{ jobs: AutomationJob[]; count: number }>('/automation/jobs')
  return result.jobs ?? []
}

export function fetchAutomationOverview() {
  return api.get<AutomationOverview>('/automation/overview')
}

export function registerAutomationDevice(name?: string) {
  return api.post<AutomationStatus>('/automation/register-device', { name })
}

export function connectAutomationDevice(server_url: string, device_token: string) {
  return api.post<AutomationStatus>('/automation/connect', { server_url, device_token })
}

export function disconnectAutomationDevice() {
  return api.post('/automation/disconnect', {})
}

export function triggerAutomationJob(id: string) {
  return api.post(`/automation/jobs/${encodeURIComponent(id)}/run`, {})
}
