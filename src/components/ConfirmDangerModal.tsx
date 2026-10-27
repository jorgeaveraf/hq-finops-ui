import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { Button } from './Button'

type Props = {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmText?: string
  confirmTextLabel?: string
  danger?: boolean
  isConfirming?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDangerModal({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmText,
  confirmTextLabel = 'Type to confirm',
  danger = true,
  isConfirming = false,
  onCancel,
  onConfirm,
}: Props) {
  const [input, setInput] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const inputId = useId()

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    titleRef.current?.focus()
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close()
      else dialog.removeAttribute('open')
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  if (!open) return null

  const handleCancel = () => { setInput(''); onCancel() }
  const handleConfirm = () => { setInput(''); onConfirm() }

  const requiresInput = Boolean(confirmText)
  const isMatch = !requiresInput || input.trim() === confirmText

  return (
    <dialog ref={dialogRef} aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={(event) => { event.preventDefault(); if (!isConfirming) handleCancel() }} className="fixed left-1/2 top-1/2 m-0 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 ref={titleRef} tabIndex={-1} id={titleId} className="text-lg font-semibold text-slate-900 outline-none">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
          <button
            type="button"
            disabled={isConfirming}
            className="text-slate-400 hover:text-slate-600 transition"
            onClick={handleCancel}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {requiresInput && (
            <div className="space-y-2">
              <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">
                {confirmTextLabel}{' '}
                <span className="text-slate-500">(enter “{confirmText}”)</span>
              </label>
              <input
                id={inputId}
                type="text"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-hq-teal focus:ring-2 focus:ring-hq-teal/20"
                placeholder={confirmText}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isConfirming}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <Button variant="secondary" onClick={handleCancel} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isMatch || isConfirming}
            variant={danger ? 'danger' : 'primary'}
            className={clsx(danger ? 'shadow-none focus:ring-rose-500/30' : '')}
          >
            {isConfirming ? 'Deleting...' : confirmLabel}
          </Button>
        </div>
    </dialog>
  )
}
