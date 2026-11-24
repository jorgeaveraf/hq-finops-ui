import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Info } from 'lucide-react'

type ReferenceTooltipProps = {
  reference: string
  open: boolean
  anotherOpen: boolean
  onToggle: () => void
  onClose: () => void
}

export function ReferenceTooltip({ reference, open, anotherOpen, onToggle, onClose }: ReferenceTooltipProps) {
  const id = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const [below, setBelow] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (copyState !== 'copied') return
    const timeout = window.setTimeout(() => setCopyState('idle'), 2000)
    return () => window.clearTimeout(timeout)
  }, [copyState])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  const toggle = (button: HTMLButtonElement) => {
    if (!open) {
      const rect = button.getBoundingClientRect()
      setBelow(rect.top < 145 && window.innerHeight - rect.bottom > rect.top)
      setCopyState('idle')
    }
    onToggle()
  }

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return <span ref={rootRef} className="reference-tooltip">
    <button type="button" aria-label="Support reference" aria-expanded={open} aria-controls={open ? id : undefined} onClick={(event) => toggle(event.currentTarget)} className="reference-trigger inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">
      <Info size={16} aria-hidden="true" />
    </button>
    {!open && !anotherOpen && <span role="tooltip" className="reference-hint">View reference ID</span>}
    {open && <span id={id} role="dialog" aria-label="Support reference" className={`reference-popover${below ? ' reference-popover-below' : ''}`}>
      <span className="reference-popover-label">Reference ID</span>
      <span className="reference-popover-value">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-xs text-slate-800">{reference}</code>
        <button type="button" onClick={() => void copyReference()} aria-label={copyState === 'copied' ? 'Reference ID copied' : 'Copy reference ID'} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-hq-teal hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">
          {copyState === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        </button>
      </span>
      {copyState !== 'idle' && <span role="status" className={`mt-1 block text-xs ${copyState === 'failed' ? 'text-rose-700' : 'text-hq-teal'}`}>{copyState === 'failed' ? 'Could not copy' : 'Copied'}</span>}
    </span>}
  </span>
}
