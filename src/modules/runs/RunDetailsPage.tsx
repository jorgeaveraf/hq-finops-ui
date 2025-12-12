import { useParams } from 'react-router-dom'
import { Card } from '../../components/Card'
import { StatusBadge } from '../../components/StatusBadge'
import { Alert } from '../../components/Alert'
import { usePolling } from '../../hooks/usePolling'

export function RunDetailsPage() {
  const { dag, runId } = useParams<{ dag: 'part1' | 'part2'; runId: string }>()
  const { status, details, error } = usePolling(runId, dag)

  if (!dag || !runId) {
    return <Alert title="Missing parameters" description="Run ID or DAG is not provided." variant="warning" />
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase text-hq-teal">Run details</p>
        <h1 className="text-2xl font-bold text-slate-900">
          {dag.toUpperCase()} · {runId}
        </h1>
      </div>

      <Card title="Live status" actions={<StatusBadge status={status} />}>
        {error && <Alert title="Polling error" description={error} variant="error" />}
        <div className="text-sm text-slate-700 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">Run state:</span>
            <span>{status}</span>
          </div>
          {details?.outputs && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900 mb-2">Outputs</p>
              <OutputList outputs={details.outputs} />
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function OutputList({ outputs }: { outputs: Record<string, string> | string[] }) {
  if (Array.isArray(outputs)) {
    return (
      <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
        {outputs.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-2 text-sm text-slate-700">
      {Object.entries(outputs).map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{key}:</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  )
}
