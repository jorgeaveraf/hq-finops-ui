import { useEffect, useRef, useState } from 'react'
import { getRunStatus } from '../api/client'
import type { PollResponse, RunState } from '../api/types'

const TERMINAL_STATES: RunState[] = ['success', 'failed']

export function usePolling(runId?: string, dag?: 'part1' | 'part2', intervalMs = 5000) {
  const [status, setStatus] = useState<RunState>('idle')
  const [details, setDetails] = useState<PollResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsPolling(false)
  }

  const poll = async () => {
    if (!runId || !dag) return
    try {
      const response = await getRunStatus(runId, dag)
      setDetails(response)
      setStatus(response.state)
      if (TERMINAL_STATES.includes(response.state)) {
        stop()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to poll status')
      stop()
    }
  }

  const start = () => {
    if (!runId || !dag) return
    stop()
    setIsPolling(true)
    poll()
    timerRef.current = setInterval(poll, intervalMs)
  }

  useEffect(() => {
    if (runId && dag) {
      start()
    }
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, dag])

  return {
    status,
    details,
    error,
    isPolling,
    start,
    stop,
  }
}
