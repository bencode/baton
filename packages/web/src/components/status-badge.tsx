import type { RequirementStatus, TaskStatus } from '@baton/shared'

// Web presentation of a domain status: small colored pill. Covers both
// RequirementStatus and TaskStatus; unknown values fall back to gray.
const STYLES: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
}

const LABELS: Record<string, string> = { in_progress: 'in progress' }

type StatusBadgeProps = { status: RequirementStatus | TaskStatus }

export const StatusBadge = ({ status }: StatusBadgeProps) => (
  <span
    className={`rounded px-1.5 py-0.5 text-[11px] leading-none ${STYLES[status] ?? 'bg-gray-100 text-gray-500'}`}
  >
    {LABELS[status] ?? status}
  </span>
)
