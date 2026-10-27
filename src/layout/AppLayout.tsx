import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, LogOut, PlugZap } from 'lucide-react'
import { useAuth } from '../modules/auth/useAuth'
import hqLogo from '../assets/hq-logo.png'

const navItems = [
  { to: '/', label: 'Overview', icon: Home },
  { to: '/qbo/clients', label: 'Clients & Integrations', icon: PlugZap },
]

function AccountMenu({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const dialogTitleId = useId()
  const dialogDescriptionId = useId()

  const closeConfirm = () => {
    if (isSigningOut) return
    setConfirmOpen(false)
    setSignOutError(null)
    triggerRef.current?.focus()
  }

  const confirmSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    setSignOutError(null)
    try {
      await logout()
    } catch {
      setSignOutError('Could not sign out. Your session is still active. Please try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  useEffect(() => {
    if (confirmOpen) dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [confirmOpen])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        rootRef.current?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account options"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-3 overflow-hidden rounded-xl py-2 text-left hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal ${mobile ? 'w-12 px-2' : 'w-full px-3'}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-hq-teal to-emerald-400 text-sm font-semibold text-white">
          {user?.name?.[0]?.toUpperCase() ?? 'F'}
        </span>
        <span aria-hidden={compact} className={`min-w-0 flex-1 shrink-0 whitespace-nowrap transition-[opacity,transform] motion-reduce:transition-none ${compact ? 'pointer-events-none -translate-x-1 opacity-0 duration-100' : 'translate-x-0 opacity-100 duration-200 delay-75'}`}><span className="block truncate text-sm font-semibold text-slate-900">{user?.name ?? 'FinOps Operator'}</span><span className="block text-xs text-slate-500">Account</span></span>
      </button>
      {open && (
        <div id={menuId} className={`absolute z-40 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ${mobile ? 'right-0 top-full mt-2' : 'bottom-full left-0 mb-2'}`}>
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">{user?.name ?? 'FinOps Operator'}</p>
            {user?.email && <p className="truncate text-xs text-slate-600">{user.email}</p>}
          </div>
          <button type="button" onClick={() => { setOpen(false); setSignOutError(null); setConfirmOpen(true) }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal">
            <LogOut className="h-4 w-4" aria-hidden="true" />Sign out
          </button>
        </div>
      )}
      {confirmOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeConfirm()
              if (event.key !== 'Tab') return
              const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button')
              if (!buttons?.length) return
              if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus() }
              else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus() }
            }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h2 id={dialogTitleId} className="text-lg font-semibold text-slate-900">Sign out?</h2>
            <p id={dialogDescriptionId} className="mt-2 text-sm text-slate-600">You will need to sign in again to access FinOps Console.</p>
            {signOutError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{signOutError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeConfirm} disabled={isSigningOut} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:border-hq-teal/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void confirmSignOut()} disabled={isSigningOut} className="rounded-xl bg-hq-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-hq-tealDark focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal disabled:opacity-50">{isSigningOut ? 'Signing out...' : 'Sign out'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export function AppLayout() {
  const { role } = useAuth()
  const [pinned, setPinned] = useState(false)
  const [temporaryOpen, setTemporaryOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expanded = pinned || temporaryOpen
  const items = role === 'admin' ? navItems : navItems.filter((item) => item.to !== '/qbo/clients')

  const cancelHover = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }

  useEffect(() => () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
  }, [])

  useEffect(() => {
    if (!pinned) return
    const unpinOutside = (event: PointerEvent) => {
      if (sidebarRef.current?.contains(event.target as Node)) return
      setPinned(false)
      setTemporaryOpen(false)
    }
    document.addEventListener('pointerdown', unpinOutside)
    return () => document.removeEventListener('pointerdown', unpinOutside)
  }, [pinned])

  return (
    <div className="flex min-h-screen bg-hq-gray">
      <aside ref={sidebarRef} className={`sticky top-0 z-40 hidden h-screen shrink-0 transition-[width] duration-300 ease-out motion-reduce:transition-none md:block ${expanded ? 'w-64' : 'w-20'}`} aria-label="Sidebar">
        <div
          className="relative z-30 flex h-full w-full flex-col border-r border-slate-200 bg-white shadow-soft"
          onClickCapture={() => { cancelHover(); setPinned(true) }}
          onMouseEnter={() => { if (!pinned) { cancelHover(); hoverTimer.current = setTimeout(() => { setTemporaryOpen(true); hoverTimer.current = null }, 300) } }}
          onMouseLeave={() => { cancelHover(); if (!pinned) setTemporaryOpen(false) }}
          onFocusCapture={() => { cancelHover(); if (!pinned) setTemporaryOpen(true) }}
          onBlurCapture={(event) => { if (!pinned && !event.currentTarget.contains(event.relatedTarget as Node)) setTemporaryOpen(false) }}
          onKeyDown={(event) => { if (event.key === 'Escape') { cancelHover(); setPinned(false); setTemporaryOpen(false) } }}
        >
          <div className="flex min-h-20 items-center gap-3 overflow-hidden border-b border-slate-100 px-5">
            <img src={hqLogo} alt="HQ" className="h-10 w-10 shrink-0 rounded-full object-contain" />
            <div aria-hidden={!expanded} className={`min-w-0 flex-1 shrink-0 whitespace-nowrap transition-[opacity,transform] motion-reduce:transition-none ${expanded ? 'translate-x-0 opacity-100 duration-200 delay-75' : 'pointer-events-none -translate-x-1 opacity-0 duration-100'}`}><p className="text-sm font-semibold text-hq-teal">Headquarters</p><p className="text-sm font-semibold text-slate-900">FinOps Console</p></div>
          </div>
          <nav aria-label="Main navigation" className="flex-1 space-y-2 overflow-hidden p-4">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink key={item.to} to={item.to} aria-label={item.label} title={expanded ? undefined : item.label} className={({ isActive }) => [
                  'flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-hq-teal text-white shadow' : 'text-slate-700 hover:bg-slate-100',
                ].join(' ')}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span aria-hidden={!expanded} className={`shrink-0 transition-[opacity,transform] motion-reduce:transition-none ${expanded ? 'translate-x-0 opacity-100 duration-200 delay-75' : 'pointer-events-none -translate-x-1 opacity-0 duration-100'}`}>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
          <div className="border-t border-slate-100 p-3"><AccountMenu compact={!expanded} /></div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:hidden">
          <div className="flex items-center gap-2 font-semibold text-slate-900"><img src={hqLogo} alt="HQ" className="h-9 w-9 rounded-full object-contain" />FinOps Console</div>
          <AccountMenu compact mobile />
        </header>
        <nav aria-label="Mobile navigation" className="flex w-full gap-2 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          {items.map((item) => {
            const Icon = item.icon
            return <NavLink key={item.to} to={item.to} className={({ isActive }) => [
              'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center text-xs font-medium sm:text-sm',
              isActive ? 'bg-hq-teal text-white' : 'text-slate-700 hover:bg-slate-100',
            ].join(' ')}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{item.label}</span></NavLink>
          })}
        </nav>
        <main className="flex-1 px-4 py-6 md:px-10"><Outlet /></main>
      </div>
    </div>
  )
}
