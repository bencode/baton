import type { Requirement, RequirementStatus } from '@baton/shared'
import { StateChip } from '../../components/state-chip'

type RequirementNodeProps = {
  requirement: Requirement
  active: boolean
  expanded: boolean
  onOpen: () => void
  onToggle: () => void
}

// Section-header weight: bold semibold title, code (R-N) sits before the
// title in mono. Status goes on the RIGHT as a chip so the left column reads
// purely as structure (chevron + code + title). Two sibling buttons preserve
// a11y; chevron carries aria-expanded.
export const RequirementNode = ({
  requirement,
  active,
  expanded,
  onOpen,
  onToggle,
}: RequirementNodeProps) => {
  const cancelled = requirement.status === 'cancelled'
  return (
    <div
      className={`group flex w-full items-center gap-1 rounded-md px-1 py-1 transition-colors duration-150 ${
        active ? 'bg-ui-selected' : 'hover:bg-ui-hover/70'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${requirement.id}-tasks`}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${requirement.title}`}
        className="ui-icon-button"
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
      <button
        type="button"
        onClick={onOpen}
        className={`ui-focus flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded truncate text-left text-[13px] font-medium md:min-h-8 [@media(pointer:coarse)]:min-h-11 ${
          active ? 'text-ui-selected-text' : 'text-ui-text'
        }`}
      >
        <span className="shrink-0 font-mono text-xs md:text-[11px] font-normal text-ui-muted">
          {requirement.code}
        </span>
        <span className={`truncate ${cancelled ? 'line-through opacity-60' : ''}`}>
          {requirement.title}
        </span>
      </button>
      <RequirementStateChip status={requirement.status} />
    </div>
  )
}

const RequirementStateChip = ({ status }: { status: RequirementStatus }) => {
  if (status === 'active') return <StateChip kind="none" />
  if (status === 'done') return <StateChip kind="text" label="done" tone="success" />
  return <StateChip kind="text" label="cancelled" tone="muted" />
}
