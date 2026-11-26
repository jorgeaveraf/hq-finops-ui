import { useState } from 'react'
import { Check, ChevronDown, RefreshCw, X } from 'lucide-react'
import { refreshActive, useReportRefresh, type RefreshRun } from './ReportRefreshContext'

const reports = [
  { name: 'AP / AR aging', enabled: true },
  { name: 'Balance Sheet', enabled: false },
  { name: 'Invoices', enabled: false },
  { name: 'Journal Entries', enabled: false },
  { name: 'Payments', enabled: false },
  { name: 'Profit and Loss', enabled: false },
] as const

const runMessage = (run: RefreshRun) => {
  if (run.status === 'queued') return 'Request accepted. The report will start shortly.'
  if (run.status === 'running') return 'Refreshing AP / AR aging…'
  if (run.status === 'passed') return 'AP / AR aging refreshed successfully.'
  if (run.status === 'completed_with_warnings') return 'Refresh finished with warnings. Some data may not be current.'
  if (run.status === 'timed_out') return 'The result could not be confirmed. Contact an administrator before requesting another refresh.'
  return 'The refresh did not complete. Try again later.'
}

export function ReportRefreshControl() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { run, busy, error, startRefresh, clearError } = useReportRefresh()
  const unavailable = busy || Boolean(run && (refreshActive(run.status) || run.status === 'timed_out'))

  return <section aria-label="Report refresh" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-base font-semibold text-slate-900">Reports</h2><p className="mt-1 text-sm text-slate-600">Request a fresh export from the source system.</p></div>
      <div className="relative">
        <button type="button" aria-expanded={menuOpen} aria-controls="report-refresh-options" disabled={unavailable} onClick={() => setMenuOpen(!menuOpen)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-wait disabled:opacity-50"><RefreshCw aria-hidden="true" className="h-4 w-4" />Refresh report<ChevronDown aria-hidden="true" className="h-4 w-4" /></button>
        {menuOpen && <div id="report-refresh-options" className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Choose report</p>{reports.map((report) => <button key={report.name} type="button" disabled={!report.enabled} onClick={() => { setMenuOpen(false); setConfirmOpen(true); clearError() }} className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm text-slate-900 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white"><span>{report.name}</span>{!report.enabled && <span className="text-xs">Coming soon</span>}</button>)}</div>}
      </div>
    </div>
    {run && <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-sm ${run.status === 'passed' ? 'bg-teal-50 text-hq-teal' : refreshActive(run.status) ? 'bg-slate-50 text-slate-700' : 'bg-amber-50 text-amber-900'}`}>{runMessage(run)}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    {confirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmOpen(false) }}><div role="dialog" aria-modal="true" aria-labelledby="aging-refresh-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"><h3 id="aging-refresh-title" className="text-lg font-semibold text-slate-950">Refresh AP / AR aging?</h3><p className="mt-2 text-sm text-slate-600">This starts a new export for all configured entities. It may take several minutes and does not create a BigQuery snapshot.</p><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setConfirmOpen(false)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" />Cancel</button><button type="button" disabled={unavailable} onClick={() => { void startRefresh().then(() => setConfirmOpen(false)) }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" />{busy ? 'Requesting…' : 'Request refresh'}</button></div></div></div>}
  </section>
}
