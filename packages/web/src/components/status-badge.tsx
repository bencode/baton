import type { RequirementStatus, TaskStatus } from '@baton/shared'

// Detail-view status label: ring-style pill with uppercase tracking — reads as
// "tag/label", not "highlighted text". For dense rows use <StatusDot> instead.
const STYLES: Record<string, string> = {
  active: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/60',
  done: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60',
  in_progress: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70',
  failed: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200/60',
  todo: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200',
  cancelled: 'bg-gray-50 text-gray-400 ring-1 ring-inset ring-gray-200',
}

const LABELS: Record<string, string> = { in_progress: 'in progress' }

type StatusBadgeProps = { status: RequirementStatus | TaskStatus }

export const StatusBadge = ({ status }: StatusBadgeProps) => (
  <span
    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase ${STYLES[status] ?? 'bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200'}`}
  >
    {LABELS[status] ?? status}
  </span>
)
