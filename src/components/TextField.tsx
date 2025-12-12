import type { InputHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  description?: string
  error?: string
  icon?: ReactNode
  trailing?: ReactNode
}

export function TextField({
  label,
  description,
  error,
  icon,
  trailing,
  className,
  ...rest
}: TextFieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <div className="relative">
        {icon && <span className="absolute left-3 top-3 text-slate-400">{icon}</span>}
        <input
          className={clsx(
            'input-base',
            icon && 'pl-10',
            trailing && 'pr-11',
            error && 'border-rose-400 ring-rose-100',
            className,
          )}
          {...rest}
        />
        {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </label>
  )
}
