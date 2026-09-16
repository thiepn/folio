import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
}

export function IconButton({ icon, label, className = '', type = 'button', ...props }: IconButtonProps) {
  return (
    <button type={type} className={`icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>
      <Icon name={icon} />
    </button>
  )
}
