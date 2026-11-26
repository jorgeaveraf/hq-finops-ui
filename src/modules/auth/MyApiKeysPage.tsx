import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Check, ChevronRight, Clock3, Copy, History, KeyRound, Plus, RotateCw, Settings2, ShieldAlert, Trash2, X } from 'lucide-react'
import { permissionName } from './accessLabels'
import { apiRequest } from '../../api/finopsApi'
import { useAuth } from './useAuth'
import { AccountNavigation } from './AccountNavigation'
import { KeyExpiryPicker, type ExpiryChoice } from './KeyExpiryPicker'
import { ConfirmDangerModal } from '../../components/ConfirmDangerModal'
import { FilterDropdown } from '../../components/FilterDropdown'
import { InfoTooltip } from '../../components/InfoTooltip'
import { EntitySelectionToolbar } from './EntitySelectionToolbar'
import type { AccessGrant } from './AuthContext'
import type { QboClient } from '../qbo/api/qboGatewayClient'

type Key = {
  id: string; owner_user_id: string; name: string; secret_suffix: string | null
  purpose?: 'qbo' | 'entities' | 'legacy_mixed'
  status: string; created_at: string; expires_at: string | null; last_used_at: string | null
  revoked_at: string | null; replaces_key_id: string | null
}
type IssuedKey = Key & { secret: string }
type Policy = { active_limit: number; active_count: number; maximum_expiration_days: number }
type KeyGrant = AccessGrant & { api_key_id: string | null }
type GrantScope = Pick<AccessGrant, 'operation' | 'client_id' | 'environment'>
type Client = QboClient
type Pending = { kind: 'rotate' | 'revoke'; key: Key } | null

const administrative = new Set(['access.manage', 'keys.admin', 'activity.read'])
const isEntityGrant = (operation: string) => operation === 'client.read' || operation === 'qbo.entity.read' || operation === 'qbo.entity.edit' || operation === 'qbo.entity.delete'
const isScopedEntityGrant = (operation: string) => isEntityGrant(operation)
const grantKey = (grant: GrantScope) => `${grant.operation}|${grant.client_id ?? ''}|${grant.environment ?? ''}`
const uniqueGrants = <T extends GrantScope>(grants: T[]): T[] => {
  const seen = new Set<string>()
  return grants.filter((grant) => {
    const key = grantKey(grant)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'Never'
const keyState = (key: Key) => key.revoked_at || key.status === 'revoked' ? 'Revoked'
  : key.expires_at && new Date(key.expires_at).getTime() <= Date.now() ? 'Expired'
    : key.status === 'suspended' ? 'Suspended'
      : key.status !== 'active' ? 'Unavailable' : 'Active'
const daysUntil = (value: string) => Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Request failed'
const keyIdentity = (key: Key) => `${key.name}${key.secret_suffix ? ` (ending ${key.secret_suffix})` : ''}`
const keyPurposeLabel = (purpose: Key['purpose']) => purpose === 'qbo' ? 'QuickBooks data' : purpose === 'entities' ? 'QBO Gateway entities' : 'Legacy mixed'
const normalizedKeyName = (value: string) => value.trim().toLowerCase()
const duplicateKeyNameMessage = 'An active API key with this name already exists'
const keyScopeLabels = (operations: string[]) => {
  const choices = new Set(operations)
  const labels: string[] = []
  if (choices.has('qbo.entity.read')) labels.push(choices.has('qbo.entity.edit') ? 'Read · Edit' : 'Read')
  else if (choices.has('client.read')) labels.push(operations.some((operation) => operation.startsWith('qbo.') && operation !== 'qbo.entity.edit') ? 'Entity details' : 'Entity details only')
  if (choices.has('qbo.entity.edit') && !choices.has('qbo.entity.read')) labels.push('Edit (legacy; no Read)')
  if (choices.has('qbo.entity.delete')) labels.push('Delete')
  return [...labels, ...operations.filter((operation) => !isEntityGrant(operation)).map(permissionName)]
}

function KeyActionsMenu({ keyName, keySuffix, disabled, onReplace, onRevoke }: {
  keyName: string; keySuffix: string | null; disabled: boolean; onReplace: () => void; onRevoke: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstActionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    firstActionRef.current?.focus()
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const choose = (action: () => void) => {
    setOpen(false)
    triggerRef.current?.focus()
    action()
  }

  return <div ref={rootRef} className={`absolute right-4 top-1/2 -translate-y-1/2 sm:right-5 ${open ? 'z-20' : 'z-10'}`}>
    <button ref={triggerRef} type="button" aria-label={`Actions for ${keyName}${keySuffix ? `, ending ${keySuffix}` : ''}`} aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={() => setOpen((current) => !current)} className="icon-first-action rounded-lg border border-slate-200 px-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Settings2 aria-hidden="true" size={16} /><span className="icon-first-label">Manage key</span></button>
    {open && <div id={menuId} className="absolute right-0 top-full mt-1.5 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" aria-label={`Actions for ${keyName}${keySuffix ? `, ending ${keySuffix}` : ''}`}>
      <button ref={firstActionRef} type="button" onClick={() => choose(onReplace)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"><RotateCw aria-hidden="true" size={16} />Replace key</button>
      <button type="button" onClick={() => choose(onRevoke)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:bg-rose-50 focus-visible:outline-none"><Trash2 aria-hidden="true" size={16} />Revoke access</button>
    </div>}
  </div>
}

export function MyApiKeysPage() {
  const { access, kind } = useAuth()
  const [keys, setKeys] = useState<Key[]>([])
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [grants, setGrants] = useState<Record<string, KeyGrant[]>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientLoadError, setClientLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedKey | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [createOpen, setCreateOpen] = useState(false)
  const createDialogRef = useRef<HTMLDialogElement>(null)
  const infoDialogRef = useRef<HTMLDialogElement>(null)
  const [infoOpen, setInfoOpen] = useState<'expiring' | 'history' | null>(null)
  const detailDialogRef = useRef<HTMLDialogElement>(null)
  const [detailKeyId, setDetailKeyId] = useState<string | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const previousInfoFocusRef = useRef<HTMLElement | null>(null)
  const previousDetailFocusRef = useRef<HTMLElement | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<'qbo' | 'entities' | null>(null)
  const [keyStep, setKeyStep] = useState<'purpose' | 'setup'>('purpose')
  const [serverNameConflict, setServerNameConflict] = useState(false)
  const [expiresOn, setExpiresOn] = useState('')
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>('never')
  const [selected, setSelected] = useState<string[]>([])
  const selectedScopeDraft = useRef<string[]>([])
  const allScopeDraft = useRef<string[] | null>(null)
  const [scopeMode, setScopeMode] = useState<'all' | 'selected'>('all')
  const [entitySearch, setEntitySearch] = useState('')
  const [showSelectedEntities, setShowSelectedEntities] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [entityFilter, setEntityFilter] = useState('')

  useEffect(() => {
    const dialog = createDialogRef.current
    if (!dialog) return
    if (createOpen || issued) {
      if (!dialog.open) {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '')
      }
      if (createOpen && !issued && keyStep === 'setup') nameRef.current?.focus()
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      setName('')
      setServerNameConflict(false)
      setExpiresOn('')
      setExpiryChoice('never')
      setPurpose(null)
      setSelected([])
      selectedScopeDraft.current = []
      allScopeDraft.current = null
      setScopeMode('all')
      setEntitySearch('')
      setShowSelectedEntities(false)
      setError(null)
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [createOpen, issued, keyStep])

  useEffect(() => {
    const dialog = infoDialogRef.current
    if (!dialog) return
    if (infoOpen && !dialog.open) {
      previousInfoFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!infoOpen && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      if (previousInfoFocusRef.current?.isConnected) previousInfoFocusRef.current.focus()
    }
  }, [infoOpen])

  useEffect(() => {
    const dialog = detailDialogRef.current
    if (!dialog) return
    if (detailKeyId && !dialog.open) {
      previousDetailFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!detailKeyId && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      if (previousDetailFocusRef.current?.isConnected) previousDetailFocusRef.current.focus()
    }
  }, [detailKeyId])

  const heldGrants = (access?.effective_grants ?? []).filter((grant) => !administrative.has(grant.operation) && grant.operation !== 'connection.connect')
  const superAdminGrants: GrantScope[] = access?.user.is_super_admin ? [
    { operation: 'qbo.entity.read', client_id: null, environment: null },
    { operation: 'qbo.entity.edit', client_id: null, environment: null },
    { operation: 'qbo.entity.delete', client_id: null, environment: null },
    { operation: 'entities.manage', client_id: null, environment: null },
  ] : []
  const impliedEntityRead: GrantScope[] = heldGrants.filter((grant) => grant.operation === 'qbo.entity.read')
    .map((grant) => ({ operation: 'client.read', client_id: grant.client_id, environment: null }))
  const sourceGrants = uniqueGrants([...heldGrants, ...impliedEntityRead, ...superAdminGrants,
    ...superAdminGrants.filter((grant) => grant.operation === 'qbo.entity.read').map((grant) => ({ operation: 'client.read', client_id: grant.client_id, environment: null }))])
  const canLoadClients = sourceGrants.some((grant) => isScopedEntityGrant(grant.operation))
  const globalEntityGrants = sourceGrants.filter((grant) => !grant.client_id && isEntityGrant(grant.operation))
  const globalQboGrants = globalEntityGrants.filter((grant) => grant.operation.startsWith('qbo.') || grant.operation.startsWith('report.'))
  const globalManageGrant = sourceGrants.find((grant) => !grant.client_id && grant.operation === 'entities.manage')
  const scopedOperations = [...new Set(sourceGrants.filter((grant) => !grant.client_id && isScopedEntityGrant(grant.operation)).map((grant) => grant.operation))]
  const derivedGrants = clients.flatMap((client) => scopedOperations.map((operation) => ({ operation, client_id: client.id, environment: null })))
  const available = uniqueGrants([...sourceGrants, ...derivedGrants])
  const hasSetupDraft = Boolean(name.trim() || expiresOn || expiryChoice !== 'never')
  const automaticQboRead = globalQboGrants.find((grant) => grant.operation === 'qbo.entity.read')
  const automaticSelection = automaticQboRead ? [grantKey(automaticQboRead)] : []
  const automaticScopeMode = automaticQboRead ? 'all' : 'selected'
  const selectionChanged = scopeMode !== automaticScopeMode || selected.length !== automaticSelection.length || selected.some((key) => !automaticSelection.includes(key))
  const createDirty = Boolean(hasSetupDraft || (globalManageGrant ? purpose || selected.length : selectionChanged))
  const closeCreate = () => {
    if (issued || busy) return
    if (createDirty) setDiscardConfirmOpen(true)
    else setCreateOpen(false)
  }
  const activeKeys = keys.filter((key) => keyState(key) === 'Active')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const nameConflict = Boolean(name.trim()) && (serverNameConflict || activeKeys.some((key) => normalizedKeyName(key.name) === normalizedKeyName(name)))
  const historicalKeys = keys.filter((key) => keyState(key) !== 'Active')
    .sort((a, b) => new Date(b.revoked_at ?? b.expires_at ?? b.created_at).getTime()
      - new Date(a.revoked_at ?? a.expires_at ?? a.created_at).getTime())
  const expiringKeys = activeKeys.filter((key) => key.expires_at && daysUntil(key.expires_at) <= 30)
  const entityName = (clientId: string) => clients.find((client) => client.id === clientId)?.name ?? `Entity ${clientId.slice(0, 8)}`
  const activeGrants = activeKeys.flatMap((key) => grants[key.id] ?? [])
  const entityOptions = [...new Set(activeGrants.map((grant) => grant.client_id).filter((id): id is string => Boolean(id)))]
    .map((id) => ({ value: id, label: entityName(id) })).sort((a, b) => a.label.localeCompare(b.label))
  if (activeGrants.some((grant) => grant.client_id === null)) entityOptions.unshift({ value: 'global', label: 'All-entity access' })
  const hasFilters = Boolean(entityFilter)
  const clearFilters = () => setEntityFilter('')
  const filteredKeys = activeKeys.filter((key) => {
    const assigned = grants[key.id] ?? []
    const scoped = !entityFilter || assigned.some((grant) =>
      entityFilter === 'global' ? grant.client_id === null : grant.client_id === entityFilter || grant.client_id === null)
    return scoped
  })
  const detailKey = keys.find((key) => key.id === detailKeyId)
  const detailGrants = detailKey ? grants[detailKey.id] ?? [] : []
  const detailGlobal = keyScopeLabels(detailGrants.filter((grant) => !grant.client_id).map((grant) => grant.operation))
  const detailEntities = new Map<string, string[]>()
  const detailConnections = new Map<string, string[]>()
  for (const grant of detailGrants) {
    if (!grant.client_id) continue
    const connection = grant.operation === 'connection.connect'
    const group = connection ? detailConnections : detailEntities
    const scope = connection ? `${grant.client_id}|${grant.environment ?? ''}` : grant.client_id
    const actions = group.get(scope) ?? []
    const label = isEntityGrant(grant.operation) ? grant.operation : permissionName(grant.operation)
    if (!actions.includes(label)) group.set(scope, [...actions, label])
  }
  const selectedKeys = new Set(selected)
  const selectedGrants = available.filter((grant) => selectedKeys.has(grantKey(grant)))
  const selectedForPurpose = selectedGrants.filter((grant) => purpose === 'qbo'
    ? grant.operation.startsWith('qbo.') || grant.operation.startsWith('report.')
    : grant.operation === 'client.read')
  const canIssuePurpose = purpose === 'qbo'
    ? selectedForPurpose.length > 0
    : purpose === 'entities' && Boolean(globalManageGrant && selectedForPurpose.some((grant) => grant.operation === 'client.read'))
  const entityChoices = [...clients].sort((a, b) => a.name.localeCompare(b.name))
    .filter((client) => client.name.toLocaleLowerCase().includes(entitySearch.trim().toLocaleLowerCase()))
  const selectedEntityActions = new Map<string, number>()
  for (const grant of selectedGrants) {
    if (grant.client_id && isScopedEntityGrant(grant.operation)) {
      selectedEntityActions.set(grant.client_id, (selectedEntityActions.get(grant.client_id) ?? 0) + 1)
    }
  }
  const selectedEntityCount = selectedEntityActions.size
  const visibleEntityChoices = entityChoices.filter((client) => !showSelectedEntities || selectedEntityActions.has(client.id)).slice(0, 50)
  const grantsByEntity = new Map<string, GrantScope[]>()
  for (const grant of available) {
    if (!grant.client_id || !isScopedEntityGrant(grant.operation)) continue
    grantsByEntity.set(grant.client_id, [...(grantsByEntity.get(grant.client_id) ?? []), grant])
  }
  const entityGrants = (clientId: string) => grantsByEntity.get(clientId) ?? []
  const allAvailableQboReads = clients.flatMap((client) => {
    const read = entityGrants(client.id).find((grant) => grant.operation === 'qbo.entity.read')
    return read ? [read] : []
  })
  const allAvailableQboEdits = clients.flatMap((client) => {
    if (!entityGrants(client.id).some((grant) => grant.operation === 'qbo.entity.read')) return []
    const edit = entityGrants(client.id).find((grant) => grant.operation === 'qbo.entity.edit')
    return edit ? [edit] : []
  })
  const allAvailableQboEditKeys = allAvailableQboEdits.map(grantKey)
  const canEditAllAvailableQbo = allAvailableQboReads.length > 0 && allAvailableQboEdits.length === allAvailableQboReads.length
  const allAvailableQboEditsSelected = allAvailableQboEditKeys.length > 0 && allAvailableQboEditKeys.every((key) => selectedKeys.has(key))
  const toggleAllAvailableQboEdits = () => setSelected((current) => allAvailableQboEditsSelected
    ? current.filter((key) => !allAvailableQboEditKeys.includes(key))
    : [...new Set([...current, ...allAvailableQboEditKeys])])
  const preferredRead = (choices: GrantScope[]) => purpose === 'qbo'
    ? choices.find((grant) => grant.operation === 'qbo.entity.read')
    : choices.find((grant) => grant.operation === 'client.read')
  const preferredEntityGrant = (choices: GrantScope[]) => preferredRead(choices)
  const selectableEntityChoices = entityChoices.filter((client) => preferredEntityGrant(entityGrants(client.id)))
  const selectedEntityIds = [...selectedEntityActions.keys()]
  const selectAllEntities = () => setSelected((current) => [...new Set([...current, ...selectableEntityChoices.map((client) => grantKey(preferredEntityGrant(entityGrants(client.id))!))])])
  const entityReadGrants = available.filter((grant) => grant.operation === 'client.read' && grant.client_id)
  const globalEntityReadGrant = available.find((grant) => grant.operation === 'client.read' && !grant.client_id && grant.environment === null)
  const entityReadByClient = new Map(entityReadGrants.map((grant) => [grant.client_id!, grant]))
  const entityReadChoices = entityChoices.flatMap((client) => {
    const grant = entityReadByClient.get(client.id)
    return grant ? [{ client, grant }] : []
  })
  const selectedEntityReadCount = globalEntityReadGrant && selectedKeys.has(grantKey(globalEntityReadGrant))
    ? entityReadGrants.length : entityReadGrants.filter((grant) => selectedKeys.has(grantKey(grant))).length
  const reviewScope = purpose === 'qbo' && scopeMode === 'all' ? globalQboGrants.length ? 'All current and future entities' : `${selectedEntityCount} current available entities`
    : purpose === 'entities' && scopeMode === 'all' && globalEntityReadGrant && selectedKeys.has(grantKey(globalEntityReadGrant)) ? 'All current and future entities'
      : `${purpose === 'entities' ? selectedEntityReadCount : selectedEntityCount} selected entities`
  const qboEntityActionSets = selectedEntityIds.map((id) => selectedForPurpose.filter((grant) => grant.client_id === id).map((grant) => grant.operation).sort().join('|'))
  const qboActionLabels = keyScopeLabels(selectedForPurpose.map((grant) => grant.operation)).join(' · ') || 'No actions selected'
  const reviewActions = purpose === 'entities' ? scopeMode === 'all' ? 'Create entities · Manage accessible entities' : 'Create entities · Manage selected entities'
    : new Set(qboEntityActionSets).size > 1 ? `${qboActionLabels} (varies by entity)` : qboActionLabels
  const reviewExpiration = expiryChoice === 'never' ? 'Until revoked' : expiresOn
    ? new Date(`${expiresOn}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Choose a date'
  const toggleEntityRead = (grant: GrantScope) => {
    setScopeMode('selected')
    const key = grantKey(grant)
    const globalKey = globalEntityReadGrant ? grantKey(globalEntityReadGrant) : null
    setSelected((current) => {
      const withoutGlobal = current.filter((value) => value !== globalKey)
      return withoutGlobal.includes(key) ? withoutGlobal.filter((value) => value !== key) : [...withoutGlobal, key]
    })
  }
  const selectAllEntityReads = () => {
    const matches = entityReadChoices.map(({ grant }) => grantKey(grant))
    setSelected((current) => [...new Set([...current, ...matches])])
  }
  const clearEntityReads = () => {
    const readKeys = new Set(entityReadGrants.map(grantKey))
    if (globalEntityReadGrant) readKeys.add(grantKey(globalEntityReadGrant))
    setSelected((current) => current.filter((key) => !readKeys.has(key)))
    setScopeMode('selected')
  }
  const clearEntitySelection = () => {
    const entityKeys = new Set(available.filter((grant) => isScopedEntityGrant(grant.operation)).map(grantKey))
    setSelected((current) => current.filter((key) => !entityKeys.has(key)))
  }
  const toggleEntity = (clientId: string) => {
    const choices = entityGrants(clientId)
    const firstAction = preferredEntityGrant(choices)
    if (!firstAction) return
    setSelected((current) => current.some((key) => choices.some((grant) => grantKey(grant) === key))
      ? current.filter((key) => !choices.some((grant) => grantKey(grant) === key))
      : [...current, grantKey(firstAction)])
  }
  const toggleAccess = (choices: GrantScope[], action: 'read' | 'edit') => {
    const readGrant = choices.find((grant) => grant.operation === 'qbo.entity.read')
    const editGrant = choices.find((grant) => grant.operation === 'qbo.entity.edit')
    const target = action === 'read' ? readGrant : editGrant
    if (!readGrant || !target) return
    setSelected((current) => {
      const values = new Set(current)
      const key = grantKey(target)
      if (values.has(key)) {
        if (action === 'read' && editGrant && values.has(grantKey(editGrant))) return current
        values.delete(key)
      } else {
        values.add(key)
        if (action !== 'read') values.add(grantKey(readGrant))
      }
      return [...values]
    })
  }
  const accessLevelControls = (choices: GrantScope[], label: string) => {
    const readGrant = choices.find((grant) => grant.operation === 'qbo.entity.read')
    const editGrant = choices.find((grant) => grant.operation === 'qbo.entity.edit')
    if (!readGrant) return <p className="text-sm text-slate-600">Entity details only — no QuickBooks data access is available from your account.</p>
    const hasRead = selectedKeys.has(grantKey(readGrant))
    const hasEdit = Boolean(editGrant && selectedKeys.has(grantKey(editGrant)))
    return <div role="group" aria-label={`${label} QBO access level`} className="grid gap-2 sm:grid-cols-2">
      <button type="button" aria-label="Read" aria-pressed={hasRead} aria-disabled={hasEdit || undefined} disabled={hasEdit} onClick={() => toggleAccess(choices, 'read')} className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold ${hasRead ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 text-slate-800 hover:border-slate-400'} disabled:cursor-default`}>Read{hasRead && hasEdit && <span className="mt-0.5 block text-xs font-normal text-slate-600">Required</span>}</button>
      {editGrant && <button type="button" aria-pressed={hasEdit} onClick={() => toggleAccess(choices, 'edit')} className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold ${hasEdit ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 text-slate-800 hover:border-slate-400'}`}>Edit</button>}
    </div>
  }
  const choosePurpose = (next: 'qbo' | 'entities') => {
    setPurpose(next)
    setShowSelectedEntities(false)
    if (next === 'qbo') {
      selectedScopeDraft.current = []
      const globalRead = globalQboGrants.find((grant) => grant.operation === 'qbo.entity.read')
      allScopeDraft.current = globalRead ? [grantKey(globalRead)] : null
      setScopeMode(globalRead ? 'all' : 'selected')
      setSelected(globalRead ? [grantKey(globalRead)] : [])
    } else {
      selectedScopeDraft.current = globalEntityReadGrant ? [] : entityReadGrants.map(grantKey)
      allScopeDraft.current = globalEntityReadGrant ? [grantKey(globalEntityReadGrant)] : entityReadGrants.map(grantKey)
      setScopeMode('all')
      setSelected(globalEntityReadGrant ? [grantKey(globalEntityReadGrant)] : entityReadGrants.map(grantKey))
    }
  }
  const resetCreate = () => {
    setName('')
    setPurpose(null)
    setKeyStep('purpose')
    setServerNameConflict(false)
    setExpiresOn('')
    setExpiryChoice('never')
    setSelected([])
    selectedScopeDraft.current = []
    allScopeDraft.current = null
    setScopeMode('all')
    setEntitySearch('')
    setShowSelectedEntities(false)
    setError(null)
  }
  const switchScope = (next: 'all' | 'selected') => {
    if (next === scopeMode) return
    const entityKeys = new Set(available.filter((grant) => isScopedEntityGrant(grant.operation)).map(grantKey))
    if (scopeMode === 'selected') selectedScopeDraft.current = selected.filter((key) => entityKeys.has(key))
    else allScopeDraft.current = selected.filter((key) => entityKeys.has(key))
    const readGrant = purpose === 'entities' ? globalEntityReadGrant : preferredRead(globalEntityGrants)
    const nextEntityKeys = next === 'selected' ? selectedScopeDraft.current
      : allScopeDraft.current ?? (readGrant ? [grantKey(readGrant)]
        : purpose === 'entities' ? entityReadGrants.map(grantKey) : allAvailableQboReads.map(grantKey))
    setSelected((current) => [...new Set([...current.filter((key) => !entityKeys.has(key)), ...nextEntityKeys])])
    setScopeMode(next)
  }

  const refresh = async () => {
    const [listed, currentPolicy] = await Promise.all([
      apiRequest<Key[]>('/access/keys'), apiRequest<Policy>('/access/keys/policy'),
    ])
    const keyGrants = await Promise.all(listed.map((key) =>
      apiRequest<KeyGrant[]>(`/access/grants?api_key_id=${key.id}`)))
    setKeys(listed)
    setPolicy(currentPolicy)
    setGrants(Object.fromEntries(listed.map((key, index) => [key.id, keyGrants[index]])))
  }

  useEffect(() => {
    if (kind !== 'google') return
    let active = true
    void refresh().catch((cause) => { if (active) setError(errorText(cause)) })
      .finally(() => { if (active) setLoading(false) })
    if (canLoadClients) {
      setClientsLoading(true)
      setClientLoadError(false)
      void apiRequest<Client[]>('/clients').then((value) => { if (active) { setClients(value); setClientLoadError(false) } })
        .catch(() => { if (active) { setClients([]); setClientLoadError(true) } })
        .finally(() => { if (active) setClientsLoading(false) })
    } else {
      setClients([])
      setClientsLoading(false)
    }
    return () => { active = false }
  // Initial session identity determines which owner's records are loaded.
  }, [kind, access?.user.id, canLoadClients])

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null)
    try { await work() } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  const copyIssuedKey = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.secret)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const create = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) { setError('Name this key before continuing.'); return }
    if (nameConflict) { setServerNameConflict(true); nameRef.current?.focus(); return }
    if (!selected.length) { setError('Choose at least one entity or permission.'); return }
    if (expiryChoice === 'custom' && !expiresOn) { setError('Choose an expiration date.'); return }
    void run(async () => {
      if (!purpose) { setError('Choose a key purpose.'); return }
      const selectedGrants = available.filter((grant) => selected.includes(grantKey(grant)) && (purpose === 'qbo'
        ? grant.operation.startsWith('qbo.') || grant.operation.startsWith('report.')
        : grant.operation === 'client.read'))
        .map(({ operation, client_id, environment }) => ({ operation, client_id, environment }))
      let result: IssuedKey
      try {
        result = await apiRequest<IssuedKey>('/access/keys', {
          method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ name: name.trim(), purpose, expires_at: expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null, grants: selectedGrants }),
        })
      } catch (cause) {
        if (cause instanceof Error && 'status' in cause && cause.status === 409 && cause.message === duplicateKeyNameMessage) {
          setServerNameConflict(true)
          nameRef.current?.focus()
          return
        }
        if (cause instanceof Error && 'status' in cause && typeof cause.status === 'number' && cause.status < 500) throw cause
        throw new Error(`Could not confirm issuance. Check your key list before trying again. ${errorText(cause)}`)
      }
      setCopyState('idle')
      setIssued(result)
      setCreateOpen(false)
      setPurpose(null)
      await refresh()
      setEntityFilter('')
      setNotice('API key created.')
    })
  }

  const confirmPending = () => {
    if (!pending) return
    const { key, kind: action } = pending
    setPending(null)
    void run(async () => {
      if (action === 'revoke') {
        await apiRequest(`/access/keys/${key.id}/revoke`, { method: 'POST' })
        await refresh()
        setNotice('Key revoked. Requests using it are now rejected.')
        return
      }
      let result: IssuedKey
      try {
        result = await apiRequest<IssuedKey>(`/access/keys/${key.id}/rotate`, {
          method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ name: key.name, expires_at: null }),
        })
      } catch (cause) {
        throw new Error(`Could not confirm rotation. Check your key list before trying again. ${errorText(cause)}`)
      }
      setCopyState('idle')
      setIssued(result)
      await refresh()
      setNotice('Replacement key created. The previous key no longer works; update the connected tool now.')
    })
  }

  if (kind !== 'google') return <p className="text-sm text-slate-700">Sign in with an approved Google account to manage your keys.</p>
  return <div className="access-view mx-auto max-w-6xl space-y-5">
    <AccountNavigation />
    {error && !createOpen && !issued && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && !issued && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!loading && !available.length && <p className="text-sm text-slate-600">You need entity or QuickBooks permissions to create a key. Ask an administrator to review your access.</p>}
    {policy && policy.active_count >= policy.active_limit && <p className="text-sm text-amber-800">{policy.active_limit}-key limit reached. Replace an existing key or revoke one you no longer use.</p>}
    <section aria-label="API keys" className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="sr-only">Your API keys</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{policy && <span className="text-sm font-medium text-slate-700">{policy.active_count} of {policy.active_limit} active</span>}{expiringKeys.length > 0 && <button type="button" onClick={() => setInfoOpen('expiring')} className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-amber-800 underline decoration-amber-400 underline-offset-4 hover:text-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"><Clock3 aria-hidden="true" size={16} />{expiringKeys.length} {expiringKeys.length === 1 ? 'key expires' : 'keys expire'} within 30 days</button>}</div>
        <button type="button" aria-label="Create API key" disabled={loading || busy || !sourceGrants.length || !!policy && policy.active_count >= policy.active_limit} onClick={() => { resetCreate(); if (!globalManageGrant) { choosePurpose('qbo'); setKeyStep('setup') } setCreateOpen(true) }} className="icon-first-action ml-auto rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Plus aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Create API key</span></button>
      </div>
      {!loading && activeKeys.length > 1 && <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm" aria-label="Filter API keys">
        <div>
          <FilterDropdown label="Entity" placeholder="All entities" value={entityFilter} options={[{ value: '', label: 'Any entity' }, ...entityOptions]} onChange={setEntityFilter} />
        </div>
        {hasFilters && <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600"><span role="status">{filteredKeys.length} of {activeKeys.length} keys shown</span><button type="button" onClick={clearFilters} className="icon-first-action rounded-md px-2 py-1 font-medium text-hq-teal hover:bg-teal-50"><X aria-hidden="true" size={14} /><span className="icon-first-label">Clear filters</span></button></div>}
      </div>}
      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm">Loading keys…</p> : !activeKeys.length
        ? <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-soft"><KeyRound aria-hidden="true" className="mx-auto mb-3 h-7 w-7 text-slate-400" /><p className="font-semibold text-slate-900">No active keys yet</p><p className="mt-1 text-sm text-slate-600">Create a key when you are ready to connect a tool.</p></div>
        : !filteredKeys.length ? <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center"><p className="font-semibold text-slate-900">No keys match these filters</p><button type="button" onClick={clearFilters} className="mt-2 text-sm font-medium text-hq-teal hover:underline">Clear filters</button></div>
        : <div className="rounded-xl border border-slate-200 bg-white">
          <div aria-hidden="true" className="hidden gap-4 border-b border-slate-200 bg-slate-50/60 px-5 py-2 pr-40 text-xs font-medium text-slate-500 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,.7fr)]"><span>Key</span><span>Scope</span><span>Expires</span></div>
          <ul className="divide-y divide-slate-100">{filteredKeys.map((key) => {
          const assigned = grants[key.id] ?? []
          const allEntities = assigned.some((grant) => !grant.client_id)
          const entityCount = new Set(assigned.filter((grant) => grant.client_id && grant.operation !== 'connection.connect').map((grant) => grant.client_id)).size
          const connectionCount = new Set(assigned.filter((grant) => grant.operation === 'connection.connect').map((grant) => `${grant.client_id}|${grant.environment ?? ''}`)).size
          const scopeSummary = [allEntities ? 'All entities' : null, entityCount ? `${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}` : null, connectionCount ? `${connectionCount} ${connectionCount === 1 ? 'connection' : 'connections'}` : null].filter(Boolean).join(' · ') || 'No access'
          return <li key={key.id} className="relative grid gap-x-4 gap-y-2 px-5 py-3 pr-16 sm:pr-40 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,.7fr)] lg:items-center">
            <div className="min-w-0">
              <button type="button" onClick={() => { void refresh().then(() => setDetailKeyId(key.id)).catch((cause) => setError(errorText(cause))) }} aria-label={`View access for ${keyIdentity(key)}`} className="group inline-flex max-w-full items-center gap-1.5 text-left text-sm font-semibold text-slate-900 hover:text-hq-teal focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><span className="truncate">{key.name}</span><ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-hq-teal" /></button>
              <p className="mt-0.5 font-mono text-xs text-slate-500">{key.secret_suffix ? `••••${key.secret_suffix}` : 'Suffix unavailable'}</p><p className="mt-1 text-xs font-medium text-slate-500">{keyPurposeLabel(key.purpose)}</p>
            </div>
            <p className={`min-w-0 text-sm ${assigned.length ? 'text-slate-700' : 'text-amber-800'}`}><span className="mr-2 text-xs font-medium text-slate-500 lg:sr-only">Scope</span>{scopeSummary}</p>
            <p className="text-sm text-slate-700"><span className="mr-2 text-xs font-medium text-slate-500 lg:sr-only">Expires</span>{key.expires_at ? dateLabel(key.expires_at) : 'No expiry'}</p>
          <KeyActionsMenu keyName={key.name} keySuffix={key.secret_suffix} disabled={busy} onReplace={() => {
            if ((key.purpose ?? 'legacy_mixed') === 'legacy_mixed') {
              setNotice('Legacy mixed keys cannot be replaced as one key. Create separate QBO and entity operation keys, then update the tools that use them.')
              return
            }
            setPending({ kind: 'rotate', key })
          }} onRevoke={() => setPending({ kind: 'revoke', key })} />
          </li>
        })}</ul></div>}
    </section>
    <dialog ref={detailDialogRef} aria-label={detailKey ? `Access for ${detailKey.name}` : 'API key access'} onCancel={(event) => { event.preventDefault(); setDetailKeyId(null) }} onClick={(event) => { if (event.target === event.currentTarget) setDetailKeyId(null) }} className="fixed left-1/2 top-1/2 m-0 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm">
      {detailKey && <div>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="min-w-0"><h2 className="break-words text-xl font-semibold text-slate-950">{detailKey.name}</h2><p className="mt-1 font-mono text-xs text-slate-500">{detailKey.secret_suffix ? `Key ending ${detailKey.secret_suffix}` : 'Suffix unavailable'}</p></div>
          <button type="button" aria-label="Close key access" onClick={() => setDetailKeyId(null)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><X aria-hidden="true" size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-4 border-b border-slate-200 bg-slate-50/60 px-6 py-4 text-sm"><div><p className="text-xs font-medium text-slate-500">Last used</p><p className="mt-1 font-medium text-slate-900">{detailKey.last_used_at ? dateLabel(detailKey.last_used_at) : 'Never'}</p></div><div><p className="text-xs font-medium text-slate-500">Expires</p><p className="mt-1 font-medium text-slate-900">{detailKey.expires_at ? dateLabel(detailKey.expires_at) : 'Does not expire'}</p></div></div>
        <div className="space-y-6 px-6 py-5">
          <p className="text-sm text-slate-600">Current permissions for this key. Access is read-only here.</p>
          {!detailGrants.length && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">No access assigned. This key cannot view or change information.</p>}
          {detailGlobal.length > 0 && <section aria-label="All entities access"><h3 className="text-sm font-semibold text-slate-900">All entities</h3><p className="mt-1 text-xs text-slate-500">Current and future entities</p><p className="mt-3 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">{detailGlobal.join(' · ')}</p></section>}
          {detailEntities.size > 0 && <section aria-label="Specific entity access"><h3 className="text-sm font-semibold text-slate-900">Specific entities <span className="ml-1 text-xs font-medium text-slate-500">{detailEntities.size}</span></h3><ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">{[...detailEntities].sort(([a], [b]) => entityName(a).localeCompare(entityName(b))).map(([id, actions]) => <li key={id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"><span className="font-medium text-slate-900">{entityName(id)}</span><span className="text-slate-600">{keyScopeLabels(actions).join(' · ')}</span></li>)}</ul></section>}
          {detailConnections.size > 0 && <section aria-label="QuickBooks connection access"><h3 className="text-sm font-semibold text-slate-900">QuickBooks connections <span className="ml-1 text-xs font-medium text-slate-500">{detailConnections.size}</span></h3><ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">{[...detailConnections].sort(([a], [b]) => a.localeCompare(b)).map(([scope, actions]) => { const [id, environment] = scope.split('|'); return <li key={scope} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"><span className="font-medium text-slate-900">{entityName(id)} <span className="font-normal text-slate-500">· {environment === 'prod' ? 'Production' : environment === 'sandbox' ? 'Sandbox' : environment}</span></span><span className="text-slate-600">{actions.join(' · ')}</span></li> })}</ul></section>}
        </div>
      </div>}
    </dialog>
    {!loading && historicalKeys.length > 0 && <button type="button" onClick={() => setInfoOpen('history')} className="inline-flex items-center gap-2 text-sm font-medium text-hq-teal">
      <History aria-hidden="true" size={16} />Key history ({historicalKeys.length})
    </button>}
    <dialog ref={infoDialogRef} aria-label={infoOpen === 'expiring' ? 'Keys expiring soon' : 'Key history'} onCancel={(event) => { event.preventDefault(); setInfoOpen(null) }} onClick={(event) => { if (event.target === event.currentTarget) setInfoOpen(null) }} className="fixed left-1/2 top-1/2 m-0 max-h-[85vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm">
      <div className="p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{infoOpen === 'expiring' ? 'Keys expiring soon' : 'Key history'}</h2><button type="button" aria-label="Close" onClick={() => setInfoOpen(null)} className="icon-first-action rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><X aria-hidden="true" size={18} /><span className="icon-first-label">Close</span></button></div>
        {infoOpen === 'expiring' ? <>
          <p className="mt-1 text-sm text-slate-600">Replace each key and update the tool that uses it before the expiry date.</p>
          <ul className="mt-4 divide-y divide-slate-100">{expiringKeys.map((key) => <li key={key.id} className="py-3 text-sm"><span className="font-semibold">{key.name} {key.secret_suffix ? `••••${key.secret_suffix}` : ''}</span><span className="block text-slate-600">Expires {dateLabel(key.expires_at)} ({daysUntil(key.expires_at!)} days)</span></li>)}</ul>
        </> : infoOpen === 'history' ? <>
          <p className="mt-1 text-sm text-slate-600">Inactive keys are retained for up to 7 days; only the 3 most recent appear here. Activity remains available.</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200"><div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-3 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span>Key</span><span>Status</span><span>Date</span></div><ul className="divide-y divide-slate-100">{historicalKeys.map((key) => <li key={key.id} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-3 px-4 py-3 text-sm"><span className="truncate font-medium">{key.name} <span className="font-mono text-xs text-slate-500">{key.secret_suffix ? `••••${key.secret_suffix}` : ''}</span></span><span className="text-slate-600">{keyState(key)}</span><span className="text-xs text-slate-600">{dateLabel(key.revoked_at ?? key.expires_at ?? key.created_at)}</span></li>)}</ul></div>
        </> : null}
      </div>
    </dialog>
    <dialog ref={createDialogRef} aria-label={issued ? 'New API key secret' : 'Create API key'} onCancel={(event) => { event.preventDefault(); closeCreate() }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate() }} className={`fixed left-1/2 top-1/2 m-0 max-h-[90dvh] w-[calc(100%-2rem)] ${issued ? 'max-w-xl' : 'max-w-3xl'} -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm`}>
      {issued ? <div className="p-6">
        <h2 className="text-xl font-semibold text-slate-950">Your new API key</h2>
        <p className="mt-1 break-words text-sm text-slate-600">{issued.name}</p>
        <div className="mt-5 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950" role="note">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div><p className="text-sm font-semibold">Shown only once</p><p className="mt-1 text-sm leading-relaxed">Copy it to your approved secret store. Do not put it in code or logs.</p></div>
        </div>
        <div className="mt-5"><p className="mb-2 text-sm font-semibold text-slate-900">API key</p><div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center"><code className="min-w-0 flex-1 select-all break-all text-sm text-slate-900" data-testid="new-key-secret">{issued.secret}</code><button type="button" onClick={() => void copyIssuedKey()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-hq-teal bg-white px-3 text-sm font-semibold text-hq-teal hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">{copyState === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copyState === 'copied' ? 'Copied' : 'Copy key'}</button></div></div>
        {copyState === 'copied' && <p role="status" className="mt-2 text-sm text-emerald-800">Copied to clipboard.</p>}
        {copyState === 'failed' && <p role="alert" className="mt-2 text-sm text-rose-800">Could not copy automatically. Select the key above and copy it manually.</p>}
        {busy && <p role="status" className="mt-3 text-sm text-slate-600">Finishing key setup...</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        {issued.replaces_key_id && <p className="mt-5 text-sm text-slate-600">The previous key is revoked. Update the connected tool now.</p>}
        <div className="mt-6 flex justify-end border-t border-slate-200 pt-4"><button type="button" disabled={busy} onClick={() => setIssued(null)} className="rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Done</button></div>
      </div> : <form onSubmit={create} className="flex max-h-[90dvh] min-w-0 flex-col">
        <div data-dialog-header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-950">Create an API key</h2>
          <button type="button" aria-label="Close API key setup" disabled={busy} onClick={closeCreate} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" /></button>
        </div>
        {globalManageGrant && <div role="group" aria-label="API key setup steps" className="grid grid-cols-2 border-b border-slate-200 px-6"><button type="button" aria-current={keyStep === 'purpose' ? 'step' : undefined} onClick={() => setKeyStep('purpose')} className={`border-b-2 py-3 text-sm font-semibold ${keyStep === 'purpose' ? 'border-hq-teal text-hq-teal' : 'border-transparent text-slate-600'}`}>1 · Purpose</button><button type="button" aria-current={keyStep === 'setup' ? 'step' : undefined} disabled={!purpose} onClick={() => setKeyStep('setup')} className={`border-b-2 py-3 text-sm font-semibold disabled:opacity-50 ${keyStep === 'setup' ? 'border-hq-teal text-hq-teal' : 'border-transparent text-slate-600'}`}>2 · Details & access</button></div>}
        {keyStep === 'setup' && purpose && <div data-key-purpose className="shrink-0 border-b border-slate-100 bg-white px-6 py-3 text-sm"><span className="mr-2 text-slate-600">Key purpose</span><span className="font-semibold text-hq-teal">{purpose === 'qbo' ? 'Work with QuickBooks data' : 'Administer QBO Gateway entities'}</span></div>}
        <div data-dialog-body className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {keyStep === 'setup' && <>
          <label className="block text-sm font-medium text-slate-800">Key name
            <input ref={nameRef} aria-label="Key name" aria-invalid={nameConflict || undefined} aria-describedby={nameConflict ? 'key-name-error' : undefined} required maxLength={100} value={name} onChange={(event) => { setName(event.target.value); setServerNameConflict(false) }} placeholder="Name of the tool or integration" className={`mt-2 block w-full rounded-lg border px-3 py-2 font-normal ${nameConflict ? 'border-rose-500' : 'border-slate-300'}`} />
            {nameConflict && <span id="key-name-error" role="alert" className="mt-1.5 block text-xs font-normal text-rose-700">An active key already uses this name. Choose a distinct name or replace the existing key.</span>}
          </label>
          </>}
          {keyStep === 'purpose' &&
          <fieldset>
            <legend className="text-base font-semibold text-slate-950">Choose a purpose</legend>
            <p className="mt-1 text-sm text-slate-600">Each key has one purpose. Choose what this key needs to do.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" aria-pressed={purpose === 'qbo'} onClick={() => choosePurpose('qbo')} className={`group flex min-h-40 flex-col rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal ${purpose === 'qbo' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-hq-teal hover:bg-slate-50'}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${purpose === 'qbo' ? 'bg-white text-hq-teal' : 'bg-slate-100 text-slate-600'}`}><KeyRound aria-hidden="true" className="h-5 w-5" /></span>
                <span className="mt-4 block text-sm font-semibold text-slate-950">Work with QuickBooks data</span><span className="mt-1 block text-xs leading-5 text-slate-600">Read or update QuickBooks records, such as customers, invoices, and vendors, for authorized entities.</span>
              </button>
              <button type="button" aria-pressed={purpose === 'entities'} onClick={() => choosePurpose('entities')} className={`group flex min-h-40 flex-col rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal ${purpose === 'entities' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-hq-teal hover:bg-slate-50'}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${purpose === 'entities' ? 'bg-white text-hq-teal' : 'bg-slate-100 text-slate-600'}`}><Settings2 aria-hidden="true" className="h-5 w-5" /></span>
                <span className="mt-4 block text-sm font-semibold text-slate-950">Administer QBO Gateway entities</span><span className="mt-1 block text-xs leading-5 text-slate-600">Create or manage entities registered in QBO Gateway. Does not allow reading or changing their QuickBooks records.</span>
              </button>
            </div>
          </fieldset>}
          {keyStep === 'setup' && <KeyExpiryPicker choice={expiryChoice} date={expiresOn} maximumDays={policy?.maximum_expiration_days ?? 120} onChange={(nextChoice, nextDate) => { setExpiryChoice(nextChoice); setExpiresOn(nextDate) }} />}
          {keyStep === 'setup' && purpose && <>
          <section aria-label="Key permissions">
            <div className="mb-3 flex items-center gap-1"><h3 className="text-sm font-semibold text-slate-900">Entity scope</h3><InfoTooltip label="About key access" placement="top" text={purpose === 'entities' ? 'This key cannot exceed your own access. It can create new entities; updating or deleting existing ones is limited to the entities selected below.' : 'Choose the entities and actions below. This key cannot exceed your own access.'} /></div>
            <fieldset><legend className="sr-only">Choose key permissions</legend>
                {purpose === 'qbo' && <div><div className="grid gap-2 sm:grid-cols-2"><button type="button" aria-label="Selected entities" aria-pressed={scopeMode === 'selected'} disabled={!clients.length} onClick={() => switchScope('selected')} className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold disabled:opacity-50 ${scopeMode === 'selected' ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 text-slate-900 hover:bg-slate-50'}`}>Selected entities<span className="mt-0.5 block text-xs font-normal text-slate-600">{clientsLoading ? 'Loading…' : clients.length ? `${clients.length} available` : 'No entities available'}</span></button><button type="button" aria-pressed={scopeMode === 'all'} disabled={!globalQboGrants.length && (clientsLoading || !allAvailableQboReads.length)} onClick={() => switchScope('all')} className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${scopeMode === 'all' ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 text-slate-900 hover:bg-slate-50'}`}>{globalQboGrants.length ? 'All entities' : 'All available entities'}<span className="mt-0.5 block text-xs font-normal text-slate-600">{globalQboGrants.length ? 'Current and future' : clientsLoading ? 'Loading entities…' : `${allAvailableQboReads.length} current available`}</span></button></div>{clientLoadError && <p role="alert" className="mt-2 text-xs text-rose-700">Could not load entities. Try again after reopening this page.</p>}</div>}
                {purpose === 'qbo' && scopeMode === 'all' && globalQboGrants.length > 0 && <div className="mt-5"><p className="mb-2 text-sm font-semibold text-slate-900">Permissions for all entities</p>{accessLevelControls(globalQboGrants, 'All entities')}</div>}
                {purpose === 'qbo' && scopeMode === 'all' && globalQboGrants.length === 0 && <div className="mt-5"><p className="mb-2 text-sm font-semibold text-slate-900">Permissions for all available entities</p><div role="group" aria-label="All available entities QBO access level" className="grid gap-2 sm:grid-cols-2"><span className="rounded-lg border border-hq-teal bg-teal-50 px-3 py-2.5 text-sm font-semibold text-hq-teal">Read</span>{canEditAllAvailableQbo && <button type="button" aria-pressed={allAvailableQboEditsSelected} onClick={toggleAllAvailableQboEdits} className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold ${allAvailableQboEditsSelected ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 text-slate-800 hover:border-slate-400'}`}>Edit</button>}</div><p className="mt-2 text-xs text-slate-600">Current entities only. Future entities are not included.</p></div>}
                {purpose === 'qbo' && scopeMode === 'selected' && <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold text-slate-900">Entities</p><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-hq-teal">{selectedEntityCount} selected</span></div>
                    <label className="sr-only" htmlFor="key-entity-search">Find an entity</label>
                    <input id="key-entity-search" type="search" value={entitySearch} onChange={(event) => setEntitySearch(event.target.value)} placeholder="Search entities" className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-hq-teal focus:outline-none" />
                    <EntitySelectionToolbar allSelected={!selectableEntityChoices.length || selectableEntityChoices.every((client) => selectedEntityActions.has(client.id))} hasSelection={selectedEntityCount > 0} showSelectedOnly={showSelectedEntities} onSelectAll={selectAllEntities} onClear={clearEntitySelection} onToggleSelected={() => setShowSelectedEntities((current) => !current)} />
                    <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">{visibleEntityChoices.map((client) => {
                      const choices = entityGrants(client.id)
                      const granted = selectedEntityActions.has(client.id)
                      const editGrant = choices.find((grant) => grant.operation === 'qbo.entity.edit')
                      const editEnabled = Boolean(editGrant && selectedKeys.has(grantKey(editGrant)))
                      return <div key={client.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${granted ? 'border-teal-200 bg-teal-50/60' : 'border-transparent'}`}>
                        <button type="button" aria-label={`Select ${client.name}`} aria-pressed={granted} onClick={() => toggleEntity(client.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium text-slate-950">{client.name}</span><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${granted ? 'bg-teal-50 text-hq-teal' : 'bg-slate-100 text-slate-600'}`}>{granted ? 'Granted' : 'Not granted'}</span></button>
                        {granted && <div role="group" aria-label={`QuickBooks access for ${client.name}`} className="flex shrink-0 items-center gap-2"><span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">Read</span>{editGrant && <button type="button" aria-label={`Edit access for ${client.name}`} aria-pressed={editEnabled} onClick={() => toggleAccess(choices, 'edit')} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${editEnabled ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 bg-white text-slate-600 hover:border-hq-teal'}`}>Edit</button>}</div>}
                      </div>
                    })}{!visibleEntityChoices.length && <p className="py-3 text-sm text-slate-500">{showSelectedEntities ? 'No selected entities match your search.' : 'No matching entities'}</p>}</div>
                    {entityChoices.length > visibleEntityChoices.length && !showSelectedEntities && <p className="mt-2 text-xs text-slate-500">Showing the first 50. Search to find another entity.</p>}
                </div>}
                {purpose === 'entities' && <div>
                  <p className="mb-3 text-xs text-slate-600">Choose which entities this key may update or delete. Creating entities remains available anywhere.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" aria-label="Selected entities" aria-pressed={scopeMode === 'selected'} onClick={() => switchScope('selected')} className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold ${scopeMode === 'selected' ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 text-slate-900 hover:bg-slate-50'}`}>Selected entities<span className="mt-0.5 block text-xs font-normal text-slate-600">Choose only the entities this key needs</span></button>
                    <button type="button" aria-pressed={scopeMode === 'all'} disabled={clientsLoading} onClick={() => switchScope('all')} className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${scopeMode === 'all' ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 text-slate-900 hover:bg-slate-50'}`}>All accessible entities<span className="mt-0.5 block text-xs font-normal text-slate-600">{clientsLoading ? 'Loading entities…' : globalEntityReadGrant ? 'Current and future' : `${entityReadGrants.length} entities with access`}</span></button>
                  </div>
                  {scopeMode === 'selected' && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold text-slate-900">Entities</p><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-hq-teal">{selectedEntityReadCount} selected</span></div>
                    <label className="sr-only" htmlFor="entity-key-scope-search">Find an entity</label>
                    <input id="entity-key-scope-search" type="search" value={entitySearch} onChange={(event) => setEntitySearch(event.target.value)} placeholder="Search entities" className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-hq-teal focus:outline-none" />
                    <EntitySelectionToolbar allSelected={!entityReadChoices.length || entityReadChoices.every(({ grant }) => selectedKeys.has(grantKey(grant)))} hasSelection={selectedEntityReadCount > 0} showSelectedOnly={showSelectedEntities} onSelectAll={selectAllEntityReads} onClear={clearEntityReads} onToggleSelected={() => setShowSelectedEntities((current) => !current)} />
                    <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">{entityReadChoices.filter(({ grant }) => !showSelectedEntities || selectedKeys.has(grantKey(grant))).slice(0, 50).map(({ client, grant }) => <button key={client.id} type="button" aria-label={`Select ${client.name}`} aria-pressed={selectedKeys.has(grantKey(grant))} onClick={() => toggleEntityRead(grant)} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${selectedKeys.has(grantKey(grant)) ? 'border-hq-teal bg-teal-50 text-slate-950' : 'border-transparent text-slate-900 hover:bg-white'}`}><span className="min-w-0 truncate font-medium">{client.name}</span><span className="flex h-5 w-5 shrink-0 items-center justify-center">{selectedKeys.has(grantKey(grant)) && <Check aria-hidden="true" className="h-4 w-4 text-hq-teal" />}</span></button>)}{!entityReadChoices.length && <p className="py-3 text-sm text-slate-500">No matching entities</p>}</div>
                    {entityReadChoices.length > 50 && !showSelectedEntities && <p className="mt-2 text-xs text-slate-500">Showing the first 50. Search to find another entity.</p>}
                  </div>}
                </div>}
            </fieldset>
          </section>
          </>}
        </div>
        <div data-dialog-footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-3">
          {keyStep === 'setup' && <div aria-label="Key setup summary" className="mb-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[1.3fr_1.2fr_1fr]"><p><span className="text-slate-500">Entities</span><span className="ml-2 font-semibold text-slate-800">{reviewScope}</span></p><p><span className="text-slate-500">Actions</span><span className="ml-2 font-semibold text-slate-800">{reviewActions}</span></p><p><span className="text-slate-500">Expires</span><span className="ml-2 font-semibold text-slate-800">{reviewExpiration}</span></p></div>}
          <div className="flex items-center justify-between gap-3"><div>{keyStep === 'setup' ? globalManageGrant && <button type="button" aria-label="Back to key type" disabled={busy} onClick={() => setKeyStep('purpose')} className="icon-first-action rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><ChevronRight aria-hidden="true" className="h-4 w-4 rotate-180" /><span className="icon-first-label">Back to purpose</span></button> : hasSetupDraft && <button type="button" aria-label="Reset API key setup" disabled={busy} onClick={resetCreate} className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50">Reset setup</button>}</div>{keyStep === 'purpose' ? <button type="button" aria-label="Continue to key details" disabled={!purpose} onClick={() => { setError(null); setKeyStep('setup') }} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white disabled:opacity-50"><ChevronRight aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Continue</span></button> : <button type="submit" aria-label="Create key" disabled={busy || !canIssuePurpose || nameConflict} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{busy ? 'Creating API key…' : 'Create API key'}</span></button>}</div>
        </div>
      </form>}
    </dialog>
    <ConfirmDangerModal open={discardConfirmOpen} title="Discard this API key?" description="Your setup has not been saved." confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={() => setDiscardConfirmOpen(false)} onConfirm={() => { setDiscardConfirmOpen(false); setCreateOpen(false) }} />
    <ConfirmDangerModal open={Boolean(pending)} title={pending?.kind === 'revoke' ? 'Revoke access' : 'Replace key'} description={pending?.kind === 'revoke' ? `${keyIdentity(pending.key)} will stop working immediately. Any tool using it will lose access.` : `The current key for ${pending ? keyIdentity(pending.key) : 'this tool'} will stop working as soon as the replacement is created. Have the tool ready to update.`} confirmLabel={pending?.kind === 'revoke' ? 'Revoke access' : 'Create replacement'} danger={pending?.kind === 'revoke'} onCancel={() => setPending(null)} onConfirm={confirmPending} />
  </div>
}
