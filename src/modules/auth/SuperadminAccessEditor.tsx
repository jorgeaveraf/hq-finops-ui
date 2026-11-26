import type { AccessUser } from './AccessUserDetailPage'
import { Check, LoaderCircle, X } from 'lucide-react'

type Props = {
  person: AccessUser
  currentFounder: { name: string; email: string } | null
  isFounder: boolean
  canReceiveFounder: boolean
  confirmingTransfer: boolean
  confirmation: string
  busy: boolean
  onStartTransfer: () => void
  onCancelTransfer: () => void
  onConfirmationChange: (value: string) => void
  onConfirmTransfer: () => void
  onRemoveSuperadmin: () => void
}

export function SuperadminAccessEditor({ person, currentFounder, isFounder, canReceiveFounder, confirmingTransfer, confirmation, busy, onStartTransfer, onCancelTransfer, onConfirmationChange, onConfirmTransfer, onRemoveSuperadmin }: Props) {
  const recipient = person.display_name || person.email

  return <div className="space-y-5">
    <p aria-label="Current access" className="text-sm font-medium text-slate-700">Full access <span aria-hidden="true" className="mx-1 text-slate-400">·</span> current and future entities{person.is_super_admin_founder && <span className="ml-2 font-semibold text-hq-teal">· Founder</span>}</p>

    {confirmingTransfer ? <section id="founder-transfer-confirmation" aria-labelledby="founder-transfer-title" className="rounded-xl border border-teal-300 bg-teal-50 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-hq-teal">Founder ownership</p>
      <h3 id="founder-transfer-title" className="mt-1 text-lg font-semibold text-slate-950">Transfer Founder status</h3>
      <p className="mt-1 text-sm text-slate-700">Review who will hold ownership after this change.</p>
      <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]"><dt className="text-sm font-medium text-slate-600">New Founder</dt><dd className="text-sm font-semibold text-slate-950">{recipient}<span className="block break-all font-normal text-slate-600">{person.email}</span></dd></div>
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]"><dt className="text-sm font-medium text-slate-600">Your account</dt><dd className="text-sm text-slate-950"><span className="font-semibold">{currentFounder?.name || currentFounder?.email || 'You'}</span>{currentFounder?.email && <span className="block break-all text-slate-600">{currentFounder.email}</span>}<span className="mt-1 block">Loses Founder ownership; keeps full superadmin access.</span></dd></div>
      </dl>
      <label htmlFor="founder-transfer-phrase" className="mt-5 block text-sm font-medium text-slate-900">Type I AM NO LONGER FOUNDER to confirm</label>
      <input id="founder-transfer-phrase" autoFocus type="text" autoComplete="off" spellCheck={false} value={confirmation} disabled={busy} onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} onChange={(event) => onConfirmationChange(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 focus:border-hq-teal focus:outline-none focus:ring-2 focus:ring-hq-teal/20" />
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <button type="button" aria-label="Cancel transfer" disabled={busy} onClick={onCancelTransfer} className="icon-first-action rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Cancel transfer</span></button>
        <button type="button" aria-label="Confirm transfer" disabled={busy || confirmation !== 'I AM NO LONGER FOUNDER' || !canReceiveFounder} onClick={onConfirmTransfer} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}<span className="icon-first-label">{busy ? 'Transferring…' : 'Confirm transfer'}</span></button>
      </div>
    </section> : isFounder && !person.is_super_admin_founder && <div className="space-y-4">
      {canReceiveFounder && <section aria-labelledby="founder-ownership-title">
        <h3 id="founder-ownership-title" className="text-sm font-semibold text-slate-950">Founder ownership</h3><p className="mt-1 text-sm text-slate-600">Transfer ownership to this superadmin. You will remain a superadmin.</p>
      </section>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
        {canReceiveFounder && <button type="button" disabled={busy} onClick={onStartTransfer} aria-controls="founder-transfer-confirmation" className="inline-flex min-h-10 min-w-52 items-center justify-center rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">Transfer Founder status</button>}
        <button type="button" disabled={busy} onClick={onRemoveSuperadmin} className="inline-flex min-h-10 min-w-52 items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Remove superadmin access</button>
      </div>
    </div>}
  </div>
}
