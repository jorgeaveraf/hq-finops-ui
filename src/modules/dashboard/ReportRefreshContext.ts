import { createContext, useContext } from 'react'

export type RefreshRun = {
  runId: string
  status: string
  requestedAt?: string | null
  finishedAt?: string | null
  error?: string | null
  result?: { freshSheetCount?: number; outputSheetCount?: number } | null
}

export const refreshActive = (status: string) => status === 'queued' || status === 'running'

export type RefreshContextValue = {
  run: RefreshRun | null
  busy: boolean
  error: string | null
  startRefresh: () => Promise<boolean>
  clearError: () => void
}

export const RefreshContext = createContext<RefreshContextValue | null>(null)

export function useReportRefresh() {
  const value = useContext(RefreshContext)
  if (!value) throw new Error('ReportRefreshProvider is required')
  return value
}
