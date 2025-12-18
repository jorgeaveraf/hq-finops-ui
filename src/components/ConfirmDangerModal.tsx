import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!open) {
      setInput('')
    }
  }, [open])

  if (!open) return null

  const requiresInput = Boolean(confirmText)
  const isMatch = !requiresInput || input.trim() === confirmText

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 transition"
            onClick={onCancel}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {requiresInput && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                {confirmTextLabel}{' '}
                <span className="text-slate-500">(enter “{confirmText}”)</span>
              </label>
              <input
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
          <Button variant="secondary" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!isMatch || isConfirming}
            variant={danger ? 'danger' : 'primary'}
            className={clsx(danger ? 'shadow-none focus:ring-rose-500/30' : '')}
          >
            {isConfirming ? 'Deleting...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
