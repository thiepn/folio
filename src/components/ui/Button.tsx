import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'outline' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: IconName
  children: ReactNode
}

export function Button({ variant = 'outline', icon, children, className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={`button button--${variant} ${className}`.trim()} {...props}>
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
    </button>
  )
}
