import type { RequirementStatus, TaskStatus } from '@baton/shared'

// Compact row indicator: a 6px colored dot. Companion to StatusBadge (which
// stays for detail views where labels deserve room). The dot's title + aria
// expose the status label for hover and assistive tech.
//
// Two session-specific variants beyond simple colors:
//   - streaming: amber + Tailwind animate-pulse (turn in progress)
//   - detached:  hollow outline (worker machine alive, but no daemon for this
//                particular session — message would just queue)
const CLASSES: Record<string, string> = {
  active: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  busy: 'bg-amber-500',
  streaming: 'bg-amber-500 animate-pulse',
  done: 'bg-emerald-500',
  failed: 'bg-red-500',
  todo: 'bg-gray-300',
  cancelled: 'bg-gray-200',
  idle: 'bg-emerald-500',
  closed: 'bg-gray-300',
  offline: 'bg-gray-400',
  detached: 'border border-gray-400 bg-transparent',
}

type StatusDotProps = {
  status:
    | RequirementStatus
    | TaskStatus
    | 'idle'
    | 'busy'
    | 'streaming'
    | 'closed'
    | 'offline'
    | 'detached'
  className?: string
}

export const StatusDot = ({ status, className = '' }: StatusDotProps) => {
  const label = status.replace('_', ' ')
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${CLASSES[status] ?? 'bg-gray-300'} ${className}`}
    />
  )
}
