import type { Requirement } from '@baton/shared'
import { StatusDot } from '../../components/status-dot'

type RequirementNodeProps = {
  requirement: Requirement
  active: boolean
  expanded: boolean
  onOpen: () => void
  onToggle: () => void
}

// Section-header weight: bold semibold title, status dot on the LEFT to signal
// identity. Two sibling buttons preserve a11y; chevron carries aria-expanded.
export const RequirementNode = ({
  requirement,
  active,
  expanded,
  onOpen,
  onToggle,
}: RequirementNodeProps) => (
  <div
    className={`group flex w-full items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 ${
      active ? 'bg-blue-50' : 'hover:bg-gray-100/70'
    }`}
  >
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={`${requirement.id}-tasks`}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${requirement.title}`}
      className="flex h-5 w-5 shrink-0 items-center justify-center text-gray-500 hover:text-gray-800"
    >
      <svg
        viewBox="0 0 16 16"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={`transition-transform duration-200 ease-out ${expanded ? 'rotate-90' : ''}`}
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
    </button>
    <StatusDot status={requirement.status} />
    <button
      type="button"
      onClick={onOpen}
      className={`flex-1 truncate text-left text-sm font-semibold tracking-tight ${
        active ? 'text-blue-900' : 'text-gray-900'
      }`}
    >
      {requirement.title}
    </button>
  </div>
)
