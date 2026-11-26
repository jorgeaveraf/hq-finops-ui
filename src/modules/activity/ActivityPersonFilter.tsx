import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

type Props = { value: string; actors: string[]; onChange: (value: string) => void }

export function ActivityPersonFilter({ value, actors, onChange }: Props) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const emails = [...new Set(actors.filter((actor) => actor.includes('@')))].sort((a, b) => a.localeCompare(b))
  const matches = emails.filter((email) => email.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
  const label = value === '' ? 'Everyone' : value === 'Unidentified actor' ? 'Unidentified' : value

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const select = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return <div ref={rootRef} className="relative w-full">
    <span id={`${id}-label`} className="label mb-1.5 block">Person</span>
    <button type="button" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} onClick={() => setOpen((current) => !current)} className="input-base flex min-h-11 w-full items-center justify-between gap-3 text-left hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-hq-teal/30">
      <span id={`${id}-value`} className="truncate text-slate-900">{label}</span><ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id={`${id}-menu`} className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/15" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false) } }}>
      <div className="p-1">
        {([{ value: '', label: 'Everyone' }, { value: 'Unidentified actor', label: 'Unidentified' }] as const).map((option) => <button key={option.label} type="button" aria-pressed={value === option.value} onClick={() => select(option.value)} className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 focus-visible:bg-teal-50 focus-visible:outline-none"><span>{option.label}</span>{value === option.value && <Check aria-hidden="true" className="h-4 w-4 text-hq-teal" />}</button>)}
      </div>
      <div className="border-t border-slate-200 p-3">
        <label htmlFor={`${id}-search`} className="mb-2 block text-xs font-semibold text-slate-600">Search by email</label>
        <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id={`${id}-search`} ref={inputRef} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (matches[0]) select(matches[0]); else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim())) select(query.trim()) } }} placeholder="name@company.com" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-hq-teal focus:outline-none focus:ring-2 focus:ring-hq-teal/20" />{query && <button type="button" aria-label="Clear email search" onClick={() => { setQuery(''); inputRef.current?.focus() }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>}</div>
        <div aria-label="Email suggestions" className="mt-2 max-h-44 overflow-y-auto">{matches.length ? matches.map((email) => <button key={email} type="button" onClick={() => select(email)} className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-teal-50 focus-visible:bg-teal-50 focus-visible:outline-none"><span className="truncate">{email}</span>{value === email && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-hq-teal" />}</button>) : <p className="px-2 py-2 text-xs text-slate-500">No matching emails. Press Enter to search for this address.</p>}</div>
      </div>
    </div>}
  </div>
}
