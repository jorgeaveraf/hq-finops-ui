import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

export function InfoTooltip({ label, text, align = 'left' }: { label: string; text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.blur()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (document.activeElement !== buttonRef.current) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        <Info aria-hidden="true" className="h-4 w-4" />
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-30 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg`}
        >
          {text}
        </span>
      )}
    </span>
  )
}
