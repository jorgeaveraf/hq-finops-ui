import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { FileUpload } from '../../components/FileUpload'
import { StatusBadge } from '../../components/StatusBadge'
import { TextField } from '../../components/TextField'
import { postPart1Ingestion } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { getCurrentWeekInfo } from '../../utils/week'
import { saveRun, updateRunState } from '../../utils/runStore'

export function Part1IngestionPage() {
  const { year, week } = getCurrentWeekInfo()
  const [weekYear, setWeekYear] = useState<number | string>(year)
  const [weekNum, setWeekNum] = useState<number | string>(week)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { status, details, error: pollError, isPolling } = usePolling(runId ?? undefined, 'part1')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!notifyEmail) {
      setError('Notification email is required.')
      return
    }
    if (files.length === 0) {
      setError('Please attach at least one CSV file.')
      return
    }
    setIsSubmitting(true)
    try {
      const response = await postPart1Ingestion({
        week_year: weekYear,
        week_num: weekNum,
        notify_email: notifyEmail,
        files,
      })
      setRunId(response.dag_run_id)
      saveRun({
        dag: 'part1',
        runId: response.dag_run_id,
        startedAt: new Date().toISOString(),
        state: 'queued',
      })
      toast.success(`Run submitted: ${response.dag_run_id}`)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit run')
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (runId && status) {
      updateRunState(runId, 'part1', status)
    }
  }, [runId, status])

  const resetForm = () => {
    const { year: currentYear, week: currentWeek } = getCurrentWeekInfo()
    setWeekYear(currentYear)
    setWeekNum(currentWeek)
    setNotifyEmail('')
    setFiles([])
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase text-hq-teal">Part 1</p>
        <h1 className="text-2xl font-bold text-slate-900">Bank statement ingestion</h1>
        <p className="text-slate-600 mt-1">
          Upload weekly statements, trigger the ingestion DAG, and monitor status in real time.
        </p>
      </div>

      <Card title="Submit ingestion" description="Provide the week context and upload CSV bank statements.">
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
          <div className="md:col-span-2">
            <FileUpload
              label="CSV files"
              files={files}
              onChange={setFiles}
              description="Upload one or more CSV bank statements."
              accept=".csv,text/csv"
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Final output will be sent as attachment via email
            </div>
            <Button type="submit" disabled={isSubmitting || files.length === 0 || !notifyEmail}>
              {isSubmitting ? 'Submitting...' : 'Submit ingestion'}
            </Button>
          </div>
        </form>
      </Card>

      {runId && (
        <Card
          title="Run status"
          description="Live updates from the Airflow ingestion DAG."
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
