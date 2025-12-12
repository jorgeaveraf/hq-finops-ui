import type { ReactElement } from 'react'
import clsx from 'clsx'
import { CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react'

type Variant = 'info' | 'success' | 'warning' | 'error'

const iconMap: Record<Variant, ReactElement> = {
  info: <Info className="h-5 w-5" />,
  success: <CheckCircle2 className="h-5 w-5" />,
  warning: <AlertTriangle className="h-5 w-5" />,
  error: <XCircle className="h-5 w-5" />,
}

export function Alert({
  title,
  description,
  variant = 'info',
}: {
  title: string
  description?: string
  variant?: Variant
}) {
  const styles: Record<Variant, string> = {
    info: 'bg-blue-50 text-blue-800 border-blue-100',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    warning: 'bg-amber-50 text-amber-800 border-amber-100',
    error: 'bg-rose-50 text-rose-800 border-rose-100',
  }
  return (
    <div className={clsx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', styles[variant])}>
      <div className="mt-0.5">{iconMap[variant]}</div>
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-1 text-sm leading-relaxed">{description}</p>}
      </div>
    </div>
  )
}
