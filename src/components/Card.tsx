import type { PropsWithChildren, ReactNode } from 'react'
import clsx from 'clsx'

type CardProps = PropsWithChildren<{
  title?: ReactNode
  titleSuffix?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}>

export function Card({ title, titleSuffix, description, actions, className, children }: CardProps) {
  return (
    <section className={clsx('glass-card p-6', className)}>
      {(title || titleSuffix || description || actions) && (
        <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            {(title || titleSuffix) && (
              <div className="flex items-center gap-1.5">
                {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
                {titleSuffix}
              </div>
            )}
            {description && <p className="text-sm text-slate-600 mt-1">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}
