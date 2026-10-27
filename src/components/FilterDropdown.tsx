import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Check, ChevronDown, Plus } from 'lucide-react'
import { InfoTooltip } from './InfoTooltip'

type FilterOption = { value: string; label: string }

type FilterDropdownProps = {
  label: string
  placeholder: string
  value: string
  options: FilterOption[]
  actionOption?: FilterOption
  footerOption?: FilterOption
  selectedLabelOverride?: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  description?: string
  tooltip?: string
  error?: string
  className?: string
}

export function FilterDropdown({
  label, placeholder, value, options, actionOption, footerOption, selectedLabelOverride, onChange, disabled = false, required = false, description, tooltip, error, className = '',
}: FilterDropdownProps) {
  const lastOption = footerOption ?? actionOption
  const allOptions = lastOption ? [...options, lastOption] : options
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  const setRoot = useCallback((element: HTMLDivElement | null) => {
    rootRef.current = element
    setDialog(element?.closest('dialog') ?? null)
  }, [])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const typeaheadRef = useRef({ text: '', at: 0 })
  const selectedIndex = allOptions.findIndex((option) => option.value === value)
  const selectedLabel = selectedLabelOverride ?? (selectedIndex >= 0 ? allOptions[selectedIndex].label : placeholder)

  useLayoutEffect(() => {
    if (!open || !dialog) return
    const position = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const dialogBounds = dialog.getBoundingClientRect()
      const footer = dialog.querySelector('[data-dialog-footer]')?.getBoundingClientRect()
      const bottomLimit = footer?.top ?? dialogBounds.bottom
      const below = bottomLimit - trigger.bottom - 4
      setMenuPosition({
        left: trigger.left - dialogBounds.left,
        top: trigger.bottom - dialogBounds.top + 4,
        width: trigger.width,
        maxHeight: Math.max(80, Math.min(240, below)),
      })
    }
    position()
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
    }
  }, [open, dialog])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !optionsRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) {
      const option = optionRefs.current[activeIndex]
      const list = option?.parentElement
      option?.focus({ preventScroll: true })
      if (!option || !list) return
      const optionBounds = option.getBoundingClientRect()
      const listBounds = list.getBoundingClientRect()
      if (optionBounds.top < listBounds.top) list.scrollTop -= listBounds.top - optionBounds.top
      else if (optionBounds.bottom > listBounds.bottom) list.scrollTop += optionBounds.bottom - listBounds.bottom
    }
  }, [open, activeIndex])

  const openAt = (index: number) => {
    if (disabled || allOptions.length === 0) return
    typeaheadRef.current = { text: '', at: 0 }
    setActiveIndex(index)
    setOpen(true)
  }

  const select = (option: FilterOption) => {
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={setRoot} className="relative w-full" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget) && !optionsRef.current?.contains(event.relatedTarget as Node)) setOpen(false)
    }}>
      <div className="mb-1.5 flex items-center gap-1">
        <span className="label" id={`${id}-label`}>{label}</span>
        {tooltip && <InfoTooltip label={`About ${label.toLowerCase()}`} text={tooltip} />}
      </div>
      <button
        ref={triggerRef}
        type="button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : description ? `${id}-description` : undefined}
        disabled={disabled || allOptions.length === 0}
        className={`input-base flex min-h-11 items-center justify-between gap-3 text-left hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-hq-teal/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${error ? 'border-rose-400' : ''} ${className}`}
        onClick={() => open ? setOpen(false) : openAt(Math.max(selectedIndex, 0))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            openAt(event.key === 'Home' ? 0 : event.key === 'End' ? allOptions.length - 1
              : selectedIndex >= 0 ? selectedIndex : event.key === 'ArrowUp' ? allOptions.length - 1 : 0)
          }
        }}
      >
        <span id={`${id}-value`} className={`truncate ${selectedIndex < 0 ? 'text-slate-500' : 'text-slate-900'}`}>{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <DropdownPortal target={dialog}>
        <div
          ref={optionsRef}
          id={`${id}-options`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className={`${dialog ? 'absolute z-50' : 'absolute left-0 top-full z-30 mt-1 w-full'} flex max-h-60 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/15`}
          style={dialog ? menuPosition ?? { visibility: 'hidden' } : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              triggerRef.current?.focus()
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + allOptions.length) % allOptions.length)
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              setActiveIndex(event.key === 'Home' ? 0 : allOptions.length - 1)
            } else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
              const now = Date.now()
              const text = (now - typeaheadRef.current.at > 700 ? '' : typeaheadRef.current.text) + event.key.toLowerCase()
              typeaheadRef.current = { text, at: now }
              const match = allOptions.findIndex((option) => option.label.toLowerCase().startsWith(text))
              if (match >= 0) {
                event.preventDefault()
                setActiveIndex(match)
              }
            }
          }}
        >
          <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element }}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={value === option.value}
              tabIndex={-1}
              type="button"
              className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm focus:outline-none ${index === activeIndex ? 'bg-hq-teal/10 text-slate-900' : value === option.value ? 'bg-hq-teal/5 text-hq-teal' : 'text-slate-800 hover:bg-slate-50'}`}
              onClick={() => select(option)}
            >
              <span className="min-w-0 break-words">{option.label}</span>
              {value === option.value && <Check className="h-4 w-4 shrink-0 text-hq-teal" aria-hidden="true" />}
            </button>
          ))}
          </div>
          {lastOption && <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-1.5">
            <button
              ref={(element) => { optionRefs.current[options.length] = element }}
              role="option"
              aria-selected={value === lastOption.value}
              tabIndex={-1}
              type="button"
              className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold focus:outline-none ${footerOption ? 'text-slate-700' : 'text-hq-teal'} ${activeIndex === options.length ? 'bg-hq-teal/15' : 'hover:bg-hq-teal/10'}`}
              onClick={() => select(lastOption)}
            >
              {footerOption ? <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /> : <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className="flex-1">{lastOption.label}</span>
              {value === lastOption.value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
          </div>}
        </div>
      </DropdownPortal>}
      {description && !error && <p id={`${id}-description`} className="mt-1.5 text-xs text-slate-500">{description}</p>}
      {error && <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
  )
}

function DropdownPortal({ target, children }: { target: HTMLDialogElement | null; children: ReactNode }) {
  return target ? createPortal(children, target) : children
}
