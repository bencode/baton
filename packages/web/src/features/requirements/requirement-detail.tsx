import { StatusBadge } from '../../components/status-badge'
import { useRequirement } from './use-requirements'

type RequirementDetailProps = { requirementId: string }

export const RequirementDetail = ({ requirementId }: RequirementDetailProps) => {
  const { data: req, loading } = useRequirement(requirementId)
  if (loading) return <div className="p-6 text-sm text-gray-400">loading…</div>
  if (!req) return <div className="p-6 text-sm text-gray-400">requirement not found</div>
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-1.5 text-xs tracking-wider text-gray-500 uppercase">
        <span>Requirement</span>
        <span aria-hidden="true" className="text-gray-300">
          ·
        </span>
        <span className="font-mono normal-case tracking-normal text-gray-400">
          {req.id.slice(0, 8)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">{req.title}</h2>
        <StatusBadge status={req.status} />
      </div>
      {req.description && <p className="text-sm text-gray-600">{req.description}</p>}
      {req.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {req.tags.map(tag => (
            <span
              key={tag}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
