import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'
import { InfoTooltip } from './InfoTooltip'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  description?: string
  tooltip?: string
  error?: string
  icon?: ReactNode
  trailing?: ReactNode
}

export function TextField({
  label,
  description,
  tooltip,
  error,
  icon,
  trailing,
  className,
  ...rest
}: TextFieldProps) {
  const generatedId = useId()
  const inputId = rest.id ?? generatedId
  return (
    <div className="block space-y-1.5">
      <div className="flex items-center gap-1">
        <label className="label" htmlFor={inputId}>{label}</label>
        {tooltip && <InfoTooltip label={`About ${label.toLowerCase()}`} text={tooltip} />}
      </div>
      <div className="relative">
        {icon && <span className="absolute left-3 top-3 text-slate-400">{icon}</span>}
        <input
          {...rest}
          id={inputId}
          aria-label={label}
          className={clsx(
            'input-base',
            icon && 'pl-10',
            trailing && 'pr-11',
            error && 'border-rose-400 ring-rose-100',
            className,
          )}
        />
        {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}
