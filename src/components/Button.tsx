import type { ButtonHTMLAttributes, ReactNode, ReactElement } from 'react'
import { cloneElement, isValidElement } from 'react'
import clsx from 'clsx'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  asChild?: boolean
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className,
  asChild,
  ...rest
}: ButtonProps) {
  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
  type Size = 'sm' | 'md' | 'lg'

  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition focus:outline-none focus:ring-2 focus:ring-hq-teal/20 disabled:opacity-60 disabled:cursor-not-allowed'
  const variants: Record<Variant, string> = {
    primary: 'bg-hq-teal text-white hover:bg-hq-tealDark shadow-soft',
    secondary: 'bg-white text-slate-900 border border-slate-200 hover:border-hq-teal/40',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
    danger: 'bg-rose-500 text-white hover:bg-rose-600',
  }
  const sizes: Record<Size, string> = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  }

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<any>
    return cloneElement(child, {
      className: clsx(base, variants[variant], sizes[size], className, child.props?.className),
    })
  }

  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}
