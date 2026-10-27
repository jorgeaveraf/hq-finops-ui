import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { X } from 'lucide-react'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FilterDropdown } from '../../../components/FilterDropdown'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { TextField } from '../../../components/TextField'
import { createClient, describeGatewayError } from '../api/qboGatewayClient'
import type { QboEnvironment } from '../api/qboGatewayClient'
import { formatClientGroup, toClientGroup } from '../utils'
import type { ClientListContext } from './ClientListPage'

const NEW_CLIENT = '__new__'

type FieldErrors = Partial<Record<'client' | 'clientName' | 'entityName' | 'environment' | 'extra', string>>

export function CreateClientPage() {
  const navigate = useNavigate()
  const { clients: existingEntities, isLoading: groupsLoading, error: groupsError, reloadClients } = useOutletContext<ClientListContext>()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const submissionRef = useRef<{ fingerprint: string; key: string } | null>(null)
  const [entityName, setEntityName] = useState('')
  const [clientChoice, setClientChoice] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const existingGroups = [...new Set(existingEntities.map((entity) => entity.client_group).filter((group): group is string => Boolean(group)))].sort()
  const [environment, setEnvironment] = useState<QboEnvironment | ''>('')
  const [extraJson, setExtraJson] = useState(JSON.stringify({ notes: '' }, null, 2))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const newClientGroup = toClientGroup(newClientName)

  const validateClientName = (value: string) => {
    const group = toClientGroup(value)
    if (!group || group.length > 100) return 'Enter a valid client name (up to 100 characters).'
    if (existingGroups.includes(group)) return 'This client already exists. Select it from the list instead.'
    return undefined
  }

  const validateEntityName = (value: string, clientGroup: string, selectedEnvironment: string) => {
    if (!value.trim()) return 'Enter an entity name.'
    const normalizedName = value.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()
    if (clientGroup && selectedEnvironment && existingEntities.some((entity) => entity.client_group === clientGroup
      && entity.metadata?.tier === selectedEnvironment
      && entity.name.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase() === normalizedName)) {
      return 'An entity with this name already exists under this client and environment.'
    }
    return undefined
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '') // jsdom does not implement showModal.
    titleRef.current?.focus()
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close()
      root.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    if (!groupsLoading && !groupsError && existingGroups.length === 0 && !clientChoice) setClientChoice(NEW_CLIENT)
  }, [groupsLoading, groupsError, existingGroups.length, clientChoice])

  const cancel = () => {
    if (isSubmitting) return
    navigate('/qbo/clients', { state: { restoreCreateFocus: true } })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (groupsLoading || groupsError) return

    const clientGroup = clientChoice === NEW_CLIENT ? newClientGroup : clientChoice
    const errors: FieldErrors = {}
    if (!clientChoice) errors.client = 'Select a client or create a new one.'
    if (clientChoice === NEW_CLIENT) errors.clientName = validateClientName(newClientName)
    errors.entityName = validateEntityName(entityName, clientGroup, environment)
    if (!environment) errors.environment = 'Select an environment.'

    let parsedExtra: Record<string, unknown> = {}
    if (extraJson.trim()) {
      try {
        const parsed = JSON.parse(extraJson)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Not an object')
        parsedExtra = parsed
      } catch {
        errors.extra = 'Enter a valid JSON object.'
      }
    }
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) {
      if (errors.extra) document.getElementById('advanced-options')?.setAttribute('open', '')
      requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        entityName: entityName.trim(),
        clientGroup,
        environment: environment as QboEnvironment,
        extraFields: { ...parsedExtra, tier: environment },
      }
      const fingerprint = JSON.stringify(payload)
      if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, key: crypto.randomUUID() }
      const created = await createClient(payload, submissionRef.current.key)
      navigate(created.id ? `/qbo/clients/${created.id}` : '/qbo/clients')
    } catch (err) {
      const message = describeGatewayError(err, 'The entity could not be created.')
      if ((err as { status?: number }).status === 409) setFieldErrors((current) => ({ ...current, entityName: message }))
      else setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
      <dialog
        ref={dialogRef}
        aria-labelledby="create-entity-title"
        onCancel={(event) => { event.preventDefault(); cancel() }}
        className="fixed inset-0 m-auto max-h-[min(90vh,760px)] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/55 backdrop:backdrop-blur-sm open:flex"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
          <div className="flex items-center gap-1.5">
            <h2 ref={titleRef} tabIndex={-1} id="create-entity-title" className="text-xl font-bold outline-none">Create entity</h2>
            <InfoTooltip label="About creating an entity" text="Add a QuickBooks entity under a client." />
          </div>
          <button type="button" onClick={cancel} disabled={isSubmitting} aria-label="Close create entity" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal disabled:opacity-50">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form id="create-entity-form" className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit} noValidate>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain px-5 py-6 sm:px-7">
            {groupsError && <div className="space-y-2"><Alert title="Clients unavailable" description={groupsError} variant="error" /><Button type="button" variant="secondary" size="sm" onClick={() => void reloadClients()}>Try again</Button></div>}
            {error && <Alert title="Could not create entity" description={error} variant="error" />}

            <FilterDropdown
              label="Client"
              className="hover:border-hq-teal/50 hover:bg-hq-teal/5"
              placeholder={groupsLoading ? 'Loading clients...' : 'Select a client'}
              value={clientChoice}
              onChange={(value) => { setClientChoice(value); setFieldErrors((current) => ({ ...current, client: undefined, clientName: undefined, entityName: undefined })) }}
              disabled={groupsLoading || Boolean(groupsError)}
              required
              error={fieldErrors.client}
              options={[
                ...existingGroups.map((group) => ({ value: group, label: formatClientGroup(group) })),
              ]}
              actionOption={{ value: NEW_CLIENT, label: 'Create a new client' }}
            />
            {clientChoice === NEW_CLIENT && (
              <TextField
                label="Client name"
                className="min-h-11 hover:border-hq-teal/50 hover:bg-hq-teal/5"
                value={newClientName}
                onChange={(event) => { setNewClientName(event.target.value); setFieldErrors((current) => ({ ...current, clientName: undefined, entityName: undefined })) }}
                onBlur={(event) => setFieldErrors((current) => ({ ...current,
                  clientName: validateClientName(event.target.value),
                  entityName: entityName.trim() ? validateEntityName(entityName, toClientGroup(event.target.value), environment) : current.entityName,
                }))}
                error={fieldErrors.clientName}
                aria-invalid={Boolean(fieldErrors.clientName) || undefined}
                required
              />
            )}
            <TextField
              label="Entity name"
              className="min-h-11 hover:border-hq-teal/50 hover:bg-hq-teal/5"
              value={entityName}
              onChange={(event) => { setEntityName(event.target.value); setFieldErrors((current) => ({ ...current, entityName: undefined })) }}
              onBlur={(event) => setFieldErrors((current) => ({ ...current,
                entityName: validateEntityName(event.target.value, clientChoice === NEW_CLIENT ? newClientGroup : clientChoice, environment),
              }))}
              error={fieldErrors.entityName}
              aria-invalid={Boolean(fieldErrors.entityName) || undefined}
              required
            />
            <FilterDropdown
              label="Environment"
              className="hover:border-hq-teal/50 hover:bg-hq-teal/5"
              placeholder="Select environment"
              value={environment}
              onChange={(value) => { setEnvironment(value as QboEnvironment); setFieldErrors((current) => ({ ...current,
                environment: undefined,
                entityName: entityName.trim() ? validateEntityName(entityName, clientChoice === NEW_CLIENT ? newClientGroup : clientChoice, value) : current.entityName,
              })) }}
              required
              error={fieldErrors.environment}
              options={[{ value: 'prod', label: 'Production' }, { value: 'sandbox', label: 'Sandbox' }]}
            />

            <details id="advanced-options" className="rounded-xl border border-slate-200 bg-slate-50/60 transition-colors hover:border-hq-teal/40 hover:bg-hq-teal/5 focus-within:border-hq-teal/40">
              <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:text-hq-teal focus-visible:bg-hq-teal/5 focus-visible:text-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal">Advanced options</summary>
              <div className="space-y-2 border-t border-slate-200 px-4 pb-4 pt-3">
                <label htmlFor="entity-extra" className="label">Additional fields (JSON)</label>
                <textarea
                  id="entity-extra"
                  aria-invalid={Boolean(fieldErrors.extra) || undefined}
                  className={`w-full min-h-32 rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-hq-teal focus:outline-none focus:ring-2 focus:ring-hq-teal/20 ${fieldErrors.extra ? 'border-rose-400' : 'border-slate-200'}`}
                  value={extraJson}
                  onChange={(event) => { setExtraJson(event.target.value); setFieldErrors((current) => ({ ...current, extra: undefined })) }}
                />
                {fieldErrors.extra ? <p className="text-xs text-rose-600">{fieldErrors.extra}</p> : <p className="text-xs text-slate-500">Optional metadata. Environment is saved automatically.</p>}
              </div>
            </details>
          </div>

          <div data-dialog-footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-7">
            <Button type="button" variant="secondary" onClick={cancel} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || groupsLoading || Boolean(groupsError)}>
              {isSubmitting ? 'Creating...' : 'Create entity'}
            </Button>
          </div>
        </form>
      </dialog>
  )
}
