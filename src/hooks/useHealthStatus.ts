import { useEffect, useRef, useState } from 'react'
import { getHealth } from '../api/client'

type HealthState = 'unknown' | 'healthy' | 'unreachable'

export function useHealthStatus(intervalMs = 60000) {
  const [status, setStatus] = useState<HealthState>('unknown')
  const [message, setMessage] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const check = async () => {
    try {
      const res = await getHealth()
      const ok = typeof res?.status === 'string' ? res.status.toLowerCase() === 'ok' : true
      setStatus(ok ? 'healthy' : 'unreachable')
      setMessage(res?.message ?? null)
    } catch (err) {
      setStatus('unreachable')
      setMessage(err instanceof Error ? err.message : 'Unable to reach health endpoint')
    } finally {
      setLastChecked(new Date())
    }
  }

  useEffect(() => {
    check()
    timerRef.current = setInterval(check, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs])

  return { status, message, lastChecked, refresh: check }
}
