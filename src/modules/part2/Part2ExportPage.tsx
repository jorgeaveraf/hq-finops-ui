import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { FileUpload } from '../../components/FileUpload'
import { SelectField } from '../../components/SelectField'
import { StatusBadge } from '../../components/StatusBadge'
import { TextField } from '../../components/TextField'
import { postPart2Ingestion } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { getCurrentWeekInfo } from '../../utils/week'
import { saveRun, updateRunState } from '../../utils/runStore'

export function Part2ExportPage() {
  const { year, week } = getCurrentWeekInfo()
  const [weekYear, setWeekYear] = useState<number | string>(year)
  const [weekNum, setWeekNum] = useState<number | string>(week)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [source, setSource] = useState<'warehouse' | 'samples'>('warehouse')
  const [files, setFiles] = useState<File[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { status, details, error: pollError, isPolling } = usePolling(runId ?? undefined, 'part2')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!notifyEmail) {
      setError('Notification email is required.')
      return
    }
    if (source === 'samples' && files.length === 0) {
      setError('Samples source requires at least one CSV file.')
      return
    }
    setIsSubmitting(true)
    try {
      const response = await postPart2Ingestion({
        week_year: weekYear,
        week_num: weekNum,
        notify_email: notifyEmail,
        source,
        files: source === 'samples' ? files : undefined,
      })
      setRunId(response.dag_run_id)
      saveRun({
        dag: 'part2',
        runId: response.dag_run_id,
        startedAt: new Date().toISOString(),
        state: 'queued',
      })
      toast.success(`Export run submitted: ${response.dag_run_id}`)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit run')
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (runId && status) {
      updateRunState(runId, 'part2', status)
    }
  }, [runId, status])

  const resetForm = () => {
    const { year: currentYear, week: currentWeek } = getCurrentWeekInfo()
    setWeekYear(currentYear)
    setWeekNum(currentWeek)
    setNotifyEmail('')
    setSource('warehouse')
    setFiles([])
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase text-hq-teal">Part 2</p>
        <h1 className="text-2xl font-bold text-slate-900">QBO export</h1>
        <p className="text-slate-600 mt-1">
          Configure export parameters and monitor the QBO export DAG with live polling.
        </p>
      </div>

      <Card title="Submit export" description="Select source and optional sample files for the export run.">
        {error && <Alert title="Validation" description={error} variant="warning" />}
        <form className="grid md:grid-cols-2 gap-4 mt-4" onSubmit={handleSubmit}>
          <TextField
            label="Week year"
            type="number"
            value={weekYear}
            onChange={(e) => setWeekYear(Number(e.target.value))}
            min={2020}
          />
          <TextField
            label="Week number"
            type="number"
            min={1}
            max={53}
            value={weekNum}
            onChange={(e) => setWeekNum(Number(e.target.value))}
          />
          <TextField
            label="Notify email"
            type="email"
            required
            value={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.value)}
            description="We will notify this address when the DAG finishes."
          />
          <SelectField
            label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value as 'warehouse' | 'samples')}
            description="Use warehouse for live data or samples to test with CSV uploads."
          >
            <option value="warehouse">Warehouse (no CSV required)</option>
            <option value="samples">Samples (upload CSVs)</option>
          </SelectField>

          <div className="md:col-span-2">
            <FileUpload
              label="Sample CSV files"
              files={files}
              onChange={setFiles}
              description="Only required when using the samples source."
              accept=".csv,text/csv"
              hidden={source !== 'samples'}
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Source selected:{' '}
              <span className="font-semibold text-slate-800">
                {source === 'warehouse' ? 'Warehouse (live data)' : 'Samples folder with CSVs'}
              </span>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || !notifyEmail || (source === 'samples' && files.length === 0)}
            >
              {isSubmitting ? 'Submitting...' : 'Submit export'}
            </Button>
          </div>
        </form>
      </Card>

      {runId && (
        <Card
          title="Run status"
          description="Live updates from the QBO export DAG."
          actions={<StatusBadge status={status || 'queued'} />}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Run ID:</span>
              <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs">{runId}</code>
              <span className="px-2 py-1 rounded-full bg-slate-100 text-xs">
                {isPolling ? 'Polling every 5s' : 'Polling stopped'}
              </span>
            </div>
            {pollError && <Alert title="Polling error" description={pollError} variant="error" />}
            {details?.outputs && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900 mb-2">Outputs</p>
                <OutputList outputs={details.outputs} />
              </div>
            )}
          </div>
        </Card>
      )}
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
