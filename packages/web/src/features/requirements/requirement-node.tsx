import type { Requirement } from '@baton/shared'
import { StatusBadge } from '../../components/status-badge'

type RequirementNodeProps = { requirement: Requirement; active: boolean; onOpen: () => void }

export const RequirementNode = ({ requirement, active, onOpen }: RequirementNodeProps) => (
  <button
    type="button"
    onClick={onOpen}
    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
      active ? 'bg-blue-50 text-blue-900' : 'text-gray-800 hover:bg-gray-100'
    }`}
  >
    <span className="truncate font-medium">{requirement.title}</span>
    <StatusBadge status={requirement.status} />
  </button>
)
