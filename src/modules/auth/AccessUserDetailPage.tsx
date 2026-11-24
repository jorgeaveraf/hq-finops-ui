import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { ArrowLeft, ArrowRight, Check, CirclePause, LogIn, RotateCcw, Trash2, X } from 'lucide-react'
import { InfoTooltip } from '../../components/InfoTooltip'
import { permissionName } from './accessLabels'
import { Navigate, useParams } from 'react-router-dom'
import { apiRequest } from '../../api/finopsApi'
import { listClients, type QboClient } from '../qbo/api/qboGatewayClient'
import { useAuth } from './useAuth'

export type AccessUser = {
  id: string; email: string; display_name: string | null; role: 'Viewer' | 'Operator' | 'Admin'
  status: 'active' | 'disabled'; issuer: string | null; sub: string | null
  is_super_admin?: boolean; is_super_admin_founder?: boolean
}
type Grant = { id?: string; user_id?: string | null; client_id: string | null; environment: string | null; operation: string }
type GrantDraft = Pick<Grant, 'operation' | 'client_id' | 'environment'>
type Preview = { fingerprint: string; affected_keys?: unknown[]; suspended_keys?: unknown[]; changes?: unknown[]; [key: string]: unknown }
const roles = ['Viewer', 'Operator', 'Admin'] as const
type Operation = { value: string; label: string; roles: readonly AccessUser['role'][]; global?: boolean }
const operations: Operation[] = [
  { value: 'qbo.entity.read', label: 'Read QuickBooks data for entity', roles },
  { value: 'qbo.entity.edit', label: 'Edit QuickBooks data for entity', roles: ['Operator', 'Admin'] },
  { value: 'qbo.entity.delete', label: 'Delete QuickBooks data for entity', roles },
  { value: 'access.manage', label: 'Manage access', roles: ['Admin'], global: true },
  { value: 'entities.manage', label: 'Manage entities in FinOps', roles: ['Admin'], global: true },
  { value: 'activity.read', label: 'Read Activity', roles: ['Admin'], global: true },
  { value: 'keys.admin', label: 'Administer keys', roles: ['Admin'], global: true },
]
const compactPermissionLabels: Record<string, string> = {
  'client.read': 'View (legacy)', 'qbo.entity.read': 'Read', 'qbo.entity.edit': 'Edit',
  'qbo.entity.delete': 'Delete QBO', 'access.manage': 'Manage access', 'entities.manage': 'Manage entities', 'activity.read': 'Activity', 'keys.admin': 'API keys',
}
const grantKey = (grant: GrantDraft) => `${grant.operation}|${grant.client_id ?? ''}|${grant.environment ?? ''}`
const recommendedFor = (role: AccessUser['role']) => role === 'Viewer' ? ['qbo.entity.read'] : ['qbo.entity.read', 'qbo.entity.edit']
const optionalFor = (role: AccessUser['role']) => recommendedFor(role).filter((operation) => operation !== 'qbo.entity.read')
const entityRecommendations = (role: AccessUser['role']) => role === 'Viewer' ? ['qbo.entity.read'] : ['qbo.entity.read', 'qbo.entity.edit']
const implicitRoleEffect = (role: AccessUser['role'], previous?: AccessUser['role']) => {
  if (role === 'Viewer') return `${previous && previous !== role ? 'QBO connection will be removed. ' : ''}Can view assigned entities and their QuickBooks data.`
  if (role === 'Operator') return 'Can view assigned entities and connect them to QuickBooks.'
  return 'Can administer selected FinOps features. Entity and QuickBooks access are set separately.'
}
const createGrants = (scope: 'all' | 'specific' | '', entityIds: string[], selected: string[]): GrantDraft[] => {
  const targets = scope === 'all' ? [null] : scope === 'specific' ? entityIds : []
  const entityGrants = targets.flatMap((client_id) => ['qbo.entity.read', ...selected]
    .filter((operation) => !['access.manage', 'entities.manage', 'activity.read', 'keys.admin'].includes(operation))
    .map((operation) => ({ operation, client_id, environment: null })))
  const administration = scope ? selected.filter((operation) => ['access.manage', 'entities.manage', 'activity.read', 'keys.admin'].includes(operation)).map((operation) => ({ operation, client_id: null, environment: null })) : []
  return withoutRedundantEntityGrants([...entityGrants, ...administration])
}
const itemLabel = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value)
const isAdministration = (operation: string) => ['access.manage', 'entities.manage', 'activity.read', 'keys.admin'].includes(operation)
const grantScope = (grant: GrantDraft, clients: QboClient[]) => isAdministration(grant.operation) ? 'FinOps console' : `${clients.find((client) => client.id === grant.client_id)?.name || (grant.client_id ? 'Assigned entity (name unavailable)' : 'All entities')}${grant.environment ? ` · ${grant.environment === 'prod' ? 'Live QuickBooks data' : 'Test QuickBooks data'}` : ''}`
const samePolicy = (left: GrantDraft[], right: GrantDraft[]) => left.length === right.length && left.map(grantKey).sort().join('\n') === right.map(grantKey).sort().join('\n')
const withoutRedundantEntityGrants = (draft: GrantDraft[]) => {
  const globalOperations = new Set(draft.filter((grant) => !isAdministration(grant.operation) && grant.client_id === null && grant.environment === null).map((grant) => grant.operation))
  const seen = new Set<string>()
  return draft.filter((grant) => {
    const key = grantKey(grant)
    if (seen.has(key) || !isAdministration(grant.operation) && grant.client_id !== null && grant.environment === null && globalOperations.has(grant.operation)) return false
    seen.add(key)
    return true
  })
}

export function AccessUserDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>()
  const { access } = useAuth()
  if (userId === access?.user.id) return <Navigate to="/access" replace />
  return <Navigate to={`/access/users?edit=${encodeURIComponent(userId)}`} replace />
}

export function AccessUserEditor({ user, creating = false, onClose, onSaved, onDeleted }: { user: AccessUser; creating?: boolean; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const { access } = useAuth()
  const canDelegate = (operation: string, clientId: string | null) => Boolean(access?.user.is_super_admin) || (operation !== 'entities.manage' && (access?.effective_grants ?? []).some((grant) =>
    grant.operation === operation && grant.environment === null &&
    (clientId === null ? grant.client_id === null : grant.client_id === null || grant.client_id === clientId)))
  const suggestedForScope = (selectedRole: AccessUser['role'], clientId: string | null) =>
    entityRecommendations(selectedRole).filter((operation) => canDelegate(operation, clientId))
  const suggestedForNewScope = (clientId: string | null) => {
    const suggestions = suggestedForScope(role, clientId)
    const qboActions = suggestions.filter((operation) => operation !== 'entities.manage')
    return qboActions.length ? qboActions : suggestions
  }
  const canDelegateCreate = (operation: string, scope: 'all' | 'specific' | '', ids: string[]) =>
    isAdministration(operation) ? canDelegate(operation, null) :
      scope === 'all' ? canDelegate(operation, null) :
        scope === 'specific' && ids.length > 0 && ids.every((id) => canDelegate(operation, id))
  const draftCreateGrants = (scope: 'all' | 'specific' | '', ids: string[], selected: string[]) =>
    createGrants(scope, ids, selected).filter((grant) => canDelegate(grant.operation, grant.client_id))
  const userId = user.id
  const [draftEmail, setDraftEmail] = useState(user.email)
  const [clients, setClients] = useState<QboClient[]>([])
  const [role, setRole] = useState<AccessUser['role']>('Viewer')
  const [status, setStatus] = useState<AccessUser['status']>('active')
  const [grants, setGrants] = useState<GrantDraft[]>([])
  const [savedPolicy, setSavedPolicy] = useState<{ role: AccessUser['role']; status: AccessUser['status']; grants: GrantDraft[] } | null>(null)
  const [editing, setEditing] = useState(true)
  const [editSection, setEditSection] = useState<'role' | 'scope'>('role')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [selectedScope, setSelectedScope] = useState('')
  const [createScope, setCreateScope] = useState<'all' | 'specific' | ''>('')
  const [createEntityIds, setCreateEntityIds] = useState<string[]>([])
  const [createPermissions, setCreatePermissions] = useState<string[]>(optionalFor(user.role))
  const [createSuperAdmin, setCreateSuperAdmin] = useState(false)
  const [creationChoice, setCreationChoice] = useState<'choice' | 'person' | 'superadmin'>('choice')
  const [createTypeStep, setCreateTypeStep] = useState(true)
  const [confirmFounderTransfer, setConfirmFounderTransfer] = useState(false)
  const [founderConfirmation, setFounderConfirmation] = useState('')
  const [entitySearch, setEntitySearch] = useState('')
  const [scopeSearch, setScopeSearch] = useState('')
  const [addingScope, setAddingScope] = useState(false)
  const [addingEditExceptions, setAddingEditExceptions] = useState(false)
  const [convertingAllScope, setConvertingAllScope] = useState(false)
  const [newEntityIds, setNewEntityIds] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [acknowledge, setAcknowledge] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const validDraftEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draftEmail.trim())
  const selectedClientId = selectedScope && selectedScope !== 'all' ? selectedScope : null
  const scopeGrant = (operation: string): GrantDraft => ({ operation, client_id: selectedClientId, environment: null })
  const isGranted = (operation: string) => grants.some((grant) => grantKey(grant) === grantKey(scopeGrant(operation)))
  const isInheritedFromAll = (operation: string) => selectedClientId !== null && grants.some((grant) => grant.operation === operation && grant.client_id === null && grant.environment === null)
  const incompatibleGrants = grants.filter((grant) => { const item = operations.find((option) => option.value === grant.operation); return item && !item.roles.includes(role) })
  const roleLimitedCount = savedPolicy?.grants.filter((grant) => {
    const item = operations.find((option) => option.value === grant.operation)
    return item && !item.roles.includes(role) && !grants.some((current) => grantKey(current) === grantKey(grant))
  }).length ?? 0
  const missingOperatorEdits = role === 'Operator' ? grants
    .filter((grant) => grant.operation === 'qbo.entity.read')
    .map((grant) => ({ operation: 'qbo.entity.edit', client_id: grant.client_id, environment: null }))
    .filter((grant) => !grants.some((item) => grantKey(item) === grantKey(grant))) : []
  const exceptionalGrants = grants.filter((grant) => {
    const item = operations.find((option) => option.value === grant.operation)
    return !item || !item.roles.includes(role)
  })
  const selectEditScope = (scope: string) => {
    invalidatePreview()
    setSelectedScope(scope)
    setAddingScope(false)
    setAddingEditExceptions(false)
    setConvertingAllScope(false)
    setNewEntityIds([])
    setScopeSearch('')
  }
  const createPermissionChip = (item: Operation) => <button key={item.value} type="button" aria-label={permissionName(item.value)} aria-pressed={createPermissions.includes(item.value)} disabled={!canDelegateCreate(item.value, createScope, createEntityIds)} onClick={() => toggleCreatePermission(item.value)} className={`rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${createPermissions.includes(item.value) ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 text-slate-700 hover:border-slate-400'}`}>{compactPermissionLabels[item.value]}</button>
  const pendingChanges = creating
    ? Boolean(draftEmail.trim()) || role !== 'Viewer' || status !== 'active' || grants.length > 0 || createSuperAdmin
    : (savedPolicy ? role !== savedPolicy.role || status !== savedPolicy.status || !samePolicy(grants, savedPolicy.grants) : false)
  const suspendedKeys = preview?.suspended_keys ?? []
  const payload = { role, status: creating ? 'active' : status, grants }
  const isFounder = Boolean(access?.user.is_super_admin_founder)
  const showCreationChoice = creating && isFounder && createTypeStep
  const isSuperAdmin = Boolean(user.is_super_admin)
  const canReceiveFounder = Boolean(user.is_super_admin && user.status === 'active' && user.sub && !user.is_super_admin_founder)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const roleSuppressedGrants = useRef<GrantDraft[]>([])
  const roleSuggestedGrants = useRef<Set<string>>(new Set())
  const editorHeading = useRef<HTMLHeadingElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const escapeFromMenu = useRef(false)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (preview) previewHeading.current?.focus()
    else if (editing) (creating && !showCreationChoice ? emailInputRef.current : editorHeading.current)?.focus()
  }, [preview, editing, creating, showCreationChoice])
  useEffect(() => {
    if (!editing) return
    const dialog = dialogRef.current
    const trigger = document.activeElement as HTMLElement | null
    if (typeof dialog?.showModal === 'function') dialog.showModal()
    else dialog?.setAttribute('open', '');
    (creating ? emailInputRef.current : editorHeading.current)?.focus()
    return () => {
      if (typeof dialog?.close === 'function') dialog.close()
      else dialog?.removeAttribute('open')
      trigger?.focus()
    }
  }, [editing, creating, user.id])

  useEffect(() => {
    let current = true
    if (creating) {
      void listClients().catch(() => [] as QboClient[]).then((availableClients) => {
        if (!current) return
        setRole(user.role); setStatus('active'); setGrants([])
        setSavedPolicy({ role: user.role, status: 'active', grants: [] })
        setClients(availableClients)
      })
      return () => { current = false }
    }
    if (user.is_super_admin) {
      setRole(user.role); setStatus(user.status); setGrants([])
      setSavedPolicy({ role: user.role, status: user.status, grants: [] })
      setClients([])
      return () => { current = false }
    }
    void Promise.all([
      apiRequest<Grant[]>(`/access/grants?user_id=${encodeURIComponent(userId)}`),
      listClients().catch(() => [] as QboClient[]),
    ]).then(([existing, availableClients]) => {
      if (!current) return
      setRole(user.role); setStatus(user.status)
      const loadedGrants = existing.filter((grant) => grant.operation !== 'connection.connect').map(({ operation: op, client_id, environment: env }) => ({ operation: op, client_id, environment: env }))
      setGrants(loadedGrants)
      roleSuppressedGrants.current = []
      roleSuggestedGrants.current.clear()
      setSavedPolicy({ role: user.role, status: user.status, grants: loadedGrants })
      const firstEntityGrant = loadedGrants.find((grant) => !isAdministration(grant.operation))
      const startingScope = firstEntityGrant ? firstEntityGrant.client_id ?? 'all' : ''
      setSelectedScope(startingScope)
      setClients(availableClients)
    }).catch((err: Error) => { if (current) setError(err.message) })
    return () => { current = false }
  }, [creating, user.id, user.is_super_admin, user.role, user.status, userId])

  const invalidatePreview = () => { setPreview(null); setAcknowledge(false); setError(null) }
  const chooseCreateScope = (next: 'all' | 'specific') => {
    invalidatePreview()
    setCreateScope(next)
    const selected = optionalFor(role).filter((operation) => canDelegateCreate(operation, next, createEntityIds))
    setCreatePermissions(selected)
    setGrants(draftCreateGrants(next, createEntityIds, selected))
  }
  const toggleCreateEntity = (id: string) => {
    invalidatePreview()
    const next = createEntityIds.includes(id) ? createEntityIds.filter((value) => value !== id) : [...createEntityIds, id]
    const selected = (createEntityIds.length === 0 ? optionalFor(role) : createPermissions)
      .filter((operation) => canDelegateCreate(operation, 'specific', next))
    setCreateEntityIds(next)
    setCreatePermissions(selected)
    setGrants(draftCreateGrants('specific', next, selected))
  }
  const toggleCreatePermission = (operation: string) => {
    invalidatePreview()
    const next = createPermissions.includes(operation) ? createPermissions.filter((value) => value !== operation) : [...createPermissions, operation]
    setCreatePermissions(next)
    setGrants(draftCreateGrants(createScope, createEntityIds, next))
  }
  const chooseRole = (next: AccessUser['role']) => {
    if (next === role) return
    invalidatePreview()
    setRole(next)
    if (creating) {
      const recommendations = optionalFor(next).filter((operation) => canDelegateCreate(operation, createScope, createEntityIds))
      setCreatePermissions(recommendations)
      setGrants(draftCreateGrants(createScope, createEntityIds, recommendations))
    } else {
      const compatible = (grant: GrantDraft) => {
        const operation = operations.find((item) => item.value === grant.operation)
        return !operation || operation.roles.includes(next)
      }
      // Suggestions belong to the role transition, not the saved policy. If
      // the role changes again, discard only untouched suggestions.
      const currentGrants = grants.filter((grant) => !roleSuggestedGrants.current.has(grantKey(grant)))
      roleSuggestedGrants.current.clear()
      const removedByRole = currentGrants.filter((grant) => !compatible(grant))
      const restored = roleSuppressedGrants.current.filter(compatible)
      roleSuppressedGrants.current = [...roleSuppressedGrants.current.filter((grant) => !compatible(grant)), ...removedByRole]
      const nextGrants = [...currentGrants.filter(compatible), ...restored.filter((grant) => !currentGrants.some((item) => grantKey(item) === grantKey(grant)))]
      if (savedPolicy?.role === 'Viewer' && next === 'Operator') {
        // A role upgrade is an explicit administration action. Preselect the
        // corresponding entity action, then show it in the policy review.
        for (const grant of nextGrants.filter((item) => item.operation === 'qbo.entity.read')) {
          const edit = { operation: 'qbo.entity.edit', client_id: grant.client_id, environment: null }
          if (canDelegate(edit.operation, edit.client_id) && !nextGrants.some((item) => grantKey(item) === grantKey(edit))) {
            nextGrants.push(edit)
            roleSuggestedGrants.current.add(grantKey(edit))
          }
        }
      }
      if (savedPolicy?.role !== 'Admin' && next === 'Admin') {
        // Suggest Admin's standard actions only for scopes already assigned to
        // this person. Entity management is a single console permission.
        const existingScopes = new Set(nextGrants.filter((grant) => !isAdministration(grant.operation)).map((grant) => grant.client_id))
        const suggestions: GrantDraft[] = [...existingScopes].flatMap((client_id) => [
          ...suggestedForScope('Admin', client_id),
        ].map((operation) => ({ operation, client_id, environment: null })))
        const existingKeys = new Set(nextGrants.map(grantKey))
        for (const grant of suggestions) {
          const key = grantKey(grant)
          if (canDelegate(grant.operation, grant.client_id) && !existingKeys.has(key)) {
            nextGrants.push(grant)
            existingKeys.add(key)
            roleSuggestedGrants.current.add(key)
          }
        }
      }
      setGrants(withoutRedundantEntityGrants(nextGrants))
    }
  }
  const closeEditor = () => {
    roleSuppressedGrants.current = []
    roleSuggestedGrants.current.clear()
    if (savedPolicy) {
      setRole(savedPolicy.role); setStatus(savedPolicy.status); setGrants([...savedPolicy.grants])
    }
    setPreview(null); setAcknowledge(false); setError(null); setConfirmDiscard(false); setEditing(false); onClose()
  }
  const resetEditor = () => {
    if (!savedPolicy) return
    roleSuppressedGrants.current = []
    roleSuggestedGrants.current.clear()
    setRole(savedPolicy.role); setStatus(savedPolicy.status); setGrants([...savedPolicy.grants])
    const firstEntityGrant = savedPolicy.grants.find((grant) => !isAdministration(grant.operation))
    const startingScope = firstEntityGrant ? firstEntityGrant.client_id ?? 'all' : ''
    setSelectedScope(startingScope)
    setAddingScope(false); setNewEntityIds([]); setScopeSearch(''); setPreview(null); setAcknowledge(false); setError(null); setConfirmDiscard(false)
  }
  const requestCloseEditor = () => {
    if (pendingChanges) setConfirmDiscard(true)
    else closeEditor()
  }
  const toggleGrant = (grant: GrantDraft) => {
    invalidatePreview()
    roleSuggestedGrants.current.delete(grantKey(grant))
    setGrants((current) => withoutRedundantEntityGrants(current.some((item) => grantKey(item) === grantKey(grant))
      ? current.filter((item) => grantKey(item) !== grantKey(grant))
      : [...current, grant, ...(grant.operation === 'qbo.entity.edit' && !current.some((item) => item.operation === 'qbo.entity.read' && (item.client_id === null || item.client_id === grant.client_id) && item.environment === null) ? [{ operation: 'qbo.entity.read', client_id: grant.client_id, environment: null }] : [])]))
  }
  const toggleNewEntity = (id: string) => {
    setNewEntityIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }
  const addEntityAccess = (ids: string[]) => {
    if (!ids.length) return
    invalidatePreview()
    setGrants((current) => {
      if (convertingAllScope) {
        const globalOperations = [...new Set(current.filter((grant) => !isAdministration(grant.operation) && grant.client_id === null).map((grant) => grant.operation === 'client.read' ? 'qbo.entity.read' : grant.operation))]
        return withoutRedundantEntityGrants([
          ...current.filter((grant) => isAdministration(grant.operation) || grant.client_id !== null && ids.includes(grant.client_id)),
          ...ids.flatMap((client_id) => globalOperations.map((operation) => ({ operation, client_id, environment: null }))),
        ])
      }
      return withoutRedundantEntityGrants([
        ...current.filter((grant) => !addingEditExceptions || !(grant.operation === 'qbo.entity.edit' && grant.client_id === null)),
        ...ids.flatMap((client_id) => (addingEditExceptions ? ['qbo.entity.edit'] : suggestedForNewScope(client_id)).map((operation) => ({ operation, client_id, environment: null }))),
      ])
    })
    setSelectedScope(ids[0])
    setAddingScope(false)
    setAddingEditExceptions(false)
    setConvertingAllScope(false)
    setNewEntityIds([])
    setScopeSearch('')
  }
  const onBackdropMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    if (busy || confirmDelete || confirmDiscard || confirmFounderTransfer || event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestCloseEditor()
  }
  const requestPreview = async () => {
    if (creating && (!validDraftEmail || (!createSuperAdmin && grants.length === 0))) {
      setError('Enter a valid Google email and select at least one permission.')
      return
    }
    setBusy(true); setError(null); setPreview(null)
    try {
      const result = creating
        ? { fingerprint: '', affected_keys: [], suspended_keys: [], changes: [] }
        : await apiRequest<Preview>(`/access/users/${encodeURIComponent(userId)}/policy/preview`, { method: 'POST', body: JSON.stringify(payload) })
      setPreview(result)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to preview this policy.') }
    finally { setBusy(false) }
  }
  const continueToAccess = async () => {
    if (!validDraftEmail) return
    setBusy(true); setError(null); setEmailError(null)
    try {
      const people = await apiRequest<AccessUser[]>('/access/users')
      if (people.some((person) => person.email.trim().toLowerCase() === draftEmail.trim().toLowerCase())) {
        setEmailError('This email already belongs to a person in FinOps. Open their existing access to make changes.')
        return
      }
      setEditSection('scope')
    } catch (err) { setEmailError(err instanceof Error ? `Could not check this email: ${err.message}` : 'Could not check this email. Try again.') }
    finally { setBusy(false) }
  }
  const apply = async () => {
    if (!preview) return
    setBusy(true); setError(null)
    try {
      if (creating) {
        await apiRequest('/access/users', { method: 'POST', body: JSON.stringify({ email: draftEmail.trim(), ...payload, grants: createSuperAdmin ? [] : grants, is_super_admin: createSuperAdmin }) })
      } else {
        await apiRequest(`/access/users/${encodeURIComponent(userId)}/policy`, { method: 'PUT', body: JSON.stringify({ ...payload, expected_fingerprint: preview.fingerprint, acknowledge_key_suspension: acknowledge }) })
      }
      setPreview(null); setAcknowledge(false); setEditing(false); onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to apply this policy.'
      if (creating && (err as { status?: number })?.status === 409 && /email|person|user|conflict/i.test(message)) {
        setPreview(null); setEditSection('role')
        setEmailError('This email already belongs to a person in FinOps. Open their existing access to make changes.')
      } else setError(message)
    }
    finally { setBusy(false) }
  }
  const deletePerson = async () => {
    if (deleteConfirmation !== 'DELETE') return
    setBusy(true); setError(null)
    try {
      await apiRequest(`/access/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      setEditing(false); onDeleted()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to delete this person.') }
    finally { setBusy(false) }
  }
  const transferFounder = async () => {
    if (founderConfirmation !== 'I AM NO LONGER FOUNDER' || !canReceiveFounder) return
    setBusy(true); setError(null)
    try {
      await apiRequest(`/access/users/${encodeURIComponent(userId)}/founder-transfer`, { method: 'POST', body: JSON.stringify({ confirmation: founderConfirmation }) })
      setEditing(false); onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to transfer Founder status.') }
    finally { setBusy(false) }
  }

  const changes = savedPolicy ? [
    ...(creating ? [`Add ${draftEmail.trim()} as ${role}`] : []),
    ...(!creating && role !== savedPolicy.role ? [`Role: ${savedPolicy.role} → ${role}`] : []),
    ...(!creating && status !== savedPolicy.status ? [`Sign-in: ${savedPolicy.status === 'active' ? 'Allowed' : 'Paused'} → ${status === 'active' ? 'Allowed' : 'Paused'}`] : []),
    ...grants.filter((grant) => !savedPolicy.grants.some((saved) => grantKey(saved) === grantKey(grant))).map((grant) => `Add ${permissionName(grant.operation)} · ${grantScope(grant, clients)}`),
    ...savedPolicy.grants.filter((grant) => !grants.some((current) => grantKey(current) === grantKey(grant))).map((grant) => `Remove ${permissionName(grant.operation)} · ${grantScope(grant, clients)}`),
  ] : []
  const entityScopes = new Set([...(savedPolicy?.grants ?? []), ...grants]
    .filter((grant) => !isAdministration(grant.operation))
    .map((grant) => grant.client_id ?? 'all'))
  if (selectedScope) entityScopes.add(selectedScope)
  const assignedScopes = [...entityScopes].map((scope) => {
    const clientId = scope === 'all' ? null : scope
    const saved = (savedPolicy?.grants ?? []).filter((grant) => !isAdministration(grant.operation) && grant.client_id === clientId)
    const draft = grants.filter((grant) => !isAdministration(grant.operation) && grant.client_id === clientId)
    return {
      scope,
      name: scope === 'all' ? 'All entities' : clients.find((client) => client.id === scope)?.name ?? 'Assigned entity (name unavailable)',
      saved,
      draft,
      changed: !samePolicy(saved, draft),
      summary: draft.filter((grant) => grant.operation !== 'entities.manage' && (grant.operation !== 'client.read' || !grants.some((read) => read.operation === 'qbo.entity.read' && (read.client_id === null || read.client_id === grant.client_id)))).map((grant) => `${compactPermissionLabels[grant.operation] ?? permissionName(grant.operation)}${grant.environment ? ` · ${grant.environment === 'prod' ? 'Production' : 'Sandbox'}` : ''}`).join(' · ') || (draft.length ? 'Entity details' : saved.length ? 'Will remove' : 'Choose permissions'),
    }
  }).sort((a, b) => Number(b.saved.length > 0) - Number(a.saved.length > 0) || a.name.localeCompare(b.name))
  const globalEntityOperations = [...new Set(grants.filter((grant) => !isAdministration(grant.operation) && grant.client_id === null).map((grant) => grant.operation === 'client.read' ? 'qbo.entity.read' : grant.operation))]
  const hasAllEntities = globalEntityOperations.length > 0
  const canAddSpecificEdit = hasAllEntities && !globalEntityOperations.includes('qbo.entity.edit') && role !== 'Viewer' && clients.some((client) => canDelegate('qbo.entity.edit', client.id) && !grants.some((grant) => grant.operation === 'qbo.entity.edit' && grant.client_id === client.id))
  const visibleAssignedScopes = assignedScopes.filter((item) => item.draft.length > 0 || !hasAllEntities || item.scope === 'all' || item.saved.some((grant) => !globalEntityOperations.includes(grant.operation)))
  const activeSpecificScopes = assignedScopes.filter((item) => item.scope !== 'all' && item.draft.length > 0)
  const managesEntities = grants.some((grant) => grant.operation === 'entities.manage' && grant.client_id === null && grant.environment === null)
  const managementWithoutQboEdit = managesEntities && grants.some((read) =>
    ['client.read', 'qbo.entity.read'].includes(read.operation) && !grants.some((edit) =>
      edit.operation === 'qbo.entity.edit' && (edit.client_id === null || edit.client_id === read.client_id)))
  const removeSelectedScope = () => {
    invalidatePreview()
    setGrants((current) => {
      if (selectedScope !== 'all') return current.filter((grant) => isAdministration(grant.operation) || grant.client_id !== selectedClientId)
      const remaining = current.filter((grant) => isAdministration(grant.operation) || grant.client_id !== null)
      const specificEdits = remaining.filter((grant) => grant.operation === 'qbo.entity.edit' && grant.client_id !== null)
      return withoutRedundantEntityGrants([
        ...remaining,
        ...specificEdits.filter((grant) => !remaining.some((item) => item.operation === 'qbo.entity.read' && item.client_id === grant.client_id)).map((grant) => ({ operation: 'qbo.entity.read', client_id: grant.client_id, environment: null })),
      ])
    })
    setSelectedScope('')
  }
  const availableScopes = clients.filter((client) => (convertingAllScope ? globalEntityOperations.every((operation) => canDelegate(operation, client.id)) : addingEditExceptions ? canDelegate('qbo.entity.edit', client.id) && !grants.some((grant) => grant.operation === 'qbo.entity.edit' && grant.client_id === client.id) : !entityScopes.has(client.id) && entityRecommendations(role).some((operation) => canDelegate(operation, client.id) && !grants.some((grant) => grant.operation === operation && grant.client_id === null && grant.environment === null))) && client.name.toLowerCase().includes(scopeSearch.trim().toLowerCase()))
  const globalGrant = (operation: string): GrantDraft => ({ operation, client_id: null, environment: null })
  const isGlobalGranted = (operation: string) => grants.some((grant) => grantKey(grant) === grantKey(globalGrant(operation)))
  const wasGlobalGranted = (operation: string) => savedPolicy?.grants.some((grant) => grantKey(grant) === grantKey(globalGrant(operation))) ?? false
  const scopeChange = (operation: string) => {
    const granted = isGranted(operation)
    const saved = savedPolicy?.grants.some((grant) => grantKey(grant) === grantKey(scopeGrant(operation))) ?? false
    return granted === saved ? null : granted ? 'Added' : 'Will remove'
  }
  return editing && <dialog ref={dialogRef} aria-labelledby="edit-access-title" onMouseDown={onBackdropMouseDown} onKeyDownCapture={(event) => { if (event.key === 'Escape') escapeFromMenu.current = Boolean(dialogRef.current?.querySelector('[role="listbox"]')) }} onCancel={(event) => { event.preventDefault(); if (busy || escapeFromMenu.current) return; if (confirmDelete) setConfirmDelete(false); else if (confirmDiscard) setConfirmDiscard(false); else requestCloseEditor() }} className={`fixed left-1/2 top-1/2 m-0 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50 ${creating ? 'max-w-2xl' : 'max-w-4xl'}`}>
      {savedPolicy && !confirmDelete && !confirmDiscard && <button type="button" aria-label={creating ? 'Cancel' : 'Close'} disabled={busy} onClick={requestCloseEditor} className="icon-first-action absolute right-5 top-5 z-10 rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" /><span className="sr-only">{creating ? 'Cancel' : 'Close'}</span></button>}
      {!savedPolicy ? <div className="p-6"><h2 id="edit-access-title" className="break-words pr-12 text-xl font-semibold">{creating ? 'Add person' : `Change access for ${user.display_name || user.email}`}</h2>{error ? <p role="alert" className="mt-4 text-sm text-rose-800">{error}</p> : <p role="status" className="mt-4 text-sm text-slate-600">Loading access…</p>}<div className="mt-6 flex justify-end"><button type="button" onClick={closeEditor} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Close</button></div></div> : confirmDelete ? <div className="p-6"><h2 id="edit-access-title" className="text-xl font-semibold text-rose-800">Permanently delete {user.display_name || user.email}?</h2><p className="mt-3 text-sm text-slate-700">This removes their account, permissions, and API keys. They will immediately lose access. Activity history remains available. This cannot be undone.</p>{pendingChanges && <p className="mt-2 text-sm text-amber-800">Unsaved changes will not be applied.</p>}<label className="mt-5 block text-sm font-medium text-slate-800">Type DELETE to confirm<input autoFocus type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={deleteConfirmation} disabled={busy} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>{error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setConfirmDelete(false); setDeleteConfirmation(''); setError(null) }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="button" disabled={busy || deleteConfirmation !== 'DELETE'} onClick={() => void deletePerson()} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" />{busy ? 'Deleting…' : 'Delete person'}</button></div></div> : confirmDiscard ? <div className="p-6"><h2 id="edit-access-title" className="text-xl font-semibold">Discard your changes?</h2><p className="mt-2 text-sm text-slate-600">{creating ? 'This person has not been added.' : `The changes to ${user.display_name || user.email} have not been saved.`}</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Keep editing</button><button type="button" onClick={closeEditor} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Discard changes</button></div></div> : !preview ? <><div data-dialog-header className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-5 sm:px-6 sm:pt-6"><h2 id="edit-access-title" ref={editorHeading} tabIndex={-1} className="break-words pr-12 text-xl font-semibold">{creating ? 'Add person' : `Change access for ${user.display_name || user.email}`}</h2>
        {creating ? <div role="group" aria-label="Add person steps" className={`mt-6 grid border-b border-slate-200 ${isFounder ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {([...(isFounder ? [{ section: 'type', number: '1', label: 'Account type' }] : []), { section: 'role', number: isFounder ? '2' : '1', label: 'Person' }, { section: 'scope', number: isFounder ? '3' : '2', label: createSuperAdmin ? 'Review' : 'Access' }] as const).map((step) => {
            const active = step.section === 'type' ? showCreationChoice : !showCreationChoice && editSection === step.section
            const complete = step.section === 'type' ? !showCreationChoice : step.section === 'role' && editSection === 'scope'
            return <button key={step.section} type="button" aria-label={`${step.number} · ${step.label}`} aria-current={active ? 'step' : undefined} aria-pressed={active} disabled={busy || step.section === 'scope' && !validDraftEmail || step.section === 'role' && showCreationChoice && creationChoice === 'choice'} onClick={() => { setError(null); if (step.section === 'type') { setCreateTypeStep(true); setEditSection('role') } else if (step.section === 'scope') void continueToAccess(); else { setCreateTypeStep(false); setEditSection('role') } }} className={`relative flex min-h-14 items-center justify-center gap-3 border-b-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed ${active ? 'border-hq-teal text-slate-950' : complete ? 'border-teal-200 text-slate-700 hover:bg-slate-50' : 'border-transparent text-slate-500 enabled:hover:bg-slate-50 enabled:hover:text-slate-800'}`}><span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${active ? 'border-hq-teal bg-hq-teal text-white' : complete ? 'border-teal-300 bg-teal-50 text-hq-teal' : 'border-slate-300 bg-white text-slate-500'}`}>{step.number}</span><span>{step.label}</span></button>
          })}
        </div> : !isSuperAdmin ? <div role="group" aria-label="Choose what to change" className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5"><button type="button" aria-pressed={editSection === 'role'} onClick={() => { setError(null); setEditSection('role') }} className={`rounded-lg px-3 py-3 text-sm font-semibold text-slate-950 ${editSection === 'role' ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}>Role & sign-in</button><button type="button" aria-pressed={editSection === 'scope'} onClick={() => { setError(null); setEditSection('scope') }} className={`rounded-lg px-3 py-3 text-sm font-semibold text-slate-950 ${editSection === 'scope' ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}>Actions & entities</button></div> : null}
        </div><div data-dialog-body className="min-h-0 overflow-y-auto p-5 sm:p-6">{!creating && editSection === 'scope' && <p role="note" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Only access you can manage is shown here; other permissions stay unchanged.</p>}
        {showCreationChoice && editSection === 'role' && <section aria-label="Choose account type" className="mt-6"><h3 className="font-semibold text-slate-950">What kind of account are you adding?</h3><p className="mt-1 text-sm text-slate-600">Choose the access model before entering the person’s details.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" aria-pressed={creationChoice === 'person'} disabled={busy} onClick={() => { setCreationChoice('person'); setCreateSuperAdmin(false); setRole('Viewer'); setGrants([]); setCreatePermissions([]) }} className={`rounded-xl border p-4 text-left transition-colors ${creationChoice === 'person' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-hq-teal hover:bg-teal-50'}`}><strong className="block text-sm text-slate-950">Regular person</strong><span className="mt-1 block text-xs text-slate-600">Choose a role, entities, and individual actions.</span></button><button type="button" aria-pressed={creationChoice === 'superadmin'} disabled={busy} onClick={() => { setCreationChoice('superadmin'); setCreateSuperAdmin(true); setRole('Admin'); setStatus('active'); setGrants([]); setCreatePermissions([]); setCreateScope('') }} className={`rounded-xl border p-4 text-left transition-colors ${creationChoice === 'superadmin' ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500' : 'border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50'}`}><strong className="block text-sm text-violet-950">Superadmin</strong><span className="mt-1 block text-xs text-violet-900">Universal access to FinOps and all connected entities.</span></button></div></section>}
        {creating && editSection === 'role' && !showCreationChoice && <div className="mt-6"><label htmlFor="new-person-email" className="block text-sm font-medium text-slate-700">Google email</label><input id="new-person-email" ref={emailInputRef} type="email" required value={draftEmail} disabled={busy} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'person-email-error' : undefined} onChange={(event) => { setDraftEmail(event.target.value); setEmailError(null); invalidatePreview() }} placeholder="name@company.com" className={`mt-2 w-full rounded-lg border px-3 py-2.5 ${emailError ? 'border-rose-500' : 'border-slate-300'}`} />{emailError && <p id="person-email-error" role="alert" className="mt-2 text-sm text-rose-700">{emailError}</p>}</div>}
        {creating && editSection === 'scope' && <div className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{draftEmail.trim()} <span className="text-slate-400">·</span> {role}</div>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {!creating && isSuperAdmin && <section aria-label="Superadmin access" className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-4"><h3 className="font-semibold text-violet-950">Superadmin · Full access</h3><p className="mt-1 text-sm text-violet-900">This account has universal access. Individual permissions and entity grants do not apply.</p>{user.is_super_admin_founder && <p className="mt-2 text-sm font-medium text-violet-950">Founder</p>}{isFounder && canReceiveFounder && <div className="mt-4"><button type="button" disabled={busy} onClick={() => { setFounderConfirmation(''); setError(null); setConfirmFounderTransfer((current) => !current) }} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100">{confirmFounderTransfer ? 'Cancel Founder transfer' : 'Transfer Founder status'}</button><p className="mt-2 text-xs text-violet-900">Your account will remain a superadmin after the transfer.</p>{confirmFounderTransfer && <div className="mt-4 rounded-lg border border-violet-200 bg-white p-3"><p className="text-sm text-slate-700">{user.display_name || user.email} will become Founder. Your account will remain a superadmin, but will no longer be Founder.</p><label className="mt-3 block text-sm font-medium text-slate-800">Type I AM NO LONGER FOUNDER to confirm<input type="text" autoComplete="off" spellCheck={false} value={founderConfirmation} disabled={busy} onChange={(event) => setFounderConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>{error && <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p>}<button type="button" disabled={busy || founderConfirmation !== 'I AM NO LONGER FOUNDER' || !canReceiveFounder} onClick={() => void transferFounder()} className="mt-3 rounded-lg bg-violet-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Transferring…' : 'Confirm transfer'}</button></div>}</div>}</section>}
        {!showCreationChoice && !isSuperAdmin && !(creating && createSuperAdmin) && editSection !== 'scope' && <section aria-label="Role and sign-in settings" className="mt-6 space-y-5">
          <div>
            <h3 className="font-semibold text-slate-950">Role</h3>
            <div role="group" aria-label="Role" className="mt-3 grid gap-2 sm:grid-cols-3">
              {roles.map((item) => <button key={item} type="button" aria-pressed={role === item} disabled={busy} onClick={() => chooseRole(item)} className={`min-h-20 rounded-xl border p-3 text-left transition ${role === item ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-slate-400'}`}><span className="block font-semibold text-slate-950">{item} {!creating && savedPolicy?.role === item && role !== item && <span className="text-xs font-normal text-slate-500">· Saved</span>}</span><span className="mt-1 block text-xs text-slate-600">{{ Viewer: 'Read', Operator: 'Read & edit', Admin: 'Administration' }[item]}</span></button>)}
            </div>
            {(creating || savedPolicy?.role !== role) && <div role={creating ? 'note' : 'status'} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-1 text-sm"><strong className="text-slate-950">{creating ? role : `${savedPolicy?.role} → ${role}`}</strong><InfoTooltip label="About suggested access" text="Recommended access is preselected. Review and adjust it before saving." /></div>
              <p className="mt-1 text-sm leading-5 text-slate-600">{implicitRoleEffect(role, creating ? undefined : savedPolicy?.role)}</p>
              {roleLimitedCount > 0 && <p className="mt-1 text-xs text-amber-800">{roleLimitedCount} incompatible {roleLimitedCount === 1 ? 'permission will' : 'permissions will'} be removed.</p>}
            </div>}
          </div>
          {!creating && missingOperatorEdits.length > 0 && <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"><p>This Operator has Read without Edit for {missingOperatorEdits.length} {missingOperatorEdits.length === 1 ? 'scope' : 'scopes'}.</p><button type="button" onClick={() => { invalidatePreview(); setGrants((current) => [...current, ...missingOperatorEdits]) }} className="mt-2 font-semibold text-hq-teal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">Suggest Edit for these scopes</button></div>}
          {!creating && <div className="border-t border-slate-200 pt-5">
            <h3 className="font-semibold text-slate-950">Sign-in</h3>
            <div role="group" aria-label="Sign-in status" className="mt-3 grid gap-2 sm:grid-cols-2">
              {([{ value: 'active', label: 'Allow sign-in', icon: LogIn }, { value: 'disabled', label: 'Pause sign-in', icon: CirclePause }] as const).map((item) => <button key={item.value} type="button" aria-pressed={status === item.value} disabled={busy} onClick={() => { invalidatePreview(); setStatus(item.value) }} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50 ${status === item.value ? 'border-hq-teal bg-teal-50/70' : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'}`}><item.icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${status === item.value ? 'text-hq-teal' : 'text-slate-500'}`} /><span className="min-w-0 flex-1 text-sm font-semibold text-slate-950">{item.label}</span>{status === item.value && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-hq-teal" />}</button>)}
            </div>
          </div>}
        </section>}
        {creating && createSuperAdmin && editSection === 'scope' && <section aria-label="Superadmin access summary" className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-4"><h3 className="font-semibold text-violet-950">Universal access</h3><p className="mt-1 text-sm text-violet-900">This person will be created as a superadmin. No entity scope or individual permission grants are needed.</p></section>}
        {!isSuperAdmin && !(creating && createSuperAdmin) && editSection === 'scope' && <section aria-label="Actions and entities" className="mt-6 space-y-5">
          {creating && <div className="space-y-4">
            <div role="group" aria-label="Access scope" className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={createScope === 'specific'} onClick={() => chooseCreateScope('specific')} className={`rounded-xl border p-4 text-left ${createScope === 'specific' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 hover:border-slate-400'}`}><span className="block text-sm font-semibold">Selected entities</span><span className="mt-1 block text-xs text-slate-600">Choose one or more</span></button>
              <button type="button" aria-pressed={createScope === 'all'} disabled={!canDelegate('qbo.entity.read', null)} onClick={() => chooseCreateScope('all')} className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${createScope === 'all' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 hover:border-slate-400'}`}><span className="block text-sm font-semibold">All entities</span><span className="mt-1 block text-xs text-slate-600">Current and future</span></button>
            </div>
            {createScope === 'specific' && <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="sr-only" htmlFor="create-entity-search">Find an entity</label><input id="create-entity-search" type="search" value={entitySearch} onChange={(event) => setEntitySearch(event.target.value)} placeholder="Find an entity" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-hq-teal focus:outline-none focus:ring-2 focus:ring-hq-teal/20" />
              <div role="group" aria-label="Select entities" className="mt-2 max-h-44 space-y-1 overflow-y-auto">{clients.filter((client) => canDelegate('qbo.entity.read', client.id) && client.name.toLowerCase().includes(entitySearch.toLowerCase())).map((client) => <button key={client.id} type="button" aria-pressed={createEntityIds.includes(client.id)} onClick={() => toggleCreateEntity(client.id)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${createEntityIds.includes(client.id) ? 'bg-teal-50 font-medium text-hq-teal' : 'text-slate-700 hover:bg-slate-50'}`}>{client.name}</button>)}{clients.length === 0 && <p className="px-3 py-2 text-sm text-slate-600">No entities available</p>}</div>
            </div>}
            {createScope && (createScope === 'all' || createEntityIds.length > 0) && <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4">
              <div role="group" aria-label="Entity and QuickBooks access" className="py-4">
                <h3 className="text-sm font-semibold">QuickBooks access</h3><p className="mt-1 text-xs text-slate-600">Read QBO is preselected when you can grant it. Entity management is separate.</p>
                <div className="mt-3 flex flex-wrap gap-2">{operations.filter((item) => ['qbo.entity.edit', 'qbo.entity.delete'].includes(item.value) && item.roles.includes(role)).map(createPermissionChip)}</div>
              </div>
              {role === 'Admin' && <div role="group" aria-label="Console administration" className="py-4">
                <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Console access</h3></div>
                <div className="mt-3 flex flex-wrap gap-2">{operations.filter((item) => item.global && (item.value !== 'entities.manage' || access?.user.is_super_admin)).map(createPermissionChip)}</div>
                {createPermissions.includes('entities.manage') && <p role="note" className="mt-2 text-xs text-slate-600">Manage entities also allows this person to issue dedicated entity API keys. Create anywhere; edit/delete within assigned coverage.</p>}
              </div>}
            </div>}
          </div>}
          {!creating && <>
          <section aria-label="Entity access editor" className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div><h3 className="text-sm font-semibold text-slate-950">Entity coverage</h3><p className="mt-0.5 text-xs text-slate-600">{hasAllEntities ? `All current and future entities${activeSpecificScopes.length ? ` · ${activeSpecificScopes.length} with additional access` : ''}` : `${activeSpecificScopes.length} selected ${activeSpecificScopes.length === 1 ? 'entity' : 'entities'}`}</p></div>
              {(addingScope || !hasAllEntities || canAddSpecificEdit) && <button type="button" disabled={busy} onClick={() => { setAddingScope((current) => !current); setAddingEditExceptions(!addingScope && canAddSpecificEdit); setConvertingAllScope(!addingScope && hasAllEntities && !canAddSpecificEdit); setSelectedScope(''); setNewEntityIds([]); setScopeSearch('') }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-hq-teal shadow-sm hover:border-hq-teal hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50">{addingScope ? <ArrowLeft aria-hidden="true" className="h-4 w-4" /> : <span aria-hidden="true" className="text-lg leading-none">+</span>}{addingScope ? 'Back to access' : canAddSpecificEdit ? 'Add Edit to selected entities' : 'Add entity access'}</button>}
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[minmax(14rem,0.9fr)_minmax(0,1.1fr)]">
            {addingScope ? <section aria-label="Add entity access" className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h4 className="text-sm font-semibold text-slate-950">{convertingAllScope ? 'Choose entities to keep' : addingEditExceptions ? 'Choose entities for Edit' : 'Choose an entity'}</h4>
              {convertingAllScope && <p className="mt-2 text-xs text-slate-600">Current all-entity access will move to your selection, including entity management if enabled.</p>}
              <label className="sr-only" htmlFor="edit-scope-search">Find an entity</label><input id="edit-scope-search" type="search" value={scopeSearch} onChange={(event) => setScopeSearch(event.target.value)} placeholder="Find an entity" className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-hq-teal focus:outline-none focus:ring-2 focus:ring-hq-teal/20" />
              {!addingEditExceptions && !scopeSearch && !entityScopes.has('all') && <button type="button" aria-label="Add access for All entities" disabled={busy || suggestedForNewScope(null).length === 0} onClick={() => { invalidatePreview(); setGrants((current) => withoutRedundantEntityGrants([...current, ...suggestedForNewScope(null).map((operation) => ({ operation, client_id: null, environment: null }))])); setSelectedScope('all'); setAddingScope(false); setNewEntityIds([]) }} className="mt-2 flex w-full flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-hq-teal disabled:opacity-50"><span className="text-sm font-medium">All entities</span><span className="text-xs text-slate-500">Current and future · Replaces duplicate entity grants for the same actions</span></button>}
              <div role="group" aria-label="Available entities" className="mt-2 max-h-72 space-y-0.5 overflow-y-auto border-t border-slate-200 pt-2">{availableScopes.map((client) => <button key={client.id} type="button" aria-label={`Select ${client.name}`} aria-pressed={newEntityIds.includes(client.id)} disabled={busy} onClick={() => toggleNewEntity(client.id)} className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm disabled:opacity-50 ${newEntityIds.includes(client.id) ? 'border-hq-teal bg-teal-50 font-medium text-slate-950' : 'border-transparent text-slate-800 hover:border-slate-300 hover:bg-white'}`}>{client.name}</button>)}{availableScopes.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">{scopeSearch ? 'No matching entities.' : 'All available entities are already listed.'}</p>}</div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-3"><span className="text-xs text-slate-600">{newEntityIds.length} selected</span><button type="button" disabled={busy || newEntityIds.length === 0} onClick={() => addEntityAccess(newEntityIds)} className="rounded-lg bg-hq-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{convertingAllScope ? 'Keep selected entities' : addingEditExceptions ? 'Apply Edit scope' : 'Add selected'}</button></div>
            </section> : <section aria-label="Assigned entity access" className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h4 className="px-1 text-sm font-semibold text-slate-950">Coverage</h4>
              {visibleAssignedScopes.length ? <div className="mt-3 space-y-3">{[...visibleAssignedScopes].sort((a, b) => Number(b.scope === 'all') - Number(a.scope === 'all') || a.name.localeCompare(b.name)).map((item, index) => <div key={item.scope}>{item.scope !== 'all' && hasAllEntities && index === 1 && <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Additional entity access</p>}<button type="button" aria-label={`Edit access for ${item.name}`} aria-pressed={selectedScope === item.scope} disabled={busy} onClick={() => selectEditScope(item.scope)} className={`w-full rounded-lg border px-3 py-3 text-left shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50 ${selectedScope === item.scope ? 'border-hq-teal bg-teal-50' : 'border-slate-200 bg-white hover:border-hq-teal'}`}><span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold text-slate-900">{item.name}</span>{item.changed && <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-hq-teal">{item.draft.length === 0 ? 'Will remove' : item.saved.length === 0 ? 'New' : 'Changed'}</span>}</span>{item.scope === 'all' && <span className="mt-1 block text-xs font-medium text-hq-teal">Base access · Current and future entities</span>}<span className="mt-1 block text-xs text-slate-600">{item.scope !== 'all' && hasAllEntities ? `Additional access: ${item.summary}` : item.summary}</span></button></div>)}</div> : <p className="px-1 pt-3 text-sm text-slate-600">No manageable entity access shown. Other access, if any, is unchanged.</p>}
            </section>}
            {!addingScope && selectedScope && <section aria-label="Editing selected scope" className="min-w-0 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4">
              <div className="py-3"><h4 className="text-sm font-semibold text-slate-950">{selectedScope === 'all' ? 'All entities' : clients.find((client) => client.id === selectedScope)?.name ?? 'Assigned entity'}</h4>{selectedScope === 'all' && <p className="mt-0.5 text-xs text-slate-500">Current and future · Entity and QuickBooks access only</p>}</div>
              <div className="py-4">
                <h4 className="text-sm font-semibold text-slate-950">QuickBooks access</h4>
                <p className="mt-1 text-xs text-slate-600">Read is included; Edit is optional.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(isGranted('qbo.entity.read') || isInheritedFromAll('qbo.entity.read')) && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-900">Read QBO</span><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">Included</span></div>
                    {isInheritedFromAll('qbo.entity.read') && <p className="mt-2 text-xs text-slate-600">From all-entity access</p>}
                  </div>}
                  {operations.filter((item) => ['qbo.entity.edit', 'qbo.entity.delete'].includes(item.value) && (item.roles.includes(role) || isGranted(item.value) || savedPolicy?.grants.some((grant) => grantKey(grant) === grantKey(scopeGrant(item.value))))).map((item) => {
                    const active = isGranted(item.value) || isInheritedFromAll(item.value)
                    const inherited = isInheritedFromAll(item.value)
                    return <button key={item.value} type="button" aria-label={permissionName(item.value)} aria-pressed={active} disabled={busy || inherited || !item.roles.includes(role) || !canDelegate(item.value, selectedClientId)} onClick={() => toggleGrant(scopeGrant(item.value))} className={active ? 'rounded-xl border border-hq-teal bg-teal-50 p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed' : 'rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed disabled:opacity-60'}>
                      <span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-900">{item.value === 'qbo.entity.delete' ? 'Delete QBO' : 'Edit QBO'}</span><span className={active ? 'rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-hq-teal' : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600'}>{inherited ? 'From all entities' : scopeChange(item.value) ?? (active ? 'Enabled' : 'Optional')}</span></span>
                      {inherited && <span className="mt-2 block text-xs text-slate-600">Change this under All entities.</span>}
                    </button>
                  })}
                </div>
                {selectedScope === 'all' && <div className="mt-5 border-t border-slate-200 pt-4">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Change coverage</h5>
                  <div className="mt-3 grid gap-2">
                    <button type="button" aria-label="Use selected entities instead" disabled={busy} onClick={() => { setAddingScope(true); setAddingEditExceptions(false); setConvertingAllScope(true); setSelectedScope(''); setNewEntityIds([]); setScopeSearch('') }} className="rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-hq-teal hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50">
                      <span className="block text-sm font-semibold text-hq-teal">Use selected entities instead <span aria-hidden="true">→</span></span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-600">Move current access to only the entities you choose.</span>
                    </button>
                    {isGranted('qbo.entity.edit') && role !== 'Viewer' && <button type="button" aria-label="Limit Edit to selected entities" disabled={busy} onClick={() => { setAddingScope(true); setAddingEditExceptions(true); setConvertingAllScope(false); setSelectedScope(''); setNewEntityIds([]); setScopeSearch('') }} className="rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-hq-teal hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50">
                      <span className="block text-sm font-semibold text-hq-teal">Limit Edit to selected entities <span aria-hidden="true">→</span></span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-600">Keep Read for every entity; allow Edit only on the entities you choose.</span>
                    </button>}
                  </div>
                </div>}
                {grants.some((grant) => !isAdministration(grant.operation) && grant.client_id === selectedClientId) && <div className="mt-5 border-t border-slate-200 pt-4"><button type="button" disabled={busy} onClick={removeSelectedScope} className="rounded-lg px-2 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50">{selectedScope === 'all' ? 'Remove all-entity access' : 'Remove access to this entity'}</button></div>}
              </div>
            </section>}
            {addingScope ? <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-5 text-center text-sm text-slate-600"><strong className="text-slate-900">{newEntityIds.length ? `${newEntityIds.length} ${newEntityIds.length === 1 ? 'entity' : 'entities'} selected` : convertingAllScope ? 'Choose entities to keep' : 'Select entities to add'}</strong><span className="mt-2">{convertingAllScope ? 'Global access will be removed only when you review and save these changes. Your selection will keep the existing Read and Edit actions.' : addingEditExceptions ? 'Read stays on All entities. Edit will apply only to the entities selected here, including future changes to this selection.' : newEntityIds.length ? 'You can adjust QuickBooks access here and entity management under Console access.' : 'Choose one or more on the left. Current access stays unchanged.'}</span></div> : !selectedScope && <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 px-5 text-center text-sm text-slate-500">Choose an assigned entity or add access to another.</div>}
            </div>
          </section>
          {(role === 'Admin' || savedPolicy?.grants.some((grant) => isAdministration(grant.operation))) && <section aria-label="Console access" className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">Console access</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{operations.filter((item) => item.global && (item.value !== 'entities.manage' || access?.user.is_super_admin || wasGlobalGranted(item.value))).map((item) => { const checked = isGlobalGranted(item.value); const saved = wasGlobalGranted(item.value); return <button key={item.value} type="button" aria-label={permissionName(item.value)} aria-pressed={checked} disabled={busy || role !== 'Admin' || !canDelegate(item.value, null)} onClick={() => toggleGrant(globalGrant(item.value))} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-hq-teal bg-teal-50' : 'border-slate-200 hover:border-slate-400'}`}><span className="flex-1">{compactPermissionLabels[item.value]}</span>{checked !== saved && <span className="text-xs font-semibold text-hq-teal">{checked ? 'Added' : 'Will remove'}</span>}</button> })}</div>
            {managesEntities && <p role="note" className="mt-2 text-xs text-slate-600">Can issue dedicated entity API keys. Create anywhere · Edit/delete assigned entities.</p>}
            {managementWithoutQboEdit && <p role="note" className="mt-2 text-xs text-amber-800">Some assigned entities have no Edit QBO. Entity management remains separate.</p>}
          </section>}
          {exceptionalGrants.length > 0 && <details className="rounded-lg border border-amber-200 px-4 py-3 text-sm"><summary className="cursor-pointer font-medium text-slate-800">Access to resolve ({exceptionalGrants.length})</summary><ul className="mt-3 divide-y divide-slate-100">{exceptionalGrants.map((grant) => <li key={grantKey(grant)} className="flex items-center justify-between gap-3 py-2"><span>{permissionName(grant.operation)} <span className="text-slate-500">· {grantScope(grant, clients)}</span></span><button type="button" aria-label={`Remove ${permissionName(grant.operation)} for ${grantScope(grant, clients)}`} disabled={busy} onClick={() => toggleGrant(grant)} className="icon-first-action shrink-0 rounded-lg px-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Remove</span></button></li>)}</ul></details>}
          {incompatibleGrants.length > 0 && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{incompatibleGrants.length} assigned {incompatibleGrants.length === 1 ? 'permission is' : 'permissions are'} outside the selected role. Remove them before reviewing changes.</p>}
          </>}
        </section>}</div>
        {creating ? <div data-dialog-footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div className="min-w-0">{editSection === 'scope' && <span role="status" className="hidden truncate text-xs text-slate-500 sm:inline">{createSuperAdmin ? 'Universal access' : createScope === '' ? 'Choose entity coverage' : createScope === 'specific' && createEntityIds.length === 0 ? 'Choose entities' : createScope === 'all' ? 'All current and future entities' : `${createEntityIds.length} ${createEntityIds.length === 1 ? 'entity' : 'entities'} selected`}</span>}</div>
          {editSection === 'role' ? <div className="flex items-center gap-2">{!showCreationChoice && isFounder && <button type="button" aria-label="Back to account type" onClick={() => setCreateTypeStep(true)} className="icon-first-action rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700"><ArrowLeft aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Back</span></button>}<button type="button" aria-label={showCreationChoice ? 'Continue to person' : createSuperAdmin ? 'Continue to review' : 'Continue to access'} disabled={busy || (showCreationChoice ? creationChoice === 'choice' : !validDraftEmail)} onClick={() => { if (showCreationChoice) setCreateTypeStep(false); else void continueToAccess() }} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><ArrowRight aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{showCreationChoice ? 'Continue to person' : createSuperAdmin ? 'Continue to review' : 'Continue to access'}</span></button></div>
            : <div className="flex items-center gap-2"><button type="button" aria-label="Back" onClick={() => { setError(null); setEditSection('role') }} className="icon-first-action rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><ArrowLeft aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Back</span></button><button type="button" aria-label="Review person" disabled={busy || (!createSuperAdmin && (grants.length === 0 || createScope === '' || createScope === 'specific' && createEntityIds.length === 0))} onClick={() => void requestPreview()} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Review person</span></button></div>}
        </div> : !isSuperAdmin && <div data-dialog-footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {!isSuperAdmin && <button type="button" aria-label="Delete user" disabled={busy} onClick={() => { setError(null); setConfirmDelete(true) }} className="icon-first-action rounded-lg px-2 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Delete user</span></button>}
            {pendingChanges && <span className="text-xs text-slate-600">{changes.length} unsaved {changes.length === 1 ? 'change' : 'changes'}</span>}
          </div>
          <div className="flex items-center gap-2">
            {pendingChanges && <button type="button" aria-label="Discard changes" disabled={busy} onClick={resetEditor} className="icon-first-action rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><RotateCcw aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Reset draft</span></button>}
            <button type="button" aria-label="Review changes" disabled={busy || !pendingChanges || incompatibleGrants.length > 0} onClick={() => void requestPreview()} className="icon-first-action rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{busy ? 'Checking…' : 'Review changes'}</span></button>
          </div>
        </div>}
        </> : <><PolicyReviewSummary creating={creating} name={creating ? null : user.display_name} email={creating ? draftEmail.trim() : user.email} role={role} savedRole={savedPolicy?.role ?? role} status={status} savedStatus={savedPolicy?.status ?? status} grants={grants} savedGrants={savedPolicy?.grants ?? []} clients={clients} preview={preview} acknowledge={acknowledge} setAcknowledge={setAcknowledge} error={error} headingRef={previewHeading} /><div data-dialog-footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6"><button type="button" disabled={busy} onClick={() => { setPreview(null); setAcknowledge(false); setError(null) }} className="icon-first-action rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"><ArrowLeft aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Back to editing</span></button><button type="button" disabled={busy || suspendedKeys.length > 0 && !acknowledge} onClick={() => void apply()} className="icon-first-action rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{busy ? 'Saving…' : creating ? 'Add person' : 'Save changes'}</span></button></div></>}
    </dialog>
}

function PolicyReviewSummary({ creating, name, email, role, savedRole, status, savedStatus, grants, savedGrants, clients, preview, acknowledge, setAcknowledge, error, headingRef }: {
  creating: boolean; name: string | null; email: string; role: AccessUser['role']; savedRole: AccessUser['role']; status: AccessUser['status']; savedStatus: AccessUser['status']
  grants: GrantDraft[]; savedGrants: GrantDraft[]; clients: QboClient[]; preview: Preview
  acknowledge: boolean; setAcknowledge: (value: boolean) => void; error: string | null; headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const groups = new Map<string, { label: string; added: boolean }[]>()
  const scopedLabel = (grant: GrantDraft) => isAdministration(grant.operation)
    ? 'FinOps console'
    : clients.find((client) => client.id === grant.client_id)?.name || (grant.client_id ? 'Assigned entity' : 'All entities')
  const addChange = (grant: GrantDraft, added: boolean) => {
    const scope = scopedLabel(grant)
    const entries = groups.get(scope) ?? []
    const operation = operations.find((item) => item.value === grant.operation)
    entries.push({ label: `${compactPermissionLabels[grant.operation] || permissionName(grant.operation)}${grant.environment ? ` · ${grant.environment === 'prod' ? 'Production' : 'Sandbox'}` : ''}${!added && operation && !operation.roles.includes(role) ? ' · Role limit' : ''}`, added })
    groups.set(scope, entries)
  }
  const represented = new Set<string>()
  for (const operation of ['qbo.entity.read', 'qbo.entity.edit']) {
    const oldGlobal = savedGrants.find((grant) => grant.operation === operation && grant.client_id === null && grant.environment === null)
    const newGlobal = grants.find((grant) => grant.operation === operation && grant.client_id === null && grant.environment === null)
    const oldSpecific = savedGrants.filter((grant) => grant.operation === operation && grant.client_id !== null && grant.environment === null)
    const newSpecific = grants.filter((grant) => grant.operation === operation && grant.client_id !== null && grant.environment === null)
    if (!oldGlobal && newGlobal && oldSpecific.length) {
      groups.set('Scope change', [...(groups.get('Scope change') ?? []), { label: `${compactPermissionLabels[operation]}: ${oldSpecific.length} selected ${oldSpecific.length === 1 ? 'entity' : 'entities'} → all entities`, added: true }])
      represented.add(grantKey(newGlobal))
      oldSpecific.forEach((grant) => represented.add(grantKey(grant)))
    } else if (oldGlobal && !newGlobal && newSpecific.length) {
      groups.set('Scope change', [...(groups.get('Scope change') ?? []), { label: `${compactPermissionLabels[operation]}: all entities → ${newSpecific.length} selected ${newSpecific.length === 1 ? 'entity' : 'entities'}`, added: true }])
      represented.add(grantKey(oldGlobal))
      newSpecific.forEach((grant) => represented.add(grantKey(grant)))
    }
  }
  grants.filter((grant) => !represented.has(grantKey(grant)) && !savedGrants.some((saved) => grantKey(saved) === grantKey(grant))).forEach((grant) => addChange(grant, true))
  savedGrants.filter((grant) => !represented.has(grantKey(grant)) && !grants.some((current) => grantKey(current) === grantKey(grant))).forEach((grant) => addChange(grant, false))
  const suspended = preview.suspended_keys ?? []
  const affected = preview.affected_keys ?? []
  const reactivating = savedStatus === 'disabled' && status === 'active'
  return <div role="region" aria-label="Policy impact preview" className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
    <div><h2 id="edit-access-title" ref={headingRef} tabIndex={-1} className="pr-12 text-xl font-semibold">{creating ? 'Review new person' : 'Review access changes'}</h2><p className="mt-1 break-all text-sm text-slate-600">{name && <><span className="font-semibold text-slate-900">{name}</span> · </>}{email}</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className={`grid gap-2 ${creating ? '' : 'sm:grid-cols-2'}`}>
      <div className={`rounded-xl border px-4 py-3 ${!creating && role !== savedRole ? 'border-hq-teal bg-teal-50' : 'border-slate-200'}`}><span className="block text-xs text-slate-500">Role{!creating && role !== savedRole ? ' · Changing' : ''}</span><strong className="mt-1 block text-sm text-slate-950">{!creating && role !== savedRole ? `${savedRole} → ${role}` : role}</strong></div>
      {!creating && <div className={`rounded-xl border px-4 py-3 ${status !== savedStatus ? 'border-hq-teal bg-teal-50' : 'border-slate-200'}`}><span className="block text-xs text-slate-500">Sign-in{status !== savedStatus ? ' · Changing' : ''}</span><strong className={`mt-1 block text-sm ${status === 'active' ? 'text-emerald-800' : 'text-slate-700'}`}>{status !== savedStatus ? `${savedStatus === 'active' ? 'Allowed' : 'Paused'} → ${status === 'active' ? 'Allowed' : 'Paused'}` : status === 'active' ? 'Allowed' : 'Paused'}</strong></div>}
    </div>
    {role === 'Admin' && (creating || savedRole !== 'Admin') && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">Admin can manage sensitive access only through the permissions shown below.</p>}
    <section aria-label="Permission changes"><h3 className="text-sm font-semibold text-slate-900">{creating ? 'Access to grant' : 'Permission changes'}</h3>
      {groups.size ? <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">{[...groups].map(([scope, entries]) => <div key={scope} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0"><span className="min-w-32 flex-1 text-sm font-semibold text-slate-900">{scope}</span><div className="flex flex-wrap gap-1.5">{entries.map((entry, index) => <span key={`${index}-${entry.label}`} className={`rounded-md px-2 py-1 text-xs font-medium ${entry.added ? 'bg-teal-50 text-hq-teal' : 'bg-rose-50 text-rose-700'}`}>{entry.added ? '+' : '−'} {entry.label}</span>)}</div></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No permission changes</p>}
    </section>
    {!creating && <section className={`rounded-xl border px-4 py-3 ${suspended.length || reactivating ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`} aria-label="API key impact"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">API keys</h3><span className={`text-sm font-medium ${suspended.length || reactivating ? 'text-amber-900' : 'text-slate-600'}`}>{suspended.length ? `${suspended.length} will stop working` : reactivating ? 'Suspended keys stay suspended' : affected.length ? `${affected.length} ${affected.length === 1 ? 'key changes access' : 'keys change access'}` : 'No impact'}</span></div>{reactivating && <p className="mt-2 text-xs text-amber-950">Allowing sign-in again does not reactivate suspended API keys. The user must create new keys to restore integrations.</p>}{suspended.length > 0 && <><p className="mt-2 text-xs text-amber-950">{suspended.map(itemLabel).join(', ')}</p><label className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-950"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} />I understand these keys will stop working.</label></>}{!suspended.length && affected.length > 0 && <p className="mt-2 text-xs text-slate-600">{affected.map(itemLabel).join(', ')}</p>}</section>}
    {Boolean(preview.changes?.length) && <details className="text-xs text-slate-600"><summary className="cursor-pointer">Technical details</summary><ul className="mt-2 list-inside list-disc space-y-1">{preview.changes?.map((value, index) => <li key={`${index}-${itemLabel(value)}`}>{itemLabel(value)}</li>)}</ul></details>}
  </div>
}
