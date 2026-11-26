import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import toast from 'react-hot-toast'
import { apiRequest } from '../../api/finopsApi'
import { RefreshContext, refreshActive, type RefreshRun } from './ReportRefreshContext'

export function ReportRefreshProvider({ enabled, children }: PropsWithChildren<{ enabled: boolean }>) {
  const [run, setRun] = useState<RefreshRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const observedActive = useRef<string | null>(null)
  const notified = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) { setRun(null); setError(null); observedActive.current = null; return }
    let mounted = true
    const check = async () => {
      try {
        const latest = await apiRequest<RefreshRun | { runId: null; status: 'idle' }>('/reports/aging/refresh/current')
        if (!mounted) return
        if (latest.runId) setRun(latest as RefreshRun)
        else setRun((previous) => previous && refreshActive(previous.status) ? previous : null)
        setError(null)
      } catch {
        if (mounted) setError('Could not check the report refresh status. The export may still be running.')
      }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 30_000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [enabled])

  useEffect(() => {
    if (!run) return
    if (refreshActive(run.status)) { observedActive.current = run.runId; return }
    if (observedActive.current !== run.runId || notified.current === run.runId) return
    notified.current = run.runId
    if (run.status === 'passed') toast.success('AP / AR aging refreshed successfully.')
    else toast.error(run.status === 'timed_out' ? 'AP / AR aging result could not be confirmed.' : 'AP / AR aging refresh did not complete successfully.')
  }, [run])

  const startRefresh = async () => {
    setBusy(true)
    setError(null)
    try {
      const started = await apiRequest<RefreshRun>('/reports/aging/refresh', { method: 'POST' })
      observedActive.current = started.runId
      setRun(started)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not request the refresh.')
      try {
        const current = await apiRequest<RefreshRun | { runId: null; status: 'idle' }>('/reports/aging/refresh/current')
        if (current.runId) setRun(current as RefreshRun)
      } catch { /* Keep the original request error; a status check may also be unavailable. */ }
      return false
    } finally {
      setBusy(false)
    }
  }

  return <RefreshContext.Provider value={{ run, busy, error, startRefresh, clearError: () => setError(null) }}>{children}</RefreshContext.Provider>
}
