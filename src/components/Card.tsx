import type { PropsWithChildren, ReactNode } from 'react'
import clsx from 'clsx'

type CardProps = PropsWithChildren<{
  title?: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}>

export function Card({ title, description, actions, className, children }: CardProps) {
  return (
    <section className={clsx('glass-card p-6', className)}>
      {(title || description || actions) && (
        <header className="flex items-start justify-between gap-4 mb-4">
          <div>
            {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
            {description && <p className="text-sm text-slate-600 mt-1">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}
