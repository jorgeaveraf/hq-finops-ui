import { Building2, ShieldCheck } from 'lucide-react'

type SuperadminAccessSummaryProps = {
  founder?: boolean
  prospective?: boolean
  ariaLabel?: string
}

export function SuperadminAccessSummary({ founder = false, prospective = false, ariaLabel = 'Superadmin access' }: SuperadminAccessSummaryProps) {
  return <section aria-label={ariaLabel} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-hq-teal"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Access model</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Superadmin</h3>
          <p className="mt-1 text-sm text-slate-600">{prospective ? 'Full access will be assigned when this person is created.' : 'Full access across FinOps, without individual grants.'}</p>
        </div>
      </div>
      {founder && <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-hq-teal">Founder</span>}
    </div>
    <dl className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      <div className="flex gap-3 px-5 py-4 sm:px-6"><Building2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-hq-teal" /><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entity coverage</dt><dd className="mt-1 text-sm font-medium text-slate-900">All current and future entities</dd></div></div>
      <div className="flex gap-3 px-5 py-4 sm:px-6"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-hq-teal" /><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Administration</dt><dd className="mt-1 text-sm font-medium text-slate-900">All administrative actions</dd></div></div>
    </dl>
  </section>
}
