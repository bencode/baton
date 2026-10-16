import type { ComponentProps } from 'react'
import { ChevronDownIcon } from './icons'

export type SelectControlProps = Omit<
  ComponentProps<'select'>,
  'className' | 'multiple' | 'size'
> & {
  tone?: 'quiet' | 'field'
  className?: string
}

export const SelectControl = ({
  tone = 'field',
  className = '',
  children,
  ...props
}: SelectControlProps) => (
  <span className={`ui-select ui-select-${tone} ${className}`}>
    <select {...props}>{children}</select>
    <span className="ui-select-arrow" aria-hidden>
      <ChevronDownIcon />
    </span>
  </span>
)
