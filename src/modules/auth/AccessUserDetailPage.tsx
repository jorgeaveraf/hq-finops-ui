import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { ArrowLeft, ArrowRight, Check, CirclePause, LogIn, RotateCcw, Shield, Trash2, X } from 'lucide-react'
import { InfoTooltip } from '../../components/InfoTooltip'
import { permissionName } from './accessLabels'
import { Navigate, useParams } from 'react-router-dom'
import { apiRequest } from '../../api/finopsApi'
import { listClients, type QboClient } from '../qbo/api/qboGatewayClient'
import { useAuth } from './useAuth'
import { SuperadminAccessSummary } from './SuperadminAccessSummary'
import { SuperadminAccessEditor } from './SuperadminAccessEditor'

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
  { value: 'qbo.entity.delete', label: 'Delete QuickBooks data for entity', roles: ['Admin'] },
  { value: 'access.manage', label: 'Manage people', roles: ['Admin'], global: true },
  { value: 'entities.manage', label: 'Manage entities in FinOps', roles: ['Admin'], global: true },
  { value: 'activity.read', label: 'Read Activity', roles: ['Admin'], global: true },
]
const compactPermissionLabels: Record<string, string> = {
  'client.read': 'View (legacy)', 'qbo.entity.read': 'Read', 'qbo.entity.edit': 'Edit',
  'qbo.entity.delete': 'Delete', 'access.manage': 'Manage people', 'entities.manage': 'Manage entities', 'activity.read': 'Activity', 'keys.admin': 'API keys',
}
const adminPermissionDescriptions: Record<string, string> = {
  'access.manage': 'Invite people and manage their access.',
  'entities.manage': 'Create entities; manage assigned entities and integrations. Issue entity-admin API keys; see which and how many keys are linked to each entity.',
  'activity.read': 'View activity history and event details.',
}
const grantKey = (grant: GrantDraft) => `${grant.operation}|${grant.client_id ?? ''}|${grant.environment ?? ''}`
const recommendedFor = (role: AccessUser['role']) => role === 'Viewer' ? ['qbo.entity.read'] : ['qbo.entity.read', 'qbo.entity.edit']
const optionalFor = (role: AccessUser['role']) => recommendedFor(role).filter((operation) => operation !== 'qbo.entity.read')
const entityRecommendations = (role: AccessUser['role']) => role === 'Viewer' ? ['qbo.entity.read'] : ['qbo.entity.read', 'qbo.entity.edit']
const implicitRoleEffect = (role: AccessUser['role'], previous?: AccessUser['role']) => {
  if (role === 'Viewer') return `${previous && previous !== role ? 'QBO connection will be removed. ' : ''}Can view assigned entities and their QuickBooks data.`
  if (role === 'Operator') return 'Can view assigned entities and connect them to QuickBooks.'
  return 'Can view and edit QuickBooks data for assigned entities and manage selected FinOps features.'
}
const createGrants = (scope: 'all' | 'specific' | '', entityIds: string[], selected: string[]): GrantDraft[] => {
  // "All" is a snapshot of the selected current entities, never a future grant.
  const targets = scope ? entityIds : []
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

export function AccessUserEditor({ user, creating = false, postDemotion = false, onClose, onSaved, onDeleted }: { user: AccessUser; creating?: boolean; postDemotion?: boolean; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const { access, user: currentUser } = useAuth()
  const canDelegate = (operation: string, clientId: string | null) => Boolean(access?.user.is_super_admin) || (operation !== 'entities.manage' && (access?.effective_grants ?? []).some((grant) =>
    grant.operation === operation && grant.environment === null &&
    (clientId === null ? grant.client_id === null : grant.client_id === null || grant.client_id === clientId)))
  const canCreateEntityAccess = (clientId: string | null) => canDelegate('qbo.entity.read', clientId) && (role === 'Viewer' || canDelegate('qbo.entity.edit', clientId))
  const suggestedForScope = (selectedRole: AccessUser['role'], clientId: string | null) =>
    entityRecommendations(selectedRole).filter((operation) => canDelegate(operation, clientId))
  const suggestedForNewScope = (clientId: string | null) => {
    const suggestions = suggestedForScope(role, clientId)
    const qboActions = suggestions.filter((operation) => operation !== 'entities.manage')
    return qboActions.length ? qboActions : suggestions
  }
  const canDelegateCreate = (operation: string, scope: 'all' | 'specific' | '', ids: string[]) =>
    isAdministration(operation) ? canDelegate(operation, null) :
      Boolean(scope) && ids.length > 0 && ids.every((id) => canDelegate(operation, id))
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
  const [editCoverageView, setEditCoverageView] = useState<'specific' | 'all'>('specific')
  const [createScope, setCreateScope] = useState<'all' | 'specific' | ''>('')
  const [createEntityIds, setCreateEntityIds] = useState<string[]>([])
  const [createPermissions, setCreatePermissions] = useState<string[]>(optionalFor(user.role))
  const [createSuperAdmin, setCreateSuperAdmin] = useState(false)
  const [creationChoice, setCreationChoice] = useState<'choice' | 'person' | 'superadmin'>('choice')
  const [createTypeStep, setCreateTypeStep] = useState(true)
  const [confirmFounderTransfer, setConfirmFounderTransfer] = useState(false)
  const [confirmSuperAdminChange, setConfirmSuperAdminChange] = useState(false)
  const [demotingSuperAdmin, setDemotingSuperAdmin] = useState(false)
  const [adminTypeChoiceFrom, setAdminTypeChoiceFrom] = useState<AccessUser['role'] | null>(null)
  const [founderConfirmation, setFounderConfirmation] = useState('')
  const [entitySearch, setEntitySearch] = useState('')
  const [showCreateSelectedOnly, setShowCreateSelectedOnly] = useState(false)
  const [scopeSearch, setScopeSearch] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [acknowledge, setAcknowledge] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const validDraftEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draftEmail.trim())
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
    if (grant.operation === 'keys.admin') return false // Historical grant is inert; preserve it without offering a control.
    const item = operations.find((option) => option.value === grant.operation)
    return !item || !item.roles.includes(role)
  })
  const selectEditScope = (scope: string) => {
    invalidatePreview()
    const clientId = scope === 'all' ? null : scope
    const alreadyGranted = grants.some((grant) => !isAdministration(grant.operation) && grant.client_id === clientId)
    if (!alreadyGranted && !hasAllEntities) {
      setGrants((current) => withoutRedundantEntityGrants([...current, ...suggestedForNewScope(clientId).map((operation) => ({ operation, client_id: clientId, environment: null }))]))
    }
    setSelectedScope(scope)
  }
  const createPermissionChip = (item: Operation) => {
    const fixed = item.value === 'qbo.entity.read' || role !== 'Viewer' && item.value === 'qbo.entity.edit'
    const active = fixed || createPermissions.includes(item.value)
    return <button key={item.value} type="button" aria-label={permissionName(item.value)} aria-pressed={active} aria-disabled={fixed || undefined} disabled={fixed || !canDelegateCreate(item.value, createScope, createEntityIds)} onClick={() => toggleCreatePermission(item.value)} className={`flex min-h-14 items-start justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-default ${active ? 'border-hq-teal bg-teal-50 text-slate-950' : 'border-slate-200 text-slate-700 hover:border-hq-teal'} ${!fixed && !canDelegateCreate(item.value, createScope, createEntityIds) ? 'opacity-50' : ''}`}><span><span className="block font-semibold">{compactPermissionLabels[item.value]}</span>{item.global && active && <span className="mt-1 block text-xs leading-5 text-slate-600">{adminPermissionDescriptions[item.value]}</span>}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-white text-hq-teal' : 'bg-slate-100 text-slate-500'}`}>{fixed ? 'Included' : active ? 'Enabled' : 'Not added'}</span></button>
  }
  const pendingChanges = demotingSuperAdmin || (creating
    ? Boolean(draftEmail.trim()) || role !== 'Viewer' || status !== 'active' || grants.length > 0 || createSuperAdmin
    : (savedPolicy ? role !== savedPolicy.role || status !== savedPolicy.status || !samePolicy(grants, savedPolicy.grants) : false))
  const suspendedKeys = preview?.suspended_keys ?? []
  const payload = { role, status: creating ? 'active' : status, grants, ...(demotingSuperAdmin ? { is_super_admin: false } : {}) }
  const isFounder = Boolean(access?.user.is_super_admin_founder)
  const canPromoteSuperAdmin = Boolean(access?.user.is_super_admin)
  const showCreationChoice = creating && canPromoteSuperAdmin && createTypeStep
  const isSuperAdmin = Boolean(user.is_super_admin) && !demotingSuperAdmin
  const canReceiveFounder = Boolean(user.is_super_admin && user.status === 'active' && user.sub && !user.is_super_admin_founder)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const roleSuppressedGrants = useRef<GrantDraft[]>([])
  const roleSuggestedGrants = useRef<Set<string>>(new Set())
  const stepBaseline = useRef({
    role: user.role, status: user.status, grants: [] as GrantDraft[],
    coverage: 'specific' as 'specific' | 'all', selectedScope: '',
    suppressedGrants: [] as GrantDraft[], suggestedGrantKeys: new Set<string>(),
  })
  const resettableStepChanges = editSection === 'role'
    ? role !== stepBaseline.current.role || status !== stepBaseline.current.status || !samePolicy(grants, stepBaseline.current.grants)
    : !samePolicy(grants, stepBaseline.current.grants) || editCoverageView !== stepBaseline.current.coverage
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
      stepBaseline.current = { role: user.role, status: user.status, grants: [], coverage: 'specific', selectedScope: '', suppressedGrants: [], suggestedGrantKeys: new Set<string>() }
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
      setEditCoverageView(startingScope === 'all' ? 'all' : 'specific')
      stepBaseline.current = { role: user.role, status: user.status, grants: [...loadedGrants], coverage: startingScope === 'all' ? 'all' : 'specific', selectedScope: startingScope, suppressedGrants: [], suggestedGrantKeys: new Set<string>() }
      setClients(availableClients)
    }).catch((err: Error) => { if (current) setError(err.message) })
    return () => { current = false }
  }, [creating, user.id, user.is_super_admin, user.role, user.status, userId])

  const invalidatePreview = () => { setPreview(null); setAcknowledge(false); setError(null) }
  const chooseCreateScope = (next: 'all' | 'specific') => {
    invalidatePreview()
    setCreateScope(next)
    const ids = next === 'all' ? clients.filter((client) => canCreateEntityAccess(client.id)).map((client) => client.id) : createScope === 'all' ? [] : createEntityIds
    setCreateEntityIds(ids)
    const selected = optionalFor(role).filter((operation) => canDelegateCreate(operation, next, ids))
    setCreatePermissions(selected)
    setGrants(draftCreateGrants(next, ids, selected))
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
  const setCreateEntities = (ids: string[]) => {
    invalidatePreview()
    const selected = (createEntityIds.length === 0 ? optionalFor(role) : createPermissions)
      .filter((operation) => canDelegateCreate(operation, 'specific', ids))
    setCreateEntityIds(ids)
    setCreatePermissions(selected)
    setGrants(draftCreateGrants('specific', ids, selected))
  }
  const toggleCreatePermission = (operation: string) => {
    if (operation === 'qbo.entity.read' || role !== 'Viewer' && operation === 'qbo.entity.edit') return
    invalidatePreview()
    const next = createPermissions.includes(operation) ? createPermissions.filter((value) => value !== operation) : [...createPermissions, operation]
    setCreatePermissions(next)
    setGrants(draftCreateGrants(createScope, createEntityIds, next))
  }
  const chooseRole = (next: AccessUser['role']) => {
    if (next === role) {
      if (!creating && !postDemotion && next === 'Admin' && canPromoteSuperAdmin) setAdminTypeChoiceFrom('Admin')
      return
    }
    invalidatePreview()
    if (!creating && next === 'Admin' && role !== 'Admin' && canPromoteSuperAdmin) setAdminTypeChoiceFrom(role)
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
    setAdminTypeChoiceFrom(null)
    setDemotingSuperAdmin(false)
    roleSuppressedGrants.current = []
    roleSuggestedGrants.current.clear()
    if (savedPolicy) {
      setRole(savedPolicy.role); setStatus(savedPolicy.status); setGrants([...savedPolicy.grants])
    }
    setPreview(null); setAcknowledge(false); setError(null); setConfirmDiscard(false); setEditing(false); onClose()
  }
  const switchEditSection = (next: 'role' | 'scope') => {
    if (next === editSection) return
    stepBaseline.current = {
      role, status, grants: [...grants], coverage: editCoverageView, selectedScope,
      suppressedGrants: [...roleSuppressedGrants.current], suggestedGrantKeys: new Set(roleSuggestedGrants.current),
    }
    setError(null)
    setEditSection(next)
  }
  const resetCurrentStep = () => {
    const baseline = stepBaseline.current
    setAdminTypeChoiceFrom(null)
    setGrants([...baseline.grants])
    if (editSection === 'role') {
      setRole(baseline.role)
      setStatus(baseline.status)
      roleSuppressedGrants.current = [...baseline.suppressedGrants]
      roleSuggestedGrants.current = new Set(baseline.suggestedGrantKeys)
    } else {
      setSelectedScope(baseline.selectedScope)
      setEditCoverageView(baseline.coverage)
    }
    setScopeSearch(''); setPreview(null); setAcknowledge(false); setError(null); setConfirmDiscard(false)
  }
  const requestCloseEditor = () => {
    if (confirmFounderTransfer) { setConfirmFounderTransfer(false); setFounderConfirmation(''); setError(null); return }
    if (pendingChanges) setConfirmDiscard(true)
    else closeEditor()
  }
  const toggleGrant = (grant: GrantDraft) => {
    invalidatePreview()
    roleSuggestedGrants.current.delete(grantKey(grant))
    setGrants((current) => {
      if (current.some((item) => grantKey(item) === grantKey(grant))) {
        return withoutRedundantEntityGrants(current.filter((item) => grantKey(item) !== grantKey(grant)))
      }
      const includesOperation = (operation: string) => current.some((item) => item.operation === operation && (item.client_id === null || item.client_id === grant.client_id) && item.environment === null)
      const suggested = [grant]
      if (grant.operation === 'qbo.entity.delete' && !includesOperation('qbo.entity.edit') && canDelegate('qbo.entity.edit', grant.client_id)) {
        suggested.push({ operation: 'qbo.entity.edit', client_id: grant.client_id, environment: null })
      }
      if (['qbo.entity.edit', 'qbo.entity.delete'].includes(grant.operation) && !includesOperation('qbo.entity.read')) {
        suggested.push({ operation: 'qbo.entity.read', client_id: grant.client_id, environment: null })
      }
      return withoutRedundantEntityGrants([...current, ...suggested])
    })
  }
  const onBackdropMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    if (busy || confirmDelete || confirmDiscard || confirmFounderTransfer || confirmSuperAdminChange || adminTypeChoiceFrom || event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestCloseEditor()
  }
  const requestPreview = async () => {
    if (demotingSuperAdmin && !grants.some((grant) => grant.operation === 'client.read' || grant.operation === 'qbo.entity.read')) {
      setError('Choose an entity scope before reviewing the removal of Superadmin access.')
      return
    }
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
      } else if (pendingChanges) {
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
  const changeSuperAdmin = async () => {
    if (isSuperAdmin) {
      setBusy(true); setError(null)
      try {
        const availableClients = await listClients()
        setClients(availableClients)
        setDemotingSuperAdmin(true)
        setConfirmSuperAdminChange(false)
        setEditSection('role')
        setSelectedScope('')
        setEditCoverageView('specific')
        stepBaseline.current = { role: user.role, status: user.status, grants: [], coverage: 'specific', selectedScope: '', suppressedGrants: [], suggestedGrantKeys: new Set<string>() }
      } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load entities.') }
      finally { setBusy(false) }
      return
    }
    setBusy(true); setError(null)
    try {
      await apiRequest(`/access/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ is_super_admin: !isSuperAdmin }) })
      setEditing(false)
      onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to change superadmin access.') }
    finally { setBusy(false) }
  }
  const cancelAdminTypeChoice = () => {
    if (adminTypeChoiceFrom && adminTypeChoiceFrom !== role) chooseRole(adminTypeChoiceFrom)
    setAdminTypeChoiceFrom(null)
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
  clients.filter((client) => entityRecommendations(role).some((operation) => canDelegate(operation, client.id))).forEach((client) => entityScopes.add(client.id))
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
  const activeSpecificScopes = assignedScopes.filter((item) => item.scope !== 'all' && item.draft.length > 0)
  const managesEntities = grants.some((grant) => grant.operation === 'entities.manage' && grant.client_id === null && grant.environment === null)
  const managementWithoutQboEdit = managesEntities && grants.some((read) =>
    ['client.read', 'qbo.entity.read'].includes(read.operation) && !grants.some((edit) =>
      edit.operation === 'qbo.entity.edit' && (edit.client_id === null || edit.client_id === read.client_id)))
  const removeScopeAccess = (clientId: string) => {
    invalidatePreview()
    setGrants((current) => current.filter((grant) => isAdministration(grant.operation) || grant.client_id !== clientId))
    if (selectedScope === clientId) setSelectedScope('')
  }
  const switchEditCoverage = (next: 'specific' | 'all') => {
    if (next === editCoverageView) return
    invalidatePreview()
    setEditCoverageView(next)
    setScopeSearch('')
    if (next === 'all') {
      const available = clients.filter((client) => canCreateEntityAccess(client.id))
      setGrants((current) => withoutRedundantEntityGrants([
        ...current.filter((grant) => isAdministration(grant.operation) || grant.client_id !== null && !available.some((client) => client.id === grant.client_id)),
        ...available.flatMap((client) => suggestedForNewScope(client.id).map((operation) => ({ operation, client_id: client.id, environment: null }))),
      ]))
      setSelectedScope('')
      return
    }
    setGrants((current) => {
      const legacyGlobal = current.filter((grant) => !isAdministration(grant.operation) && grant.client_id === null)
      return withoutRedundantEntityGrants([
        ...current.filter((grant) => isAdministration(grant.operation) || grant.client_id !== null),
        ...clients.flatMap((client) => legacyGlobal.filter((grant) => canDelegate(grant.operation, client.id)).map((grant) => ({ ...grant, client_id: client.id }))),
      ])
    })
    setSelectedScope('')
  }
  const allCurrentClients = clients.filter((client) => canCreateEntityAccess(client.id))
  const allCurrentGranted = (operation: string) => allCurrentClients.length > 0 && allCurrentClients.every((client) => grants.some((grant) => grant.operation === operation && grant.client_id === client.id))
  const toggleAllCurrentGrant = (operation: string) => {
    invalidatePreview()
    const remove = allCurrentGranted(operation)
    setGrants((current) => withoutRedundantEntityGrants([
      ...current.filter((grant) => grant.operation !== operation || !allCurrentClients.some((client) => client.id === grant.client_id)),
      ...(!remove ? allCurrentClients.filter((client) => canDelegate(operation, client.id)).map((client) => ({ operation, client_id: client.id, environment: null })) : []),
      ...(!remove && operation === 'qbo.entity.delete' ? allCurrentClients.filter((client) => canDelegate('qbo.entity.edit', client.id) && !current.some((grant) => grant.operation === 'qbo.entity.edit' && (grant.client_id === null || grant.client_id === client.id) && grant.environment === null)).map((client) => ({ operation: 'qbo.entity.edit', client_id: client.id, environment: null })) : []),
    ]))
  }
  const globalGrant = (operation: string): GrantDraft => ({ operation, client_id: null, environment: null })
  const isGlobalGranted = (operation: string) => grants.some((grant) => grantKey(grant) === grantKey(globalGrant(operation)))
  const wasGlobalGranted = (operation: string) => savedPolicy?.grants.some((grant) => grantKey(grant) === grantKey(globalGrant(operation))) ?? false
  return editing && <dialog ref={dialogRef} aria-labelledby="edit-access-title" onMouseDown={onBackdropMouseDown} onKeyDownCapture={(event) => { if (event.key === 'Escape') escapeFromMenu.current = Boolean(dialogRef.current?.querySelector('[role="listbox"]')) }} onCancel={(event) => { event.preventDefault(); if (busy || escapeFromMenu.current) return; if (confirmSuperAdminChange) setConfirmSuperAdminChange(false); else if (adminTypeChoiceFrom) cancelAdminTypeChoice(); else if (confirmDelete) setConfirmDelete(false); else if (confirmDiscard) setConfirmDiscard(false); else if (confirmFounderTransfer) { setConfirmFounderTransfer(false); setFounderConfirmation(''); setError(null) } else requestCloseEditor() }} className={`fixed left-1/2 top-1/2 m-0 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50 ${creating ? 'max-w-2xl' : 'max-w-4xl'}`}>
      {savedPolicy && !confirmDelete && !confirmDiscard && <button type="button" aria-label={creating ? 'Cancel' : 'Close'} disabled={busy} onClick={requestCloseEditor} className="icon-first-action absolute right-5 top-5 z-10 rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" /><span className="sr-only">{creating ? 'Cancel' : 'Close'}</span></button>}
      {!savedPolicy ? <div className="p-6"><h2 id="edit-access-title" className="break-words pr-12 text-xl font-semibold">{creating ? 'Add person' : `Change access for ${user.display_name || user.email}`}</h2>{error ? <p role="alert" className="mt-4 text-sm text-rose-800">{error}</p> : <p role="status" className="mt-4 text-sm text-slate-600">Loading access…</p>}<div className="mt-6 flex justify-end"><button type="button" onClick={closeEditor} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Close</button></div></div> : confirmDelete ? <div className="p-6"><h2 id="edit-access-title" className="text-xl font-semibold text-rose-800">Permanently delete {user.display_name || user.email}?</h2><p className="mt-3 text-sm text-slate-700">This removes their account, permissions, and API keys. They will immediately lose access. Activity history remains available. This cannot be undone.</p>{pendingChanges && <p className="mt-2 text-sm text-amber-800">Unsaved changes will not be applied.</p>}<label className="mt-5 block text-sm font-medium text-slate-800">Type DELETE to confirm<input autoFocus type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={deleteConfirmation} disabled={busy} onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>{error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setConfirmDelete(false); setDeleteConfirmation(''); setError(null) }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="button" disabled={busy || deleteConfirmation !== 'DELETE'} onClick={() => void deletePerson()} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" />{busy ? 'Deleting…' : 'Delete person'}</button></div></div> : confirmDiscard ? <div className="p-6"><h2 id="edit-access-title" className="text-xl font-semibold">Discard your changes?</h2><p className="mt-2 text-sm text-slate-600">{creating ? 'This person has not been added.' : `The changes to ${user.display_name || user.email} have not been saved.`}</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Keep editing</button><button type="button" onClick={closeEditor} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Discard changes</button></div></div> : !preview ? <><div data-dialog-header className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-5 sm:px-6 sm:pt-6"><h2 id="edit-access-title" ref={editorHeading} tabIndex={-1} className="break-words pr-12 text-xl font-semibold">{creating ? 'Add person' : `Change access for ${user.display_name || user.email}`}</h2>{!creating && isSuperAdmin && <p className="mt-1 break-all text-sm text-slate-600">{user.email}</p>}
        {creating ? <div role="group" aria-label="Add person steps" className={`mt-6 grid border-b border-slate-200 ${canPromoteSuperAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {([...(canPromoteSuperAdmin ? [{ section: 'type', number: '1', label: 'Account type' }] : []), { section: 'role', number: canPromoteSuperAdmin ? '2' : '1', label: 'Person' }, { section: 'scope', number: canPromoteSuperAdmin ? '3' : '2', label: createSuperAdmin ? 'Review' : 'Access' }] as const).map((step) => {
            const active = step.section === 'type' ? showCreationChoice : !showCreationChoice && editSection === step.section
            const complete = step.section === 'type' ? !showCreationChoice : step.section === 'role' && editSection === 'scope'
            return <button key={step.section} type="button" aria-label={`${step.number} · ${step.label}`} aria-current={active ? 'step' : undefined} aria-pressed={active} disabled={busy || step.section === 'scope' && !validDraftEmail || step.section === 'role' && showCreationChoice && creationChoice === 'choice'} onClick={() => { setError(null); if (step.section === 'type') { setCreateTypeStep(true); setEditSection('role') } else if (step.section === 'scope') void continueToAccess(); else { setCreateTypeStep(false); setEditSection('role') } }} className={`relative flex min-h-14 items-center justify-center gap-3 border-b-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed ${active ? 'border-hq-teal text-slate-950' : complete ? 'border-teal-200 text-slate-700 hover:bg-slate-50' : 'border-transparent text-slate-500 enabled:hover:bg-slate-50 enabled:hover:text-slate-800'}`}><span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${active ? 'border-hq-teal bg-hq-teal text-white' : complete ? 'border-teal-300 bg-teal-50 text-hq-teal' : 'border-slate-300 bg-white text-slate-500'}`}>{step.number}</span><span>{step.label}</span></button>
          })}
        </div> : !isSuperAdmin ? <div role="group" aria-label="Choose what to change" className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5"><button type="button" aria-pressed={editSection === 'role'} onClick={() => switchEditSection('role')} className={`rounded-lg px-3 py-3 text-sm font-semibold text-slate-950 ${editSection === 'role' ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}>Role & sign-in</button><button type="button" aria-pressed={editSection === 'scope'} onClick={() => switchEditSection('scope')} className={`rounded-lg px-3 py-3 text-sm font-semibold text-slate-950 ${editSection === 'scope' ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}>Actions & entities</button></div> : null}
        </div><div data-dialog-body className="min-h-0 overflow-y-auto p-5 sm:p-6">{!creating && !postDemotion && editSection === 'scope' && <p role="note" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Only access you can manage is shown here; other permissions stay unchanged.</p>}
        {showCreationChoice && editSection === 'role' && <section aria-label="Choose account type" className="mt-6"><h3 className="font-semibold text-slate-950">What kind of account are you adding?</h3><p className="mt-1 text-sm text-slate-600">Choose the access model before entering the person’s details.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" aria-pressed={creationChoice === 'person'} disabled={busy} onClick={() => { setCreationChoice('person'); setCreateSuperAdmin(false); setRole('Viewer'); setGrants([]); setCreatePermissions([]) }} className={`rounded-xl border p-4 text-left transition-colors ${creationChoice === 'person' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-hq-teal hover:bg-teal-50'}`}><strong className="block text-sm text-slate-950">FinOps User</strong><span className="mt-1 block text-xs text-slate-600">Access by role and entity.</span></button><button type="button" aria-pressed={creationChoice === 'superadmin'} disabled={busy} onClick={() => { setCreationChoice('superadmin'); setCreateSuperAdmin(true); setRole('Admin'); setStatus('active'); setGrants([]); setCreatePermissions([]); setCreateScope('') }} className={`rounded-xl border p-4 text-left transition-colors ${creationChoice === 'superadmin' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-hq-teal hover:bg-teal-50'}`}><strong className="block text-sm text-slate-950">Superadmin</strong><span className="mt-1 block text-xs text-slate-600">Universal access to FinOps and all connected entities.</span></button></div></section>}
        {creating && editSection === 'role' && !showCreationChoice && <div className="mt-6"><label htmlFor="new-person-email" className="block text-sm font-medium text-slate-700">Google email</label><input id="new-person-email" ref={emailInputRef} type="email" required value={draftEmail} disabled={busy} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'person-email-error' : undefined} onChange={(event) => { setDraftEmail(event.target.value); setEmailError(null); invalidatePreview() }} placeholder="name@company.com" className={`mt-2 w-full rounded-lg border px-3 py-2.5 ${emailError ? 'border-rose-500' : 'border-slate-300'}`} />{emailError && <p id="person-email-error" role="alert" className="mt-2 text-sm text-rose-700">{emailError}</p>}</div>}
        {creating && editSection === 'scope' && <div className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{draftEmail.trim()} <span className="text-slate-400">·</span> {role}</div>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {!creating && isSuperAdmin && <div className="mt-1"><SuperadminAccessEditor person={user} currentFounder={currentUser} isFounder={isFounder} canReceiveFounder={canReceiveFounder} confirmingTransfer={confirmFounderTransfer} confirmation={founderConfirmation} busy={busy} onStartTransfer={() => { setFounderConfirmation(''); setError(null); setConfirmFounderTransfer(true) }} onCancelTransfer={() => { setConfirmFounderTransfer(false); setFounderConfirmation(''); setError(null) }} onConfirmationChange={setFounderConfirmation} onConfirmTransfer={() => void transferFounder()} onRemoveSuperadmin={() => setConfirmSuperAdminChange(true)} /></div>}
        {!showCreationChoice && !isSuperAdmin && !(creating && createSuperAdmin) && editSection !== 'scope' && <section aria-label="Role and sign-in settings" className="mt-6 space-y-5">
          <div>
            <h3 className="font-semibold text-slate-950">Role</h3>
            <div role="group" aria-label="Role" className="mt-3 grid gap-2 sm:grid-cols-3">
              {roles.map((item) => <button key={item} type="button" aria-pressed={role === item} disabled={busy} onClick={() => chooseRole(item)} className={`min-h-20 rounded-xl border p-3 text-left transition ${role === item ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-slate-400'}`}><span className="block font-semibold text-slate-950">{item} {!creating && savedPolicy?.role === item && role !== item && <span className="text-xs font-normal text-slate-500">· Saved</span>}</span><span className="mt-1 block text-xs text-slate-600">{{ Viewer: 'Read', Operator: 'Read & edit', Admin: 'Administration' }[item]}</span></button>)}
            </div>
            {(creating || savedPolicy?.role !== role) && <div role={creating ? 'note' : 'status'} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-1 text-sm"><strong className="text-slate-950">{creating ? role : `${savedPolicy?.role} → ${role}`}</strong><InfoTooltip label="About suggested access" placement="top" text="Recommended access is preselected. Review and adjust it before saving." /></div>
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
        {!creating && !isSuperAdmin && demotingSuperAdmin && editSection === 'role' && <div role="status" className="mt-5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-slate-700"><strong className="block text-slate-950">Superadmin removal pending</strong><span className="mt-1 block">Choose the new role and scope. Nothing changes until you confirm.</span></div>}
        {creating && createSuperAdmin && editSection === 'scope' && <div className="mt-6"><SuperadminAccessSummary prospective ariaLabel="Superadmin access summary" /></div>}
        {!isSuperAdmin && !(creating && createSuperAdmin) && editSection === 'scope' && <section aria-label="Actions and entities" className="mt-6 space-y-5">
          {creating && <div className="space-y-4">
            <section aria-label="Entities and permissions" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div><h3 className="text-sm font-semibold text-slate-950">Entities and permissions</h3><p className="mt-1 text-xs text-slate-600">Choose the entities this person can access, then set the actions available across them.</p></div>
            <div role="group" aria-label="Access scope" className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={createScope === 'specific'} onClick={() => chooseCreateScope('specific')} className={`rounded-xl border p-4 text-left ${createScope === 'specific' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 hover:border-slate-400'}`}><span className="block text-sm font-semibold">Selected entities</span><span className="mt-1 block text-xs text-slate-600">Choose one or more</span></button>
              <button type="button" aria-pressed={createScope === 'all'} disabled={!clients.some((client) => canCreateEntityAccess(client.id))} onClick={() => chooseCreateScope('all')} className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${createScope === 'all' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 hover:border-slate-400'}`}><span className="block text-sm font-semibold">All available entities</span><span className="mt-1 block text-xs text-slate-600">Current only · no future entities</span></button>
            </div>
            {createScope === 'specific' && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-950">Entities</h3><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-hq-teal">{createEntityIds.length} selected</span></div>
              <label className="sr-only" htmlFor="create-entity-search">Find an entity</label><input id="create-entity-search" type="search" value={entitySearch} onChange={(event) => setEntitySearch(event.target.value)} placeholder="Search entities" className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-hq-teal focus:outline-none focus:ring-2 focus:ring-hq-teal/20" />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 pb-3 text-xs font-semibold"><button type="button" onClick={() => setCreateEntities([...new Set([...createEntityIds, ...clients.filter((client) => canCreateEntityAccess(client.id) && client.name.toLowerCase().includes(entitySearch.toLowerCase())).map((client) => client.id)])])} className="text-hq-teal hover:underline">{entitySearch ? 'Select matches' : 'Select all available'}</button><button type="button" disabled={!createEntityIds.length} onClick={() => setCreateEntities([])} className="text-slate-600 hover:underline disabled:opacity-40">Clear selection</button><button type="button" aria-pressed={showCreateSelectedOnly} disabled={!createEntityIds.length && !showCreateSelectedOnly} onClick={() => setShowCreateSelectedOnly((current) => !current)} className={`ml-auto rounded-md px-2 py-1 disabled:opacity-40 ${showCreateSelectedOnly ? 'bg-teal-50 text-hq-teal' : 'text-slate-600 hover:bg-slate-50'}`}>{showCreateSelectedOnly ? 'Show all' : 'Show selected'}</button></div>
              <div role="group" aria-label="Select entities" className="mt-2 max-h-52 space-y-1 overflow-y-auto pr-1">{clients.filter((client) => canCreateEntityAccess(client.id) && client.name.toLowerCase().includes(entitySearch.toLowerCase()) && (!showCreateSelectedOnly || createEntityIds.includes(client.id))).slice(0, 50).map((client) => <button key={client.id} type="button" aria-pressed={createEntityIds.includes(client.id)} onClick={() => toggleCreateEntity(client.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${createEntityIds.includes(client.id) ? 'border-hq-teal bg-teal-50 text-slate-950' : 'border-transparent text-slate-900 hover:bg-slate-50'}`}><span className="min-w-0 truncate font-medium">{client.name}</span><span className="flex h-5 w-5 shrink-0 items-center justify-center">{createEntityIds.includes(client.id) && <Check aria-hidden="true" className="h-4 w-4 text-hq-teal" />}</span></button>)}{!clients.some((client) => canCreateEntityAccess(client.id) && client.name.toLowerCase().includes(entitySearch.toLowerCase()) && (!showCreateSelectedOnly || createEntityIds.includes(client.id))) && <p className="px-3 py-3 text-sm text-slate-600">{showCreateSelectedOnly ? 'No selected entities match your search.' : 'No matching entities'}</p>}</div>
              {clients.filter((client) => canCreateEntityAccess(client.id) && client.name.toLowerCase().includes(entitySearch.toLowerCase())).length > 50 && !showCreateSelectedOnly && <p className="mt-2 text-xs text-slate-500">Showing the first 50. Search to find another entity.</p>}
            </div>}
            {createScope && (createScope === 'all' || createEntityIds.length > 0) && <div role="group" aria-label="Entity and QuickBooks access" className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold">Permissions</h3><p className="mt-1 text-xs text-slate-600">Applied to {createEntityIds.length} current {createEntityIds.length === 1 ? 'entity' : 'entities'} only.</p>
                <div className={`mt-3 grid gap-2 ${role === 'Viewer' ? 'grid-cols-1' : role === 'Operator' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>{operations.filter((item) => ['qbo.entity.read', 'qbo.entity.edit', 'qbo.entity.delete'].includes(item.value) && item.roles.includes(role)).map(createPermissionChip)}</div>
                <p role="note" className="mt-3 text-xs text-slate-500">Need different permissions for an entity? Adjust them in Manage People after creating this user.</p>
            </div>}
            </section>
            {role === 'Admin' && createScope && (createScope === 'all' || createEntityIds.length > 0) && <section role="group" aria-label="Console administration" className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-950">Admin access</h3><p className="mt-1 text-xs text-slate-600">Additional FinOps administration permissions, separate from entity access.</p>
                <div className="mt-3 grid gap-2">{operations.filter((item) => item.global && (item.value !== 'entities.manage' || access?.user.is_super_admin)).map(createPermissionChip)}</div>
              </section>}
          </div>}
          {!creating && <>
          <section aria-label="Entity access editor" className="space-y-4">
            <h3 className="text-base font-semibold text-slate-950">Entities and permissions</h3>
            <div role="group" aria-label="Entity coverage" className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={editCoverageView === 'specific'} onClick={() => switchEditCoverage('specific')} className={'rounded-xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal ' + (editCoverageView === 'specific' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-hq-teal')}><span className="block text-sm font-semibold">Selected entities</span><span className="mt-1 block text-xs text-slate-600">Choose one or more</span></button>
              <button type="button" aria-pressed={editCoverageView === 'all'} disabled={!allCurrentClients.length} onClick={() => switchEditCoverage('all')} className={'rounded-xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal disabled:opacity-50 ' + (editCoverageView === 'all' ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-hq-teal')}><span className="block text-sm font-semibold">All available entities</span><span className="mt-1 block text-xs text-slate-600">Current only · no future entities</span></button>
            </div>
            {editCoverageView === 'specific' ? <section aria-label="Available entities" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-slate-600">{activeSpecificScopes.length} with access</span><label className="sr-only" htmlFor="edit-entity-search">Search entities</label><input id="edit-entity-search" type="search" value={scopeSearch} onChange={(event) => setScopeSearch(event.target.value)} placeholder="Search entities" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-hq-teal focus:outline-none sm:w-64" /></div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_auto] gap-4 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 sm:grid"><span>Entity</span><span>QuickBooks access</span></div>
                {assignedScopes.filter((item) => item.scope !== 'all' && item.name.toLowerCase().includes(scopeSearch.trim().toLowerCase())).map((item) => <section key={item.scope} aria-label={`Access for ${item.name}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
                  <div className="min-w-0 flex-1"><h4 className="truncate text-sm font-medium text-slate-950">{item.name}</h4>{item.draft.length ? <button type="button" aria-label={`Remove access for ${item.name}`} disabled={busy} onClick={() => removeScopeAccess(item.scope)} className="mt-0.5 text-left text-xs text-slate-500 underline-offset-2 hover:text-rose-700 hover:underline disabled:opacity-50">Remove entity access</button> : <span className={'text-xs ' + (item.saved.length ? 'text-rose-700' : 'text-slate-500')}>{item.saved.length ? 'Will remove access' : 'No access'}</span>}</div>
                  {item.draft.length ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    <span aria-label={`Read access for ${item.name} included`} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">Read</span>
                    {operations.filter((operation) => ['qbo.entity.edit', 'qbo.entity.delete'].includes(operation.value) && (operation.roles.includes(role) || item.draft.some((grant) => grant.operation === operation.value))).map((operation) => { const active = item.draft.some((grant) => grant.operation === operation.value); return <button key={operation.value} type="button" aria-label={`${compactPermissionLabels[operation.value]} access for ${item.name}`} aria-pressed={active} disabled={busy || !operation.roles.includes(role) || !canDelegate(operation.value, item.scope)} onClick={() => toggleGrant({ operation: operation.value, client_id: item.scope, environment: null })} className={'rounded-md border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ' + (active ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-200 bg-white text-slate-600 hover:border-hq-teal')}>{compactPermissionLabels[operation.value]}</button> })}
                  </div> : <button type="button" aria-label={`Add access for ${item.name}`} disabled={busy || !canCreateEntityAccess(item.scope)} onClick={() => selectEditScope(item.scope)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-hq-teal hover:border-hq-teal disabled:opacity-50">Add access</button>}
                </section>)}
                {!assignedScopes.some((item) => item.scope !== 'all' && item.name.toLowerCase().includes(scopeSearch.trim().toLowerCase())) && <p className="px-4 py-5 text-sm text-slate-600">No matching entities.</p>}
              </div>
            </section> : <section aria-label="All entity access" className="border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-center gap-3"><h4 className="text-sm font-semibold text-slate-950">{allCurrentClients.length} current entities</h4><span className="text-xs text-slate-600">No automatic access to future entities</span></div>
              <div role="group" aria-label="QuickBooks access for all available entities" className={`mt-3 grid gap-2 sm:gap-3 ${role === 'Admin' ? 'grid-cols-3' : role === 'Operator' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <span aria-label="Read included for all available entities" className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700"><span>Read</span><span className="text-xs font-normal text-slate-500">Included</span></span>
                {operations.filter((item) => ['qbo.entity.edit', 'qbo.entity.delete'].includes(item.value) && item.roles.includes(role)).map((item) => <button key={item.value} type="button" aria-label={permissionName(item.value)} aria-pressed={allCurrentGranted(item.value)} disabled={busy || !allCurrentClients.every((client) => canDelegate(item.value, client.id))} onClick={() => toggleAllCurrentGrant(item.value)} className={'min-h-12 rounded-lg border px-3 text-left text-sm font-medium disabled:opacity-50 ' + (allCurrentGranted(item.value) ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-300 bg-white text-slate-700 hover:border-hq-teal')}>{compactPermissionLabels[item.value]}</button>)}
              </div>
            </section>}
          </section>
          {role === 'Admin' && <section aria-label="Admin access" className="border-t-2 border-slate-200 pt-5">
            <div className="mb-3"><h3 className="text-base font-semibold text-slate-950">Admin access</h3><p className="mt-0.5 text-xs text-slate-600">FinOps administration, separate from entity and QuickBooks access.</p></div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">{operations.filter((item) => item.global && (item.value !== 'entities.manage' || access?.user.is_super_admin || wasGlobalGranted(item.value))).map((item) => { const checked = isGlobalGranted(item.value); const saved = wasGlobalGranted(item.value); return <button key={item.value} type="button" aria-label={permissionName(item.value)} aria-pressed={checked} disabled={busy || role !== 'Admin' || !canDelegate(item.value, null)} onClick={() => toggleGrant(globalGrant(item.value))} className={`flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-teal-50/60 hover:bg-teal-50' : 'hover:bg-slate-50'}`}><span className="flex-1"><span className="block font-medium text-slate-900">{compactPermissionLabels[item.value]}</span>{checked && <span className="mt-1 block text-xs leading-5 text-slate-600">{adminPermissionDescriptions[item.value]}</span>}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${checked ? 'bg-white text-hq-teal' : 'bg-slate-100 text-slate-500'}`}>{checked !== saved ? checked ? 'Added' : 'Will remove' : checked ? 'Enabled' : 'Not added'}</span></button> })}</div>
            {managementWithoutQboEdit && <p role="note" className="mt-2 text-xs text-amber-800">Some assigned entities have no Edit permission. Entity management remains separate.</p>}
          </section>}
          {exceptionalGrants.length > 0 && <details className="rounded-lg border border-amber-200 px-4 py-3 text-sm"><summary className="cursor-pointer font-medium text-slate-800">Access to resolve ({exceptionalGrants.length})</summary><ul className="mt-3 divide-y divide-slate-100">{exceptionalGrants.map((grant) => <li key={grantKey(grant)} className="flex items-center justify-between gap-3 py-2"><span>{permissionName(grant.operation)} <span className="text-slate-500">· {grantScope(grant, clients)}</span></span><button type="button" aria-label={`Remove ${permissionName(grant.operation)} for ${grantScope(grant, clients)}`} disabled={busy} onClick={() => toggleGrant(grant)} className="icon-first-action shrink-0 rounded-lg px-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Remove</span></button></li>)}</ul></details>}
          {incompatibleGrants.length > 0 && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{incompatibleGrants.length} assigned {incompatibleGrants.length === 1 ? 'permission is' : 'permissions are'} outside the selected role. Remove them before reviewing changes.</p>}
          </>}
        </section>}</div>
        {creating ? <div data-dialog-footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div className="min-w-0">{editSection === 'scope' && <span role="status" className="hidden truncate text-xs text-slate-500 sm:inline">{createSuperAdmin ? 'Universal access' : createScope === '' ? 'Choose entity coverage' : createEntityIds.length === 0 ? 'Choose entities' : `${createEntityIds.length} current ${createEntityIds.length === 1 ? 'entity' : 'entities'} selected`}</span>}</div>
          {editSection === 'role' ? <div className="flex items-center gap-2">{!showCreationChoice && canPromoteSuperAdmin && <button type="button" aria-label="Back to account type" onClick={() => setCreateTypeStep(true)} className="icon-first-action rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700"><ArrowLeft aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Back</span></button>}<button type="button" aria-label={showCreationChoice ? 'Continue to person' : createSuperAdmin ? 'Continue to review' : 'Continue to access'} disabled={busy || (showCreationChoice ? creationChoice === 'choice' : !validDraftEmail)} onClick={() => { if (showCreationChoice) setCreateTypeStep(false); else void continueToAccess() }} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><ArrowRight aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{showCreationChoice ? 'Continue to person' : createSuperAdmin ? 'Continue to review' : 'Continue to access'}</span></button></div>
            : <div className="flex items-center gap-2"><button type="button" aria-label="Back" onClick={() => { setError(null); setEditSection('role') }} className="icon-first-action rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><ArrowLeft aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Back</span></button><button type="button" aria-label="Review person" disabled={busy || (!createSuperAdmin && (grants.length === 0 || createScope === '' || createScope === 'specific' && createEntityIds.length === 0))} onClick={() => void requestPreview()} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Review person</span></button></div>}
        </div> : !isSuperAdmin && <div data-dialog-footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {!isSuperAdmin && <button type="button" aria-label="Delete user" disabled={busy} onClick={() => { setError(null); setConfirmDelete(true) }} className="icon-first-action rounded-lg px-2 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Delete user</span></button>}
            {pendingChanges && <span className="text-xs text-slate-600">{changes.length} unsaved {changes.length === 1 ? 'change' : 'changes'}</span>}
          </div>
          <div className="flex items-center gap-2">
            {resettableStepChanges && <button type="button" aria-label={editSection === 'role' ? 'Reset role and sign-in' : 'Reset actions and entities'} disabled={busy} onClick={resetCurrentStep} className="icon-first-action rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><RotateCcw aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{editSection === 'role' ? 'Reset role & sign-in' : 'Reset actions & entities'}</span></button>}
            {editSection === 'role' && (savedPolicy?.role !== role || demotingSuperAdmin || postDemotion)
              ? <button type="button" aria-label="Continue to actions and entities" disabled={busy} onClick={() => switchEditSection('scope')} className="icon-first-action rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><ArrowRight aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Continue to actions & entities</span></button>
              : <button type="button" aria-label="Review changes" disabled={busy || (!pendingChanges && !postDemotion) || incompatibleGrants.length > 0 || demotingSuperAdmin && !grants.some((grant) => grant.operation === 'client.read' || grant.operation === 'qbo.entity.read')} onClick={() => void requestPreview()} className="icon-first-action rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{busy ? 'Checking…' : 'Review changes'}</span></button>}
          </div>
        </div>}
        </> : <><PolicyReviewSummary creating={creating} postDemotion={postDemotion || demotingSuperAdmin} name={creating ? null : user.display_name} email={creating ? draftEmail.trim() : user.email} role={role} savedRole={savedPolicy?.role ?? role} status={status} savedStatus={savedPolicy?.status ?? status} grants={grants} savedGrants={savedPolicy?.grants ?? []} clients={clients} preview={preview} acknowledge={acknowledge} setAcknowledge={setAcknowledge} error={error} headingRef={previewHeading} /><div data-dialog-footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6"><button type="button" disabled={busy} onClick={() => { setPreview(null); setAcknowledge(false); setError(null) }} className="icon-first-action rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"><ArrowLeft aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Back to editing</span></button><button type="button" disabled={busy || suspendedKeys.length > 0 && !acknowledge} onClick={() => void apply()} className="icon-first-action rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{busy ? 'Saving…' : creating ? 'Add person' : 'Save changes'}</span></button></div></>}
      {adminTypeChoiceFrom && !confirmSuperAdminChange && <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4 sm:p-6"><div role="dialog" aria-modal="true" aria-labelledby="admin-type-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"><h3 id="admin-type-title" className="text-lg font-semibold text-slate-950">Choose admin access</h3><p className="mt-1 text-sm text-slate-600">How should {user.display_name || user.email} access FinOps?</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setAdminTypeChoiceFrom(null)} className="rounded-xl border border-slate-200 p-4 text-left hover:border-hq-teal hover:bg-teal-50"><strong className="block text-sm text-slate-950">Admin</strong><span className="mt-1 block text-xs leading-5 text-slate-600">Choose entities and administrative permissions.</span></button><button type="button" disabled={user.status !== 'active'} onClick={() => setConfirmSuperAdminChange(true)} className="rounded-xl border border-slate-200 p-4 text-left hover:border-hq-teal hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"><strong className="block text-sm text-slate-950">Superadmin</strong><span className="mt-1 block text-xs leading-5 text-slate-600">Full access to current and future entities and administration.</span></button></div>{user.status !== 'active' && <p className="mt-3 text-xs text-slate-600">Allow sign-in and save before granting Superadmin access.</p>}<div className="mt-5 flex justify-end"><button type="button" onClick={cancelAdminTypeChoice} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button></div></div></div>}
      {confirmSuperAdminChange && <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4 sm:p-6"><div role="alertdialog" aria-labelledby="superadmin-confirm-title" aria-describedby="superadmin-confirm-description" className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="border-b border-slate-100 px-5 py-5 sm:px-6"><span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-hq-teal"><Shield aria-hidden="true" className="h-5 w-5" /></span><h3 id="superadmin-confirm-title" className="text-lg font-semibold text-slate-950">{isSuperAdmin ? 'Remove superadmin access?' : `Make ${user.display_name || user.email} a superadmin?`}</h3><p id="superadmin-confirm-description" className="mt-2 text-sm leading-6 text-slate-600">{isSuperAdmin ? 'You’ll choose a new role and entity scope before anything changes.' : 'This grants full access to all current and future resources and replaces individual permissions.'}</p>{!isSuperAdmin && <p className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-slate-700">After promotion, only the Founder can manage this account.</p>}{error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}</div><div className="flex flex-wrap justify-end gap-2 bg-slate-50 px-5 py-4 sm:px-6"><button type="button" disabled={busy} onClick={() => { setConfirmSuperAdminChange(false); setError(null) }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button><button type="button" disabled={busy} onClick={() => void changeSuperAdmin()} className="icon-first-action rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">{busy ? 'Loading…' : isSuperAdmin ? 'Set new access' : 'Make superadmin'}</span></button></div></div></div>}
    </dialog>
}

function PolicyReviewSummary({ creating, postDemotion, name, email, role, savedRole, status, savedStatus, grants, savedGrants, clients, preview, acknowledge, setAcknowledge, error, headingRef }: {
  creating: boolean; postDemotion: boolean; name: string | null; email: string; role: AccessUser['role']; savedRole: AccessUser['role']; status: AccessUser['status']; savedStatus: AccessUser['status']
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
  const entityGrants = grants.filter((grant) => !isAdministration(grant.operation))
  const selectedEntityCount = new Set(entityGrants.map((grant) => grant.client_id)).size
  const selectedAdminCount = grants.filter((grant) => isAdministration(grant.operation)).length
  return <div role="region" aria-label="Policy impact preview" className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
    <div><h2 id="edit-access-title" ref={headingRef} tabIndex={-1} className="pr-12 text-xl font-semibold">{creating ? 'Review new person' : 'Review access changes'}</h2><p className="mt-1 break-all text-sm text-slate-600">{name && <><span className="font-semibold text-slate-900">{name}</span> · </>}{email}</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {(creating || postDemotion || role !== savedRole || status !== savedStatus) && <div className="grid gap-2 sm:grid-cols-2">
      {(creating || postDemotion || role !== savedRole) && <div className="rounded-xl border border-hq-teal bg-teal-50 px-4 py-3"><span className="block text-xs text-slate-600">Role</span><strong className="mt-1 block text-sm text-slate-950">{postDemotion ? `Superadmin → ${role}` : creating ? role : `${savedRole} → ${role}`}</strong></div>}
      {!creating && status !== savedStatus && <div className="rounded-xl border border-hq-teal bg-teal-50 px-4 py-3"><span className="block text-xs text-slate-600">Sign-in</span><strong className="mt-1 block text-sm text-slate-950">{savedStatus === 'active' ? 'Allowed' : 'Paused'} → {status === 'active' ? 'Allowed' : 'Paused'}</strong></div>}
    </div>}
    {creating && role === 'Admin' && !postDemotion && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">Admin can manage sensitive access only through the permissions shown below.</p>}
    {postDemotion && <p className="text-sm text-slate-700">{entityGrants.length ? entityGrants.some((grant) => grant.client_id === null) ? 'All entities selected.' : `${selectedEntityCount} ${selectedEntityCount === 1 ? 'entity' : 'entities'} selected.` : 'No entity access selected.'} {selectedAdminCount ? `${selectedAdminCount} admin ${selectedAdminCount === 1 ? 'permission' : 'permissions'} selected.` : 'No admin permissions selected.'}</p>}
    <section aria-label="Permission changes"><h3 className="text-sm font-semibold text-slate-900">{creating ? 'Access to grant' : 'Permission changes'}</h3>
      {groups.size ? <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">{[...groups].map(([scope, entries]) => <div key={scope} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0"><span className="min-w-32 flex-1 text-sm font-semibold text-slate-900">{scope}</span><div className="flex flex-wrap gap-1.5">{entries.map((entry, index) => <span key={`${index}-${entry.label}`} className={`rounded-md px-2 py-1 text-xs font-medium ${entry.added ? 'bg-teal-50 text-hq-teal' : 'bg-rose-50 text-rose-700'}`}>{entry.added ? '+' : '−'} {entry.label}</span>)}</div></div>)}</div> : <p className="mt-2 text-sm text-slate-500">{postDemotion ? 'No additional permissions will be assigned.' : 'No permission changes'}</p>}
    </section>
    {!creating && (suspended.length > 0 || affected.length > 0 || reactivating) && <section className={`rounded-xl border px-4 py-3 ${suspended.length || reactivating ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`} aria-label="API key impact"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">API keys</h3><span className={`text-sm font-medium ${suspended.length || reactivating ? 'text-amber-900' : 'text-slate-600'}`}>{suspended.length ? `${suspended.length} will stop working` : reactivating ? 'Suspended keys stay suspended' : `${affected.length} ${affected.length === 1 ? 'key changes access' : 'keys change access'}`}</span></div>{reactivating && <p className="mt-2 text-xs text-amber-950">Allowing sign-in again does not reactivate suspended API keys. The user must create new keys to restore integrations.</p>}{suspended.length > 0 && <><p className="mt-2 text-xs text-amber-950">{suspended.map(itemLabel).join(', ')}</p><button type="button" aria-pressed={acknowledge} onClick={() => setAcknowledge(!acknowledge)} className={`mt-3 rounded-lg border px-3 py-2 text-left text-sm font-semibold ${acknowledge ? 'border-amber-600 bg-white text-amber-950' : 'border-amber-300 text-amber-950 hover:bg-white'}`}>{acknowledge ? 'Acknowledged' : 'Acknowledge impact'}</button></>}{!suspended.length && affected.length > 0 && <p className="mt-2 text-xs text-slate-600">{affected.map(itemLabel).join(', ')}</p>}</section>}
    {Boolean(preview.changes?.length) && <details className="text-xs text-slate-600"><summary className="cursor-pointer">Technical details</summary><ul className="mt-2 list-inside list-disc space-y-1">{preview.changes?.map((value, index) => <li key={`${index}-${itemLabel(value)}`}>{itemLabel(value)}</li>)}</ul></details>}
  </div>
}
