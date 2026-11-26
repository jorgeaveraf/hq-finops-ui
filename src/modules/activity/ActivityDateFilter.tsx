import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { FilterDropdown } from '../../components/FilterDropdown'

const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const displayDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function ActivityDateFilter({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const today = dateValue(new Date())
  const earliest = new Date()
  earliest.setDate(earliest.getDate() - 14)
  const earliestDate = dateValue(earliest)
  const earliestMonth = new Date(earliest.getFullYear(), earliest.getMonth(), 1).getTime()
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => { element?.close(); previous?.focus() }
  }, [open])
  const choose = (value: string) => {
    if (value === '') { onChange('', ''); return }
    if (value === 'custom') {
      setStart(from); setEnd(to)
      const initial = from ? new Date(`${from}T12:00:00`) : new Date()
      setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1))
      setOpen(true); return
    }
    const date = new Date()
    date.setDate(date.getDate() - (Number(value) - 1))
    onChange(dateValue(date), today)
  }
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  return <>
    <FilterDropdown label="When" placeholder="Any time" value={from ? 'custom' : ''}
      selectedLabelOverride={from ? `${displayDate(from)} – ${displayDate(to)}` : undefined}
      options={[{ value: '', label: 'Any time' }, { value: '1', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '15', label: 'Last 15 days' }]}
      footerOption={{ value: 'custom', label: 'Choose dates…' }} onChange={choose} />
    {open && <dialog ref={dialog} aria-labelledby="activity-dates-title" onCancel={() => setOpen(false)} className="w-[min(25rem,calc(100%-2rem))] rounded-2xl border border-slate-200 p-5 shadow-xl backdrop:bg-slate-950/40">
      <h2 id="activity-dates-title" className="text-lg font-semibold">Choose a date range</h2>
      <p className="mt-1 text-sm text-slate-600">Select dates within the last 15 days.</p>
      <p aria-live="polite" className="my-4 rounded-lg bg-slate-50 p-3 text-sm">{start ? displayDate(start) : 'Start date'} → {end ? displayDate(end) : 'End date'}</p>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="Previous month" disabled={month.getTime() <= earliestMonth} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={20} /></button>
        <span aria-live="polite" className="text-sm font-semibold">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button type="button" aria-label="Next month" disabled={month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={20} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} className="py-2 text-xs text-slate-500">{day}</span>)}
        {Array.from({ length: month.getDay() }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const value = dateValue(new Date(month.getFullYear(), month.getMonth(), index + 1))
          const selected = value === start || value === end
          return <button key={value} type="button" aria-label={displayDate(value)} aria-pressed={selected} disabled={value > today || value < earliestDate} onClick={() => {
            if (!start || end || value < start) { setStart(value); setEnd('') } else setEnd(value)
          }} className={`min-h-10 rounded-lg disabled:opacity-25 ${selected ? 'bg-hq-teal text-white' : start && end && value > start && value < end ? 'bg-teal-50 text-teal-900' : 'hover:bg-slate-100'}`}>{index + 1}</button>
        })}
      </div>
      <div className="mt-5 flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button type="button" disabled={!start || !end} onClick={() => { onChange(start, end); setOpen(false) }} className="inline-flex items-center gap-2 rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Check aria-hidden="true" className="h-4 w-4" />Use these dates</button>
      </div>
    </dialog>}
  </>
}
