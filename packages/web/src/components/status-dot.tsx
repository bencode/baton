import type { RequirementStatus, TaskStatus } from '@baton/shared'

// Compact row indicator: a 6px colored dot. Companion to StatusBadge (which
// stays for detail views where labels deserve room). The dot's title + aria
// expose the status label for hover and assistive tech.
const COLORS: Record<string, string> = {
  active: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  busy: 'bg-amber-500',
  done: 'bg-emerald-500',
  failed: 'bg-red-500',
  todo: 'bg-gray-300',
  cancelled: 'bg-gray-200',
  idle: 'bg-gray-400',
  closed: 'bg-gray-300',
  offline: 'bg-gray-300',
}

type StatusDotProps = {
  status: RequirementStatus | TaskStatus | 'idle' | 'busy' | 'closed' | 'offline'
  className?: string
}

export const StatusDot = ({ status, className = '' }: StatusDotProps) => {
  const label = status.replace('_', ' ')
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLORS[status] ?? 'bg-gray-300'} ${className}`}
    />
  )
}
