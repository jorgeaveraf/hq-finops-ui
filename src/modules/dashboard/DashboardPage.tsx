import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, UploadCloud, Send, Activity } from 'lucide-react'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { usePolling } from '../../hooks/usePolling'
import { loadRuns, saveRun, updateRunState } from '../../utils/runStore'
import type { RunRecord } from '../../utils/runStore'

const quickActions = [
  {
    title: 'Bank ingestion (Part 1)',
    description: 'Upload weekly statements and trigger the ingestion DAG.',
    to: '/ingest/part1',
    icon: UploadCloud,
  },
  {
    title: 'QBO export (Part 2)',
    description: 'Push cleaned transactions into QuickBooks Online.',
    to: '/ingest/part2',
    icon: Send,
  },
]

export function DashboardPage() {
  const [runs, setRuns] = useState<RunRecord[]>([])

  useEffect(() => {
    setRuns(loadRuns())
    const onStorage = () => setRuns(loadRuns())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const handleStateUpdate = (runId: string, dag: 'part1' | 'part2', state?: string) => {
    if (!state) return
    updateRunState(runId, dag, state)
    setRuns(loadRuns())
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 md:p-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-hq-teal">Finance team</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">
            Financial operations control center
          </h1>
          <p className="text-slate-600 mt-2 max-w-2xl">
            Orchestrate bank ingestion and QuickBooks exports via Airflow. Keep stakeholders informed
            with automated runs, live status, and crisp reporting.
          </p>
          <div className="mt-4 flex gap-3">
            <Button asChild>
              <Link to="/ingest/part1">Start ingestion</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/ingest/part2">Run QBO export</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-hq-teal to-emerald-400 text-white p-6 shadow-soft w-full md:w-72">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm opacity-80">System health</p>
              <p className="text-xl font-semibold">All services live</p>
            </div>
          </div>
          <p className="text-sm opacity-80 mt-3">
            Ingestion gateway is reachable and ready to accept new runs.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Card
              key={action.to}
              title={action.title}
              description={action.description}
              actions={
                <Link to={action.to} className="text-hq-teal font-semibold flex items-center gap-1">
                  Open <ArrowRight className="h-4 w-4" />
                </Link>
              }
            >
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-xl bg-hq-teal/10 text-hq-teal flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
                <Button asChild variant="secondary">
                  <Link to={action.to}>Go</Link>
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Card title="Recent runs" description="Last known activity">
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">No runs tracked yet. Trigger a Part 1 or Part 2 job.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {runs.map((run) => (
              <RunRow key={run.runId} run={run} onState={handleStateUpdate} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function RunRow({
  run,
  onState,
}: {
  run: RunRecord
  onState: (runId: string, dag: 'part1' | 'part2', state?: string) => void
}) {
  const { status } = usePolling(run.runId, run.dag)

  useEffect(() => {
    onState(run.runId, run.dag, status)
    saveRun({ ...run, state: status })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-semibold text-slate-900">
          {run.dag.toUpperCase()} · {run.runId}
        </p>
        <p className="text-xs text-slate-500">Started {new Date(run.startedAt).toLocaleString()}</p>
      </div>
      <StatusBadge status={status || run.state || 'queued'} />
    </div>
  )
}
