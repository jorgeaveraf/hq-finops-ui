import type { RunState } from '../api/types'

export type RunRecord = {
  dag: 'part1' | 'part2'
  runId: string
  startedAt: string
  state?: RunState
}

const KEY = 'hq_runs_history'
const MAX = 5

export function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RunRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRun(run: RunRecord) {
  const current = loadRuns().filter((r) => r.runId !== run.runId)
  const next = [run, ...current]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function updateRunState(runId: string, _dag: 'part1' | 'part2', state: RunState) {
  const current = loadRuns()
  const updated = current
    .map((r) => (r.runId === runId ? { ...r, state } : r))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  localStorage.setItem(KEY, JSON.stringify(updated))
}
