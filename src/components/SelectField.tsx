import type { SelectHTMLAttributes } from 'react'
import clsx from 'clsx'

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  description?: string
  error?: string
}

export function SelectField({ label, description, error, className, children, ...rest }: SelectFieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <select
        className={clsx(
          'input-base appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23667\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")] bg-no-repeat bg-[right_0.9rem_center]',
          error && 'border-rose-400 ring-rose-100',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </label>
  )
}
