import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { SelectField } from '../../../components/SelectField'
import { TextField } from '../../../components/TextField'
import { createClient, describeGatewayError } from '../api/qboGatewayClient'
import type { QboEnvironment } from '../api/qboGatewayClient'

export function CreateClientPage() {
  const navigate = useNavigate()
  const [label, setLabel] = useState('')
  const [environment, setEnvironment] = useState<QboEnvironment | ''>('')
  const [extraJson, setExtraJson] = useState(JSON.stringify({ tier: '', notes: '...' }, null, 2))
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const syncExtraJsonWithEnvironment = (env: QboEnvironment | '') => {
    setExtraJson((prev) => {
      try {
        const parsed = prev.trim() ? JSON.parse(prev) : {}
        return JSON.stringify({ ...parsed, tier: env, notes: parsed.notes ?? '...' }, null, 2)
      } catch {
        return JSON.stringify({ tier: env, notes: '...' }, null, 2)
      }
    })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!label.trim()) {
      setError('Name / label is required.')
      return
    }
    if (!environment) {
      setError('Environment is required.')
      return
    }

    let parsedExtra: Record<string, unknown> | undefined
    if (extraJson.trim()) {
      try {
        parsedExtra = JSON.parse(extraJson)
      } catch {
        setError('Additional fields must be valid JSON.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const created = await createClient({
        label: label.trim(),
        environment: environment as QboEnvironment,
        extraFields: {
          ...(parsedExtra ?? {}),
          tier: environment,
          notes: (parsedExtra ?? {}).notes ?? '...',
        },
      })
      const newId =
        created.client_id ||
        (typeof (created as Record<string, unknown>).id === 'string'
          ? ((created as Record<string, unknown>).id as string)
          : null)
      if (newId) {
        navigate(`/qbo/clients/${newId}`)
      } else {
        navigate('/qbo/clients')
      }
    } catch (err) {
      setError(
        describeGatewayError(
          err,
          'Create endpoint is unavailable or returned an error. Check if POST /clients is enabled.',
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-hq-teal">Clients & Integrations</p>
          <h1 className="text-2xl font-bold text-slate-900">Create client</h1>
        </div>
        <Button asChild variant="secondary">
          <Link to="/qbo/clients">Back to list</Link>
        </Button>
      </div>

      <Card title="New client" description="Populate the basics and optional custom fields.">
        {error && <Alert title="Could not create client" description={error} variant="error" />}

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <TextField
            label="Name / label"
            placeholder="FinOps_HQ"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
          <SelectField
            label="Environment"
            value={environment}
            onChange={(e) => {
              const env = e.target.value as QboEnvironment | ''
              setEnvironment(env)
              syncExtraJsonWithEnvironment(env)
            }}
            description="Only prod or sandbox are accepted. Selecting sets tier inside Additional fields."
          >
            <option value="">Select environment</option>
            <option value="prod">prod</option>
            <option value="sandbox">sandbox</option>
          </SelectField>
          <div className="md:col-span-2 space-y-2">
            <label className="label">Additional fields (JSON)</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,30,44,0.04)] focus:border-hq-teal focus:outline-none focus:ring-2 focus:ring-hq-teal/20 transition min-h-[140px]"
              placeholder='e.g. { "tier": "prod", "notes": "..." }'
              value={extraJson}
              onChange={(e) => setExtraJson(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Payload sent as-is; we automatically include `tier` (from Environment) and `notes` so you can
              customize them.
            </p>
          </div>
          <div className="md:col-span-2 flex items-center justify-between">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create client'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
