import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type ExpiryChoice = 'never' | '30' | '60' | '90' | 'custom'

const atMidnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const daysFromToday = (days: number) => {
  const date = atMidnight(new Date())
  date.setDate(date.getDate() + days)
  return dateValue(date)
}

export function KeyExpiryPicker({ choice, date, maximumDays, onChange }: {
  choice: ExpiryChoice
  date: string
  maximumDays: number
  onChange: (choice: ExpiryChoice, date: string) => void
}) {
  const today = atMidnight(new Date())
  const maximum = atMidnight(new Date())
  maximum.setDate(maximum.getDate() + maximumDays)
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [calendarOpen, setCalendarOpen] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!calendarOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!calendarRef.current?.contains(event.target as Node)) setCalendarOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setCalendarOpen(false) }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape, true)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape, true) }
  }, [calendarOpen])
  const options: Array<{ value: ExpiryChoice; label: string }> = [
    { value: 'never', label: 'No expiration' },
    ...([30, 60, 90] as const).filter((days) => days <= maximumDays).map((days) => ({ value: String(days) as ExpiryChoice, label: `${days} days` })),
    { value: 'custom', label: 'Choose date' },
  ]
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)] as Array<number | null>
  const previousMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1)
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const earliestMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const latestMonth = new Date(maximum.getFullYear(), maximum.getMonth(), 1)

  return <fieldset className="text-sm">
    <legend className="font-medium text-slate-900">Expiration</legend>
    <p className="mt-0.5 text-xs text-slate-600">Optional · up to {maximumDays} days</p>
    <div ref={calendarRef} className="mt-3"><div className="flex flex-wrap gap-2">{options.map((option) => <button key={option.value} type="button" aria-pressed={choice === option.value} aria-expanded={option.value === 'custom' ? calendarOpen : undefined} onClick={() => { if (option.value === 'custom') setCalendarOpen((open) => !open); else { setCalendarOpen(false); onChange(option.value, option.value === 'never' ? '' : daysFromToday(Number(option.value))) } }} className={`rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal ${choice === option.value ? 'border-hq-teal bg-teal-50 font-semibold text-hq-teal' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}>{option.label}</button>)}</div>{calendarOpen && <div className="mt-3 w-full max-w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Choose expiration date">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" disabled={previousMonth < earliestMonth} onClick={() => setMonth(previousMonth)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft aria-hidden="true" size={16} /></button>
        <span className="font-semibold text-slate-900">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button type="button" aria-label="Next month" disabled={nextMonth > latestMonth} onClick={() => setMonth(nextMonth)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronRight aria-hidden="true" size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500" aria-hidden="true">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={index} className="py-1">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">{cells.map((day, index) => {
        if (!day) return <span key={`empty-${index}`} />
        const value = new Date(month.getFullYear(), month.getMonth(), day)
        const selected = date === dateValue(value)
        return <button key={day} type="button" aria-label={value.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} aria-pressed={selected} disabled={value < today || value > maximum} onClick={() => { onChange('custom', dateValue(value)); setCalendarOpen(false) }} className={`aspect-square rounded-lg text-sm focus-visible:outline focus-visible:outline-hq-teal disabled:text-slate-300 ${selected ? 'bg-hq-teal font-semibold text-white' : 'text-slate-800 hover:bg-teal-50'}`}>{day}</button>
      })}</div>
      <p className="mt-3 text-xs text-slate-600">{date ? `Expires ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Select a date to continue.'}</p>
    </div>}</div>
  </fieldset>
}
