import clsx from 'clsx'

type Status = 'queued' | 'running' | 'success' | 'failed' | 'idle' | string

const styles: Record<string, string> = {
  queued: 'bg-amber-50 text-amber-700 border-amber-100',
  running: 'bg-blue-50 text-blue-700 border-blue-100',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  failed: 'bg-rose-50 text-rose-700 border-rose-100',
  idle: 'bg-slate-50 text-slate-600 border-slate-200',
}

export function StatusBadge({ status }: { status: Status }) {
  const normalized = status?.toLowerCase?.() ?? 'idle'
  const style = styles[normalized] ?? styles.idle
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border', style)}>
      <span className="h-2 w-2 rounded-full bg-current opacity-80" />
      {status || 'Idle'}
    </span>
  )
}
